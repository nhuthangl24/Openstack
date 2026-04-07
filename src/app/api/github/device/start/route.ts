import { NextResponse } from "next/server";

export async function POST() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GITHUB_CLIENT_ID is not set" },
      { status: 500 },
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    scope: "public_repo read:user",
  });

  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "User-Agent": "CloudDeploy",
    },
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    const message = data.error_description || data.error || "Device flow failed";
    return NextResponse.json({ error: message }, { status: res.status });
  }

  return NextResponse.json(data);
}
