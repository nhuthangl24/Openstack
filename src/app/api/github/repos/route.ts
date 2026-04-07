import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("gh_token")?.value;
  if (!token) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "CloudDeploy",
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const message = data.message || "GitHub API error";
    return NextResponse.json({ error: message }, { status: res.status });
  }

  const repos = await res.json();
  const simplified = (repos || []).map((repo: any) => ({
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    clone_url: repo.clone_url,
    html_url: repo.html_url,
    default_branch: repo.default_branch,
  }));

  return NextResponse.json({ repos: simplified });
}
