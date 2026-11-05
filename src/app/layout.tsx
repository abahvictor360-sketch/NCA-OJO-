import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Pwa from "@/components/Pwa";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "NCA Ojo Attendance",
  description: "Sunday attendance and follow-up for New Creation Assembly Ojo, Overcomers Parish",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2e3175",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        <Pwa />
      </body>
    </html>
  );
}
