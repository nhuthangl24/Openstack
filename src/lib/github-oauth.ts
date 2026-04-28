import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";

const CALLBACK_PATH = "/api/github/callback";

export function getGitHubCallbackUrl(request: NextRequest) {
  const configured = process.env.GITHUB_CALLBACK_URL?.trim();

  if (configured) {
    return configured;
  }

  return new URL(CALLBACK_PATH, request.nextUrl.origin).toString();
}

export function hasGitHubOAuthConfig() {
  return Boolean(
    process.env.GITHUB_CLIENT_ID?.trim() &&
      process.env.GITHUB_CLIENT_SECRET?.trim(),
  );
}

export function generateOAuthState() {
  return randomBytes(32).toString("hex");
}

export function generatePkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  return { verifier, challenge };
}

export function isHttpsRequest(request: NextRequest) {
  return request.nextUrl.protocol === "https:";
}
