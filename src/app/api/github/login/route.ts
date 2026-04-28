import { NextRequest, NextResponse } from "next/server";
import {
  generateOAuthState,
  generatePkcePair,
  hasGitHubOAuthConfig,
  isHttpsRequest,
} from "@/lib/github-oauth";

export async function GET(request: NextRequest) {
  const homeUrl = new URL("/", request.url);

  if (!hasGitHubOAuthConfig()) {
    homeUrl.searchParams.set("github_error", "missing_oauth_config");
    return NextResponse.redirect(homeUrl);
  }

  const clientId = process.env.GITHUB_CLIENT_ID!.trim();
  const state = generateOAuthState();
  const { verifier, challenge } = generatePkcePair();
  const secure = isHttpsRequest(request);

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", "repo read:user");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set({
    name: "gh_oauth_state",
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10,
  });
  response.cookies.set({
    name: "gh_oauth_verifier",
    value: verifier,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
