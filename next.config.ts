import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const allowedDevOrigins = Array.from(
  new Set(
    [
      "192.168.10.11",
      "orbitstack.app",
      "www.orbitstack.app",
      "*.orbitstack.app",
      "9aea-42-114-112-109.ngrok-free.app",
      "8767-42-114-112-109.ngrok-free.app",
      ...(process.env.ALLOWED_DEV_ORIGINS || "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ],
  ),
);

const nextConfig: NextConfig = {
  allowedDevOrigins,
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
