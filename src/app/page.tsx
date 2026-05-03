"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Scissors, AlertCircle, CheckCircle2, Download, Loader2 } from "lucide-react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "safe" | "copyrighted" | "processing" | "done">("idle");
  const [duration, setDuration] = useState<number>(15);
  const [numClips, setNumClips] = useState<number | "auto">("auto");
  const [uploadToYoutube, setUploadToYoutube] = useState<boolean>(true);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadUrls, setDownloadUrls] = useState<string[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);

  const handleCheckUrl = async () => {
    if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
      setErrorMessage("Please enter a valid YouTube URL.");
      return;
    }
    setErrorMessage("");
    setStatus("checking");
    
    try {
      // Fake API call to /api/video/info
      const res = await fetch("/api/video/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to check copyright status");
      }

      if (data.isSafe) {
        setStatus("safe");
      } else {
        setStatus("copyrighted");
        setErrorMessage("Copyrighted content detected or video is unavailable.");
      }
    } catch (e: unknown) {
      setStatus("copyrighted");
      setErrorMessage((e as Error).message || "An error occurred during checking.");
    }
  };

  const handleGenerate = async () => {
    setStatus("processing");
    setProgress(0);
    setProgressMessage("Starting backend process...");
    setDownloadUrls([]);
    setUploadedUrls([]);

    try {
      const res = await fetch("/api/video/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, duration, numClips, uploadToYoutube }),
      });

      if (!res.ok) {
        let errText = "Failed to process video";
        try {
           const json = await res.json();
           errText = json.error || errText;
        } catch(e) {}
        throw new Error(errText);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Could not start stream");
      
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // keep incomplete chunk
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.type === 'progress') {
                setProgress(Math.round(data.progress));
                setProgressMessage(data.message);
              } else if (data.type === 'done') {
                setProgress(100);
                setStatus("done");
                if (data.fileIds) {
                  setDownloadUrls(data.fileIds.map((id: string) => `/api/video/download?fileId=${id}`));
                }
                if (data.uploadedUrls) {
                  setUploadedUrls(data.uploadedUrls);
                }
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (err: any) {
              // Ignore simple parse errors if JSON is chunked weirdly, but throw our explicit error
              if (line.includes('"type":"error"')) throw err;
            }
          }
        }
      }
    } catch (e: unknown) {
      setStatus("safe");
      setErrorMessage((e as Error).message || "An error occurred during processing.");
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 sm:p-24 relative overflow-hidden">
      
      {/* Background decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-600/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="z-10 flex flex-col items-center w-full max-w-2xl text-center space-y-8"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center space-x-3 text-4xl font-extrabold tracking-tight">
            <Scissors className="w-10 h-10 text-purple-500" />
            <h1 className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-500">
              YT Clipper
            </h1>
          </div>
          <p className="text-muted-foreground text-lg sm:text-xl max-w-xl mx-auto">
            Convert any YouTube video into a high-quality vertical Short. Automatically cropped and checked for copyright restrictions.
          </p>
        </div>

        <div className="w-full bg-secondary/30 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          
          {/* Input Section */}
          <div className="space-y-3 text-left">
            <label className="text-sm font-medium text-gray-300">YouTube URL</label>
            <div className="flex space-x-3">
              <input
                type="text"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (status !== "idle" && status !== "checking") {
                    setStatus("idle");
                    setErrorMessage("");
                  }
                }}
                disabled={status === "checking" || status === "processing"}
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all disabled:opacity-50"
              />
              <button
                onClick={handleCheckUrl}
                disabled={!url || status === "checking" || status === "processing"}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center shadow-lg shadow-purple-500/20"
              >
                {status === "checking" ? <Loader2 className="w-5 h-5 animate-spin" /> : "Analyze"}
              </button>
            </div>
            {errorMessage && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-red-400 text-sm flex items-center mt-2">
                <AlertCircle className="w-4 h-4 mr-2" />
                {errorMessage}
              </motion.p>
            )}
          </div>

          <AnimatePresence mode="wait">
            {/* Safe / Success State -> Show Duration Selection */}
            {status === "safe" && (
              <motion.div
                key="safe-settings"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-6 overflow-hidden pt-4 border-t border-white/10 text-left"
              >
                <div className="flex items-center text-green-400 text-sm font-medium">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Video is safe to process (No immediate restrictions found)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Shorts Duration</label>
                    <select
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                    >
                      <option value={15} className="bg-gray-900">15 Seconds</option>
                      <option value={30} className="bg-gray-900">30 Seconds</option>
                      <option value={45} className="bg-gray-900">45 Seconds</option>
                      <option value={60} className="bg-gray-900">60 Seconds</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-300">Number of Viral Clips</label>
                    <select
                      value={numClips}
                      onChange={(e) => setNumClips(e.target.value === "auto" ? "auto" : Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    >
                      <option value="auto" className="bg-gray-900 font-bold text-blue-400">✨ Auto Detect</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <option key={num} value={num} className="bg-gray-900">
                          {num} Clip{num > 1 ? 's' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2 mt-4">
                  <label className="text-sm font-medium text-gray-300">Action</label>
                  <select
                    value={uploadToYoutube ? "upload" : "generate"}
                    onChange={(e) => setUploadToYoutube(e.target.value === "upload")}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500 transition-all"
                  >
                    <option value="upload" className="bg-gray-900">Generate + Upload to YouTube</option>
                    <option value="generate" className="bg-gray-900">Generate Only (Download Locally)</option>
                  </select>
                </div>

                <button
                  onClick={handleGenerate}
                  className="w-full bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white font-bold py-4 rounded-xl transition-all flex justify-center items-center shadow-xl shadow-purple-500/20"
                >
                  <Scissors className="w-5 h-5 mr-2" />
                  Generate {numClips === "auto" ? "Auto-Viral Shorts" : `${numClips} Auto-Viral Short${numClips !== 1 ? 's' : ''}`}
                </button>

              </motion.div>
            )}

            {/* Processing State */}
            {status === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 overflow-hidden pt-4 border-t border-white/10 text-left"
              >
                <div className="flex justify-between text-sm font-medium text-gray-300">
                  <span>Processing Video...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-black/40 rounded-full h-3 border border-white/5 overflow-hidden">
                  <motion.div
                    className="bg-gradient-to-r from-purple-500 to-blue-500 h-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ ease: "easeInOut" }}
                  />
                </div>
                <p className="text-sm font-medium text-blue-400 text-center animate-pulse">
                  {progressMessage}
                </p>
              </motion.div>
            )}

            {/* Done State */}
            {status === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-6 overflow-hidden pt-4 border-t border-white/10 text-center"
              >
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-2">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-white">Your Shorts are Ready!</h3>
                <div className="space-y-3">
                  {downloadUrls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      download
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-all flex justify-center items-center shadow-lg shadow-green-600/20"
                    >
                      <Download className="w-5 h-5 mr-2" />
                      Download Viral Clip {i + 1}
                    </a>
                  ))}
                  
                  {uploadedUrls.length > 0 && (
                    <div className="pt-4 border-t border-white/10 space-y-3">
                      <h4 className="text-sm font-semibold text-gray-300">Successfully Uploaded to YouTube:</h4>
                      {uploadedUrls.map((url, i) => (
                        <a
                          key={`yt-${i}`}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-all flex justify-center items-center shadow-lg shadow-red-600/20"
                        >
                          View Short {i + 1} on YouTube
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setStatus("safe");
                    setProgress(0);
                  }}
                  className="text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Create another version
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </main>
  );
}
