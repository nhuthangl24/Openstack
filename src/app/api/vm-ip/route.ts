import { NextRequest, NextResponse } from "next/server";
import { getServerIP } from "@/lib/openstack";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { server_name } = await request.json();

  if (!server_name) {
    return NextResponse.json(
      { success: false, error_message: "Thieu server_name." },
      { status: 400 },
    );
  }

  try {
    const ip = await getServerIP(server_name);

    if (!ip) {
      return NextResponse.json(
        { success: false, error_message: "VM chua duoc cap IP." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, server_name, ip });
  } catch (error: unknown) {
    const errorInfo =
      error instanceof Error
        ? error
        : { message: "Khong the lay IP cua VM.", code: 500 };

    return NextResponse.json(
      { success: false, error_message: errorInfo.message },
      {
        status:
          typeof (errorInfo as { code?: number }).code === "number"
            ? (errorInfo as { code?: number }).code!
            : 500,
      },
    );
  }
}

export async function GET(request: NextRequest) {
  const serverName = request.nextUrl.searchParams.get("name");

  if (!serverName) {
    return NextResponse.json({ ip: "", error: "Thieu tham so name." }, { status: 400 });
  }

  try {
    const ip = await getServerIP(serverName);
    return NextResponse.json({ ip: ip || "", status: ip ? "ACTIVE" : "BUILD" });
  } catch {
    return NextResponse.json({ ip: "", status: "BUILD" });
  }
}
