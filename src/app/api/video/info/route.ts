import { NextResponse } from "next/server";
// @ts-ignore
import { create } from "yt-dlp-exec";
import path from "path";

export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Extract Video ID
    let videoId = "";
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes("youtube.com")) {
        videoId = urlObj.searchParams.get("v") || "";
      } else if (urlObj.hostname.includes("youtu.be")) {
        videoId = urlObj.pathname.slice(1);
      }
    } catch (e) {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    if (!videoId) {
      return NextResponse.json({ error: "Could not extract Video ID" }, { status: 400 });
    }

    // Use YouTube Data API if key is available
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (apiKey) {
      const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status&id=${videoId}&key=${apiKey}`;
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        return NextResponse.json({ error: "Video not found or is private." }, { status: 404 });
      }

      const video = data.items[0];
      
      // Check heuristics for copyright/restrictions
      const isEmbeddable = video.status?.embeddable;
      const licensedContent = video.contentDetails?.licensedContent;
      const regionRestriction = video.contentDetails?.regionRestriction;

      if (!isEmbeddable) {
        return NextResponse.json({ isSafe: false, reason: "Video is not embeddable, likely restricted." });
      }

      if (regionRestriction && regionRestriction.blocked) {
        return NextResponse.json({ isSafe: false, reason: "Video is region-blocked, likely due to copyright." });
      }

      // Note: licensedContent being true doesn't always mean you'll get a strike,
      // but it's a strong indicator that it belongs to a network or label.
      // We will allow it for now but the user should be aware.
      return NextResponse.json({ isSafe: true, licensedContent });
    }

    // Next.js messes up the binary path resolution, so we define it manually
    const isWin = process.platform === "win32";
    const binaryName = isWin ? "yt-dlp.exe" : "yt-dlp";
    const binaryPath = path.resolve(process.cwd(), "node_modules", "yt-dlp-exec", "bin", binaryName);
    
    // @ts-ignore
    const yt = create(binaryPath);

    // Fallback: If no API key, use yt-dlp to get metadata
    const metadata = await yt(url, {
      dumpJson: true,
      noWarnings: true,
      simulate: true,
    });

    if (metadata.is_live) {
      return NextResponse.json({ isSafe: false, reason: "Cannot process live streams." });
    }

    return NextResponse.json({ isSafe: true });

  } catch (error) {
    console.error("Error checking video info:", error);
    return NextResponse.json(
      { error: "Failed to check video info. The video might be private or unavailable." },
      { status: 500 }
    );
  }
}
