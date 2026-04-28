import { NextRequest, NextResponse } from "next/server";
import { clearGitHubAccessToken } from "@/lib/github-session";

export async function GET(request: NextRequest) {
  clearGitHubAccessToken();

  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete("gh_token");
  response.cookies.delete("gh_oauth_state");
  response.cookies.delete("gh_oauth_verifier");

  return response;
}
