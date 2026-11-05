import type { NextConfig } from "next";

// Static export: the same build runs on Vercel, as an installable PWA, and inside the Windows desktop app.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
};

export default nextConfig;
