import type { Metadata } from "next";
import { IBM_Plex_Mono, DM_Sans } from "next/font/google";
import "molstar/build/viewer/molstar.css";
import "./globals.css";

const pioSans = DM_Sans({
  variable: "--font-pio-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const pioMono = IBM_Plex_Mono({
  variable: "--font-pio-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Protein Viewer",
  description: "Upload, visualize, and analyze protein structure contacts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${pioSans.variable} ${pioMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
