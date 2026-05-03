import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
// @ts-ignore
import { create } from "yt-dlp-exec";
// @ts-ignore
import ffmpeg from "fluent-ffmpeg";
// @ts-ignore
import ffmpegStatic from "ffmpeg-static";

// Next.js messes up binary path resolution, so we define it manually
const _isWin = process.platform === "win32";
const ffmpegName = _isWin ? "ffmpeg.exe" : "ffmpeg";
const ffmpegPath = path.resolve(process.cwd(), "node_modules", "ffmpeg-static", ffmpegName);
ffmpeg.setFfmpegPath(ffmpegPath);

export const maxDuration = 300; // Allow API route to run for up to 5 minutes

export async function POST(req: Request) {
  try {
    const { url, duration, numClips = "auto" } = await req.json();

    if (!url || !duration) {
      return NextResponse.json({ error: "URL and duration are required" }, { status: 400 });
    }

    // 1. Temp Folder Auto-Cleaner (Delete files older than 30 mins)
    const tempDir = path.join(process.cwd(), "temp");
    try {
      await fs.access(tempDir);
      const files = await fs.readdir(tempDir);
      const now = Date.now();
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        // 30 minutes = 1800000 ms
        if (now - stats.mtimeMs > 1800000) {
          await fs.unlink(filePath).catch(() => {});
        }
      }
    } catch {
      await fs.mkdir(tempDir, { recursive: true });
    }

    // 2. Binary Setup
    const isWin = process.platform === "win32";
    const binaryName = isWin ? "yt-dlp.exe" : "yt-dlp";
    const binaryPath = path.resolve(process.cwd(), "node_modules", "yt-dlp-exec", "bin", binaryName);
    
    // @ts-ignore
    const yt = create(binaryPath);

    // 3. Get Heatmap data to find viral hooks
    const metadata = await yt(url, {
      dumpJson: true,
      noWarnings: true,
      simulate: true,
    });

    const timestamps: number[] = [];
    const vidDuration = metadata.duration || 600;
    
    let actualNumClips = typeof numClips === "number" ? numClips : 1;
    const isAuto = numClips === "auto";

    if (metadata.heatmap && Array.isArray(metadata.heatmap) && metadata.heatmap.length > 0) {
      if (isAuto) {
        // AUTO MODE: Find all peaks with > 75% engagement, max 10 clips
        const sortedHeatmap = [...metadata.heatmap].sort((a, b) => b.value - a.value);
        for (const point of sortedHeatmap) {
          if (point.value < 0.75) break; // Stop when engagement drops below threshold
          if (timestamps.length >= 10) break; // Hard cap at 10 clips to prevent overload
          
          const isFarEnough = timestamps.every(t => Math.abs(t - point.start_time) > duration);
          if (isFarEnough) {
            let start = point.start_time - 5;
            if (start < 0) start = 0;
            timestamps.push(start);
          }
        }
        actualNumClips = timestamps.length;
        
        // Fallback if no peaks were > 0.75
        if (actualNumClips === 0) {
          timestamps.push(Math.floor(vidDuration * 0.3));
          actualNumClips = 1;
        }
      } else {
        // MANUAL MODE: Divide the video into 'numClips' equal segments
        const segmentDuration = vidDuration / actualNumClips;
        
        for (let i = 0; i < actualNumClips; i++) {
          const segmentStart = i * segmentDuration;
          const segmentEnd = (i + 1) * segmentDuration;
          
          const pointsInSegment = metadata.heatmap.filter((p: any) => p.start_time >= segmentStart && p.start_time < segmentEnd);
          
          if (pointsInSegment.length > 0) {
            const peak = pointsInSegment.reduce((prev: any, current: any) => (prev.value > current.value) ? prev : current);
            let start = peak.start_time - 5;
            if (start < 0) start = 0;
            timestamps.push(start);
          } else {
            timestamps.push(Math.floor(segmentStart + (segmentDuration / 2)));
          }
        }
      }
    } else {
      // Fallback: If no heatmap exists, evenly space the clips
      if (isAuto) actualNumClips = 1; // Default to 1 clip if we can't auto-detect
      
      for (let i = 0; i < actualNumClips; i++) {
        const fraction = (i + 1) / (actualNumClips + 1);
        timestamps.push(Math.floor(vidDuration * fraction));
      }
    }

    // Sort chronologically just to be safe
    timestamps.sort((a, b) => a - b);

    // 4. Download the best video and audio streams SEPARATELY to avoid yt-dlp merge locks and get 1080p+ quality
    const rawFileId = crypto.randomBytes(16).toString("hex");
    const rawVideoPath = path.join(tempDir, `${rawFileId}_v.mp4`);
    const rawAudioPath = path.join(tempDir, `${rawFileId}_a.m4a`);

    await yt(url, {
      output: rawVideoPath,
      format: "bestvideo[ext=mp4]/bestvideo",
      noWarnings: true,
      noPlaylist: true,
    });

    await yt(url, {
      output: rawAudioPath,
      format: "bestaudio[ext=m4a]/bestaudio",
      noWarnings: true,
      noPlaylist: true,
    });

    // 5. Process with FFmpeg to generate N clips
    const generatedFileIds: string[] = [];
    
    for (let i = 0; i < actualNumClips; i++) {
      const startTime = timestamps[i];
      const clipFileId = crypto.randomBytes(16).toString("hex");
      const outputVideoPath = path.join(tempDir, `${clipFileId}_short.mp4`);

      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(rawVideoPath)
          .seekInput(startTime) // Fast seek for video input
          .input(rawAudioPath)
          .seekInput(startTime) // Fast seek for audio input
          .setDuration(duration) // Set output duration
          .videoFilters([
            {
              filter: "crop",
              options: "ih*9/16:ih", // Crop center 9:16
            },
            {
              filter: "scale",
              options: "1080:1920", // Scale to vertical 1080p
            },
          ])
          .outputOptions([
            "-map 0:v:0",        // Explicitly take video from first input
            "-map 1:a:0",        // Explicitly take audio from second input
            "-c:v libx264",      // Use H.264 codec
            "-preset fast",      // Encoding speed vs compression ratio
            "-crf 18",           // High quality (lower is better, 18 is visually lossless)
            "-c:a aac",          // Use AAC for audio
            "-b:a 192k",         // High audio bitrate
            "-shortest"          // Ensure output ends when the shortest stream ends
          ])
          .output(outputVideoPath)
          .on("end", resolve)
          .on("error", (err: Error) => reject(err))
          .run();
      });

      generatedFileIds.push(clipFileId);
    }

    // 6. Cleanup raw files
    try {
      await fs.unlink(rawVideoPath).catch(() => {});
      await fs.unlink(rawAudioPath).catch(() => {});
    } catch (e) {
      console.error("Failed to delete raw files:", e);
    }

    return NextResponse.json({ success: true, fileIds: generatedFileIds });

  } catch (error) {
    console.error("Error processing video:", error);
    return NextResponse.json(
      { error: "Failed to process video. It might be too long or unavailable." },
      { status: 500 }
    );
  }
}
