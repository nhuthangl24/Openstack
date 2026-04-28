import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.10.11",
    "9aea-42-114-112-109.ngrok-free.app",
    "8767-42-114-112-109.ngrok-free.app"
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/**",
      },
    ],
  },
  turbopack: {
    root: rootDir,
  },
};

export default nextConfig;
