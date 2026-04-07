import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GITHUB_CLIENT_ID is not set" },
      { status: 500 },
    );
  }

  const { device_code } = await request.json();
  if (!device_code) {
    return NextResponse.json({ error: "device_code required" }, { status: 400 });
  }

  const body = new URLSearchParams({
    client_id: clientId,
    device_code,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    body,
  });

  const data = await res.json();
  if (data.access_token) {
    const response = NextResponse.json({ status: "authorized" });
    response.cookies.set({
      name: "gh_token",
      value: data.access_token,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  }

  if (data.error === "authorization_pending") {
    return NextResponse.json({ status: "pending" });
  }
  if (data.error === "slow_down") {
    return NextResponse.json({ status: "slow_down" });
  }
  if (data.error === "access_denied") {
    return NextResponse.json({ status: "denied" });
  }
  if (data.error === "expired_token") {
    return NextResponse.json({ status: "expired" });
  }

  return NextResponse.json({ status: "error" }, { status: 500 });
}
