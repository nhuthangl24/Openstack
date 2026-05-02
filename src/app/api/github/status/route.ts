import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("gh_token")?.value;

  if (!token) {
    return NextResponse.json(
      { connected: false },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "CloudDeploy",
    },
  });

  if (!response.ok) {
    const reply = NextResponse.json(
      { connected: false },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );

    reply.cookies.delete("gh_token");
    return reply;
  }

  const user = await response.json();

  return NextResponse.json(
    {
      connected: true,
      user: {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
