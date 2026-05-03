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
import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from "googleapis";
import * as fsSync from "fs";

// Next.js messes up binary path resolution, so we define it manually
const _isWin = process.platform === "win32";
const ffmpegName = _isWin ? "ffmpeg.exe" : "ffmpeg";
const ffmpegPath = path.resolve(process.cwd(), "node_modules", "ffmpeg-static", ffmpegName);
ffmpeg.setFfmpegPath(ffmpegPath);

export const maxDuration = 300; // Allow API route to run for up to 5 minutes

export async function POST(req: Request) {
  const { url, duration, numClips = "auto", uploadToYoutube = true } = await req.json();

  if (!url || !duration) {
    return NextResponse.json({ error: "URL and duration are required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // 1. Temp Folder Auto-Cleaner
        sendEvent({ type: 'progress', message: 'Initializing environment...', progress: 5 });
        const tempDir = path.join(process.cwd(), "temp");
        try {
          await fs.access(tempDir);
          const files = await fs.readdir(tempDir);
          const now = Date.now();
          for (const file of files) {
            const filePath = path.join(tempDir, file);
            const stats = await fs.stat(filePath);
            if (now - stats.mtimeMs > 1800000) {
              await fs.unlink(filePath).catch(() => { });
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
        sendEvent({ type: 'progress', message: 'Analyzing heatmap for viral hooks...', progress: 10 });
        const metadata = await yt(url, {
          dumpJson: true,
          noWarnings: true,
          simulate: true,
        });

        const isMusic = metadata.categories && metadata.categories.includes("Music");

        const timestamps: number[] = [];
        const vidDuration = metadata.duration || 600;

        let actualNumClips = typeof numClips === "number" ? numClips : 1;
        const isAuto = numClips === "auto";

        const heatmapData = (metadata as any).heatmap;
        if (heatmapData && Array.isArray(heatmapData) && heatmapData.length > 0) {
          if (isAuto) {
            const sortedHeatmap = [...heatmapData].sort((a: any, b: any) => b.value - a.value);
            for (const point of sortedHeatmap) {
              if (point.value < 0.75) break;
              if (timestamps.length >= 10) break;

              const isFarEnough = timestamps.every(t => Math.abs(t - point.start_time) > duration);
              if (isFarEnough) {
                let start = point.start_time - 5;
                if (start < 0) start = 0;
                timestamps.push(start);
              }
            }
            actualNumClips = timestamps.length;
            if (actualNumClips === 0) {
              timestamps.push(Math.floor(vidDuration * 0.3));
              actualNumClips = 1;
            }
          } else {
            const segmentDuration = vidDuration / actualNumClips;
            for (let i = 0; i < actualNumClips; i++) {
              const segmentStart = i * segmentDuration;
              const segmentEnd = (i + 1) * segmentDuration;
              const pointsInSegment = heatmapData.filter((p: any) => p.start_time >= segmentStart && p.start_time < segmentEnd);
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
          if (isAuto) actualNumClips = 1;
          for (let i = 0; i < actualNumClips; i++) {
            const fraction = (i + 1) / (actualNumClips + 1);
            timestamps.push(Math.floor(vidDuration * fraction));
          }
        }
        timestamps.sort((a, b) => a - b);

        sendEvent({ type: 'progress', message: `Found ${actualNumClips} viral hooks. Downloading 1080p source video...`, progress: 20 });

        // 4. Download best video and audio streams
        const rawFileId = crypto.randomBytes(16).toString("hex");
        const rawVideoPath = path.join(tempDir, `${rawFileId}_v.mp4`);
        const rawAudioPath = path.join(tempDir, `${rawFileId}_a.m4a`);

        sendEvent({ type: 'progress', message: 'Downloading 1080p source video and checking for subtitles...', progress: 20 });

        const videoOptions: any = {
          output: rawVideoPath,
          format: "bestvideo[ext=mp4]/bestvideo",
          noWarnings: true,
          noPlaylist: true,
        };

        if (!isMusic) {
          videoOptions.writeAutoSubs = true;
          videoOptions.writeSubs = true;
          videoOptions.subLangs = 'en';
        } else {
          sendEvent({ type: 'progress', message: 'Music video detected. Skipping subtitles...', progress: 22 });
        }

        await yt(url, videoOptions);

        sendEvent({ type: 'progress', message: 'Downloading high-fidelity audio...', progress: 30 });

        await yt(url, {
          output: rawAudioPath,
          format: "bestaudio[ext=m4a]/bestaudio",
          noWarnings: true,
          noPlaylist: true,
        });

        let hasSubtitles = false;
        let rawSubtitlePath = "";
        let subtitleExt = "";

        if (!isMusic) {
          const files = await fs.readdir(tempDir);
          const downloadedSub = files.find(f => f.startsWith(`${rawFileId}_v`) && (f.endsWith('.vtt') || f.endsWith('.srt')));
          if (downloadedSub) {
            subtitleExt = downloadedSub.endsWith('.vtt') ? '.vtt' : '.srt';
            rawSubtitlePath = path.join(tempDir, `${rawFileId}${subtitleExt}`);
            await fs.rename(path.join(tempDir, downloadedSub), rawSubtitlePath);
            hasSubtitles = true;
            sendEvent({ type: 'progress', message: 'Subtitles successfully extracted!', progress: 35 });
          } else {
            sendEvent({ type: 'progress', message: 'No English subtitles found for this video.', progress: 35 });
          }
        }

        // 5. Process with FFmpeg to generate N clips
        const generatedFileIds: string[] = [];
        const uploadedUrls: string[] = [];

        const baseProgressForProcessing = 40;
        const progressPerClip = 50 / actualNumClips; // Leave 10% for final cleanup

        for (let i = 0; i < actualNumClips; i++) {
          const currentProgress = baseProgressForProcessing + (i * progressPerClip);
          sendEvent({ type: 'progress', message: `Clipping video ${i + 1} of ${actualNumClips}...`, progress: currentProgress });

          const startTime = timestamps[i];
          const clipFileId = crypto.randomBytes(16).toString("hex");
          const outputVideoPath = path.join(tempDir, `${clipFileId}_short.mp4`);
          let clipSubPath = "";

          const videoFilters: any[] = [
            { filter: "crop", options: "ih*9/16:ih" },
            { filter: "scale", options: "1080:1920" },
          ];

          if (hasSubtitles) {
            try {
              clipSubPath = path.join(tempDir, `${clipFileId}.srt`);
              const rawSubContent = await fs.readFile(rawSubtitlePath, 'utf-8');

              const lines = rawSubContent.split('\n');
              const wordMap = new Map();

              // Parse YouTube VTT tags to extract exact word-level timestamps
              for (let j = 0; j < lines.length; j++) {
                const line = lines[j];
                if (line.includes('-->')) {
                  const timeRegex = /(?:(\d{2}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})[,.](\d{3})/;
                  const timeMatch = line.match(timeRegex);
                  if (timeMatch && j + 1 < lines.length) {
                    const startH = timeMatch[1] ? parseInt(timeMatch[1]) : 0;
                    const blockStart = startH * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;

                    let textLine = lines[j + 1];
                    if (j + 2 < lines.length && lines[j + 2].trim() !== '' && !lines[j + 2].includes('-->')) {
                      textLine += ' ' + lines[j + 2]; // handle multi-line cues
                    }

                    // Strip formatting tags but keep the internal time tags
                    let cleaned = textLine.replace(/<c\.color[^>]*>/g, '')
                      .replace(/<\/c>/g, '')
                      .replace(/<c>/g, '')
                      .replace(/<\/?[bi]>/g, '')
                      .replace(/[\u200B-\u200D\uFEFF]/g, '');

                    let currentWordTime = blockStart;
                    const parts = cleaned.split(/(<(?:(?:\d{2}):)?\d{2}:\d{2}[,.]\d{3}>)/);

                    for (const part of parts) {
                      if (part.startsWith('<') && part.endsWith('>')) {
                        const tMatch = part.match(/<(?:(\d{2}):)?(\d{2}):(\d{2})[,.](\d{3})>/);
                        if (tMatch) {
                          const h = tMatch[1] ? parseInt(tMatch[1]) : 0;
                          currentWordTime = h * 3600 + parseInt(tMatch[2]) * 60 + parseInt(tMatch[3]) + parseInt(tMatch[4]) / 1000;
                        }
                      } else {
                        const textWords = part.trim().split(/\s+/);
                        for (let wIndex = 0; wIndex < textWords.length; wIndex++) {
                          const w = textWords[wIndex];
                          if (w) {
                            // Deduplicate using timestamp as unique key
                            const key = `${currentWordTime.toFixed(3)}_${wIndex}_${w}`;
                            wordMap.set(key, { time: currentWordTime, word: w });
                          }
                        }
                      }
                    }
                  }
                }
              }

              // Sort words chronologically
              const wordsArray = Array.from(wordMap.values()).sort((a, b) => a.time - b.time);

              // Chunking logic for short-form video (max 2 lines, ~3-4 words per line)
              const MAX_WORDS_PER_LINE = 4;
              const MAX_LINES = 2;
              const MAX_WORDS_PER_CHUNK = MAX_WORDS_PER_LINE * MAX_LINES;

              let chunks = [];
              let currentChunk = [];

              for (let j = 0; j < wordsArray.length; j++) {
                const wObj = wordsArray[j];
                if (wObj.time < startTime - 1 || wObj.time > startTime + duration + 5) continue;

                currentChunk.push(wObj);

                let shouldBreak = false;
                if (currentChunk.length >= MAX_WORDS_PER_CHUNK) shouldBreak = true;
                if (wObj.word.match(/[.!?]$/)) shouldBreak = true; // Natural pause
                if (wObj.word.match(/[,]$/) && currentChunk.length >= 3) shouldBreak = true; // Soft pause

                // Break if there's a long gap of silence before next word
                if (j + 1 < wordsArray.length) {
                  const nextWObj = wordsArray[j + 1];
                  if (nextWObj.time - wObj.time > 1.0) shouldBreak = true;
                }

                if (shouldBreak || j === wordsArray.length - 1) {
                  const chunkStart = Math.max(0, currentChunk[0].time - startTime);
                  let chunkEnd;
                  if (j + 1 < wordsArray.length) {
                    chunkEnd = Math.max(0, wordsArray[j + 1].time - startTime);
                  } else {
                    chunkEnd = chunkStart + 2;
                  }

                  let line1 = [];
                  let line2 = [];
                  for (let k = 0; k < currentChunk.length; k++) {
                    if (k < MAX_WORDS_PER_LINE) line1.push(currentChunk[k].word);
                    else line2.push(currentChunk[k].word);
                  }

                  let text = line1.join(' ');
                  if (line2.length > 0) text += '\n' + line2.join(' ');

                  // Sentence case
                  if (text.length > 0) {
                    text = text.charAt(0).toUpperCase() + text.slice(1);
                  }

                  chunks.push({ start: chunkStart, end: chunkEnd, text: text });
                  currentChunk = [];
                }
              }

              const formatSrtTime = (seconds: number) => {
                const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
                const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
                const s = String(Math.floor(seconds % 60)).padStart(2, '0');
                const ms = String(Math.floor((seconds % 1) * 1000)).padStart(3, '0');
                return `${h}:${m}:${s},${ms}`;
              };

              let srtContent = "";
              for (let j = 0; j < chunks.length; j++) {
                const c = chunks[j];
                if (c.end <= c.start) c.end = c.start + 0.5;
                
                // Highlight numbers with a different color (Red: #FF0000)
                // The \b ensures we only match numbers. We include decimals too.
                let highlightedText = c.text.replace(/\b(\d+(?:[.,]\d+)?)\b/g, '<font color="#FF0000">$1</font>');
                
                srtContent += `${j + 1}\n`;
                srtContent += `${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n`;
                srtContent += `${highlightedText}\n\n`;
              }

              await fs.writeFile(clipSubPath, srtContent);
              const relativeSubPath = `temp/${clipFileId}.srt`;
              videoFilters.push({
                filter: "subtitles",
                options: `${relativeSubPath}:force_style='Alignment=2,MarginV=40,FontSize=16,PrimaryColour=&H0000FFFF,Outline=3,Shadow=1,Bold=1'`
              });
            } catch (err) {
              console.error("Subtitle slice failed:", err);
            }
          }

          await new Promise((resolve, reject) => {
            ffmpeg()
              .input(rawVideoPath)
              .seekInput(startTime)
              .input(rawAudioPath)
              .seekInput(startTime)
              .setDuration(duration)
              .videoFilters(videoFilters)
              .outputOptions([
                "-map 0:v:0", "-map 1:a:0",
                "-c:v libx264", "-preset fast", "-crf 18",
                "-c:a aac", "-b:a 192k", "-shortest"
              ])
              .output(outputVideoPath)
              .on("end", resolve)
              .on("error", (err: Error) => reject(err))
              .run();
          });

          if (hasSubtitles && clipSubPath) {
            await fs.unlink(clipSubPath).catch(() => { });
          }

          generatedFileIds.push(clipFileId);

          // Gemini & YouTube logic
          sendEvent({ type: 'progress', message: `Generating metadata for clip ${i + 1} using Gemini AI...`, progress: currentProgress + (progressPerClip * 0.3) });
          try {
            const geminiKey = process.env.GEMINI_API_KEY;
            let ytTitle = `${metadata.title?.substring(0, 50) || "Viral Clip"} - Short`;
            let ytDesc = `Check out this awesome clip!`;
            let ytTags = ["shorts", "viral", "clip"];

            if (geminiKey) {
              const genAI = new GoogleGenerativeAI(geminiKey);
              const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
              const prompt = `I am creating a YouTube Short from a video titled "${metadata.title}". The description is: "${metadata.description?.substring(0, 500) || ""}". Generate an engaging YouTube Short title (max 60 chars), a description that is exactly 4 lines long, and exactly 30 relevant hashtags. Return ONLY a raw JSON object with keys: "title", "description" (string containing newline characters for the 4 lines), "tags" (array of exactly 30 strings). No markdown formatting.`;

              try {
                const result = await model.generateContent({
                  contents: [{ role: 'user', parts: [{ text: prompt }] }],
                  generationConfig: { responseMimeType: "application/json" }
                });
                const responseText = result.response.text();
                const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  const parsed = JSON.parse(jsonMatch[0]);
                  ytTitle = parsed.title || ytTitle;
                  ytDesc = parsed.description || ytDesc;
                  ytTags = parsed.tags || ytTags;
                }
              } catch (geminiError) {
                console.error("Gemini metadata generation failed:", geminiError);
              }
            }

            // Format tags to be visible in the description!
            const visibleHashtags = ytTags.map(tag => tag.startsWith('#') ? tag : `#${tag.replace(/\s+/g, '')}`).join(' ');
            const finalDescription = `${ytDesc}\n\n${visibleHashtags}`;

            // Limit YouTube metadata tags array to 10 to avoid 400 Bad Request error
            const apiTags = ytTags.slice(0, 10);

            if (uploadToYoutube) {
              sendEvent({ type: 'progress', message: `Uploading clip ${i + 1} to YouTube...`, progress: currentProgress + (progressPerClip * 0.6) });
              const ytClientId = process.env.YOUTUBE_CLIENT_ID;
              const ytClientSecret = process.env.YOUTUBE_CLIENT_SECRET;
              const ytRefreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

              if (ytClientId && ytClientSecret && ytRefreshToken) {
                const oauth2Client = new google.auth.OAuth2(ytClientId, ytClientSecret);
                oauth2Client.setCredentials({ refresh_token: ytRefreshToken });
                const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

                const res = await youtube.videos.insert({
                  part: ['snippet', 'status'],
                  requestBody: {
                    snippet: {
                      title: ytTitle,
                      description: finalDescription,
                      tags: apiTags,
                      categoryId: '24'
                    },
                    status: {
                      privacyStatus: 'public',
                      selfDeclaredMadeForKids: false
                    }
                  },
                  media: {
                    body: fsSync.createReadStream(outputVideoPath)
                  }
                });

                if (res.data.id) {
                  uploadedUrls.push(`https://youtube.com/shorts/${res.data.id}`);
                }
              }
            } else {
              sendEvent({ type: 'progress', message: `Skipping YouTube upload for clip ${i + 1}...`, progress: currentProgress + (progressPerClip * 0.6) });
            }
          } catch (uploadError) {
            console.error("Upload process failed for clip:", uploadError);
          }
        }

        // 6. Cleanup raw files
        sendEvent({ type: 'progress', message: 'Cleaning up temporary files...', progress: 95 });
        try {
          await fs.unlink(rawVideoPath).catch(() => { });
          await fs.unlink(rawAudioPath).catch(() => { });
          if (hasSubtitles && rawSubtitlePath) await fs.unlink(rawSubtitlePath).catch(() => { });
        } catch (e) { }

        sendEvent({ type: 'progress', message: 'All done!', progress: 100 });
        sendEvent({ type: 'done', fileIds: generatedFileIds, uploadedUrls });

        controller.close();
      } catch (error: any) {
        console.error("Error processing video:", error);
        sendEvent({ type: 'error', error: error.message || "Failed to process video." });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
