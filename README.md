# Viral Shorts Clipper (ytclipper)

An intelligent, high-performance web application built with Next.js that automatically converts YouTube videos into engaging 1080x1920 vertical Shorts. 

## Features

- **Auto Detect Mode**: Uses a heatmap-based peak detection algorithm to automatically identify viral segments and engagement hooks from long-form content.
- **Manual Mode**: Gives creators full control to select up to 10 custom clips for batch processing.
- **Perfect Lip-Sync**: Uses separate stream mapping for audio and video to ensure they remain perfectly synced during the aspect ratio conversion and clipping process.
- **High-Performance Pipeline**: Fast downloading and processing leveraging `yt-dlp` and `FFmpeg`.
- **Auto-Cleanup**: Built-in temporary file management that automatically cleans up storage after generating the clips.
- **Modern UI**: A responsive, beautiful frontend built with Tailwind CSS, Framer Motion, and Lucide React.

## Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Video Processing**: [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) with `ffmpeg-static`
- **YouTube Downloader**: [yt-dlp-exec](https://github.com/microlinkhq/youtube-dl-exec)

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- Optional: Global FFmpeg installation (the project uses `ffmpeg-static` by default, but system FFmpeg can provide better performance in some environments).

### Installation

1. Clone the repository and navigate to the project directory.
2. Install the dependencies:
```bash
npm install
```

3. Configure environment variables (if required, check `.env.local`).

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Troubleshooting

- **EBUSY Error on Windows**: If you are running the project inside a OneDrive-synced folder on Windows, you might occasionally encounter an `EBUSY: resource busy or locked` error during development. To resolve this, pause OneDrive syncing while developing or move the project out of the OneDrive folder.

## License

MIT
