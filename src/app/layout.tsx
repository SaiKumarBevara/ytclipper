import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "YT Clipper - YouTube to Shorts Converter",
  description: "Convert your YouTube videos into high-quality vertical Shorts automatically.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-gradient-animate antialiased text-foreground`}>
        {children}
      </body>
    </html>
  );
}
