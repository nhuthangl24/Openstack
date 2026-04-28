import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.10.11"],
  images: {
    remotePatterns: [new URL("https://avatars.githubusercontent.com/**")],
  },
  turbopack: {
    root: rootDir,
  },
};

export default nextConfig;
