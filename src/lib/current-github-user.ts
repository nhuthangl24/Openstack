import type { NextRequest } from "next/server";

export interface CurrentGitHubUser {
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
  htmlUrl: string;
}

export async function getCurrentGitHubUser(
  request: NextRequest,
): Promise<CurrentGitHubUser | null> {
  const token = request.cookies.get("gh_token")?.value;

  if (!token) {
    return null;
  }

  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "OrbitStack-DatabaseHosting",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const profile = (await response.json()) as {
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string;
    html_url: string;
  };

  return {
    login: profile.login,
    name: profile.name,
    email: profile.email,
    avatarUrl: profile.avatar_url,
    htmlUrl: profile.html_url,
  } satisfies CurrentGitHubUser;
}
