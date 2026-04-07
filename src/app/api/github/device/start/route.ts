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
    },
    body,
  });

  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: "Device flow failed" }, { status: 500 });
  }

  return NextResponse.json(data);
}
