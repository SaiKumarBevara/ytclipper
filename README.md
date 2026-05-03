# Viral Shorts Clipper (ytclipper)

An intelligent, high-performance web application built with Next.js that automatically converts YouTube videos into engaging 1080x1920 vertical Shorts. 

## Features

- **Real-Time Progress UI**: Uses Server-Sent Events (SSE) to stream live progress updates (downloading, cropping, metadata generation, uploading) directly to the user interface so you never have to guess what the backend is doing.
- **AI Metadata Generation**: Automatically generates engaging, context-aware titles, descriptions, and hashtags for each Short using the **Gemini 1.5 Flash API**.
- **Automated YouTube Uploads**: Seamlessly uploads the generated clips directly to your YouTube channel as Public Shorts using OAuth 2.0. The UI instantly displays a link to view your live YouTube video upon completion!
- **Auto Detect Mode**: Uses a heatmap-based peak detection algorithm to automatically identify viral segments and engagement hooks from long-form content.
- **Manual Mode**: Gives creators full control to select up to 10 custom clips for batch processing.
- **Perfect Lip-Sync**: Uses separate stream mapping for audio and video to ensure they remain perfectly synced during the aspect ratio conversion and clipping process.
- **High-Performance Pipeline**: Fast downloading and processing leveraging `yt-dlp` and `FFmpeg`.
- **Auto-Cleanup**: Built-in temporary file management that automatically cleans up local storage immediately after a successful YouTube upload.

## Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)
- **Video Processing**: [fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) with `ffmpeg-static`
- **YouTube Downloader**: [yt-dlp-exec](https://github.com/microlinkhq/youtube-dl-exec)
- **AI Integration**: [@google/generative-ai](https://www.npmjs.com/package/@google/generative-ai)

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- Optional: Global FFmpeg installation (the project uses `ffmpeg-static` by default).

### Installation

1. Clone the repository and navigate to the project directory.
2. Install the dependencies:
```bash
npm install
```

### Environment Variables & API Keys

To use the automated YouTube upload and Gemini metadata generation features, you need to configure your API keys. Create a `.env.local` file in the root of the project with the following structure:

```bash
GEMINI_API_KEY="your-gemini-key"
YOUTUBE_CLIENT_ID="your-youtube-client-id"
YOUTUBE_CLIENT_SECRET="your-youtube-client-secret"
YOUTUBE_REFRESH_TOKEN=""
```

#### 1. Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Create an API Key and paste it into `GEMINI_API_KEY`.

#### 2. YouTube Data API Credentials
To automatically upload videos to your channel, you need an OAuth 2.0 client:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Navigate to **APIs & Services > Library**, search for "YouTube Data API v3", and enable it.
4. Go to **APIs & Services > OAuth consent screen**. Choose "External" (or Internal if you have a Google Workspace) and fill out the required fields. Add yourself as a Test User.
5. Go to **APIs & Services > Credentials**. Click "Create Credentials" -> "OAuth client ID".
6. Choose **Web application**. Under "Authorized redirect URIs", add `http://localhost`.
7. Click Create. You will get a **Client ID** and **Client Secret**. Add them to your `.env.local` file.

#### 3. Obtaining the YouTube Refresh Token
Once you have the Client ID and Secret, you need a Refresh Token to allow the app to upload in the background automatically:

1. In your terminal, run the included helper script, passing your Client ID and Secret:
```powershell
$env:YOUTUBE_CLIENT_ID="your-client-id"
$env:YOUTUBE_CLIENT_SECRET="your-client-secret"
node scripts/get-youtube-token.js
```
2. Follow the prompt: click the URL provided in the terminal, log into your Google Account, and authorize the app.
3. You will be redirected to `localhost` with a `code` in the URL (e.g., `http://localhost/?iss=...&code=4/0A...`).
4. Copy **just the code string** (e.g., `4/0AeoWuM8...`) from the URL, paste it into your terminal, and press Enter.
5. **Success!** The script will output your Refresh Token and automatically save it into your `.env.local` file!

### Start the Application

Once your `.env.local` is fully configured (all 4 variables exist), start the development server:
```bash
npm run dev
```
*(Note: If you add or change keys in `.env.local` while the server is running, you must restart the server using `Ctrl+C` and running `npm run dev` again!)*

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Troubleshooting

- **YouTube Upload 400 Error (Quota Exceeded)**: If you see an error saying `The user has exceeded the number of videos they may upload`, you have hit your YouTube API daily upload limit (typically ~6 videos per day, or fewer for brand new channels). The quota resets at midnight Pacific Time. In the meantime, you can use the UI to download the generated clips locally.
- **No Hashtags/Default Description**: If your uploaded YouTube video contains the default fallback description ("Check out this awesome clip!"), it means your `GEMINI_API_KEY` is missing or the server wasn't restarted after adding it.
- **EBUSY Error on Windows**: If you are running the project inside a OneDrive-synced folder on Windows, you might occasionally encounter an `EBUSY: resource busy or locked` error during development. To resolve this, pause OneDrive syncing while developing or move the project out of the OneDrive folder.

## License

MIT
