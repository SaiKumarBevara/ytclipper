import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { createReadStream } from "fs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("fileId");

    if (!fileId || typeof fileId !== "string" || !/^[a-f0-9]{32}$/i.test(fileId)) {
      return NextResponse.json({ error: "Invalid fileId" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "temp", `${fileId}_short.mp4`);

    try {
      await fs.access(filePath);
    } catch {
      return NextResponse.json({ error: "File not found or expired" }, { status: 404 });
    }

    const stats = await fs.stat(filePath);
    
    // Convert fs ReadStream to Web ReadableStream
    const fileStream = createReadStream(filePath);
    const stream = new ReadableStream({
      start(controller) {
        fileStream.on("data", (chunk) => controller.enqueue(chunk));
        fileStream.on("end", () => controller.close());
        fileStream.on("error", (err) => controller.error(err));
      },
      cancel() {
        fileStream.destroy();
      }
    });

    // In a production app, we would use a cron job to delete temp files.
    // Here we'll delete it immediately after starting the stream, or schedule deletion.
    // We'll schedule deletion after 5 minutes to ensure download completes.
    setTimeout(async () => {
      try {
        await fs.unlink(filePath);
      } catch (e) {}
    }, 5 * 60 * 1000);

    return new NextResponse(stream, {
      headers: {
        "Content-Disposition": `attachment; filename="short_${fileId.substring(0, 8)}.mp4"`,
        "Content-Type": "video/mp4",
        "Content-Length": stats.size.toString(),
      },
    });

  } catch (error) {
    console.error("Error downloading video:", error);
    return NextResponse.json({ error: "Failed to download video" }, { status: 500 });
  }
}
