import { NextRequest, NextResponse } from "next/server";
import { setGitHubAccessToken } from "@/lib/github-session";
import { hasGitHubOAuthConfig, isHttpsRequest } from "@/lib/github-oauth";

function buildErrorRedirect(request: NextRequest, code: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("github_error", code);
  return url;
}

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(buildErrorRedirect(request, "oauth_denied"));
  }

  if (!hasGitHubOAuthConfig()) {
    return NextResponse.redirect(
      buildErrorRedirect(request, "missing_oauth_config"),
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get("gh_oauth_state")?.value;
  const verifier = request.cookies.get("gh_oauth_verifier")?.value;

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    const response = NextResponse.redirect(
      buildErrorRedirect(request, "oauth_state_mismatch"),
    );
    response.cookies.delete("gh_oauth_state");
    response.cookies.delete("gh_oauth_verifier");
    return response;
  }

  const clientId = process.env.GITHUB_CLIENT_ID!.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET!.trim();
  const secure = isHttpsRequest(request);

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: verifier,
  });

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "User-Agent": "CloudDeploy",
    },
    body,
  });

  const tokenData = await tokenResponse.json().catch(() => ({}));

  if (!tokenResponse.ok || !tokenData.access_token) {
    const response = NextResponse.redirect(
      buildErrorRedirect(request, "oauth_exchange_failed"),
    );
    response.cookies.delete("gh_oauth_state");
    response.cookies.delete("gh_oauth_verifier");
    return response;
  }

  const profileResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "CloudDeploy",
    },
  });

  if (!profileResponse.ok) {
    const response = NextResponse.redirect(
      buildErrorRedirect(request, "oauth_user_fetch_failed"),
    );
    response.cookies.delete("gh_oauth_state");
    response.cookies.delete("gh_oauth_verifier");
    return response;
  }

  setGitHubAccessToken(tokenData.access_token);

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.set({
    name: "gh_token",
    value: tokenData.access_token,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  response.cookies.delete("gh_oauth_state");
  response.cookies.delete("gh_oauth_verifier");

  return response;
}
