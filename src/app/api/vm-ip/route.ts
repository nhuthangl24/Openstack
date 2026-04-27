import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { escapeShellArg } from "@/lib/openstack";

const execAsync = promisify(exec);
const OPENRC = process.env.OPENRC_PATH || "/opt/stack/devstack/openrc";
const OS_USER = process.env.OS_USERNAME || "dung";
const OS_PROJECT = process.env.OS_PROJECT_NAME || "Dung_Prj";

export const dynamic = "force-dynamic";

export async function getServerIP(serverName: string): Promise<string | null> {
  const command = `openstack server show ${escapeShellArg(serverName)} -c addresses -f value`;
  const fullCommand = `bash -c 'source ${OPENRC} ${OS_USER} ${OS_PROJECT} > /dev/null 2>&1 && ${command}'`;

  try {
    const { stdout } = await execAsync(fullCommand, { timeout: 15000 });
    const match = stdout.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
    return match ? match[1] : null;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "";

    if (message.includes("HTTP 401") || message.includes("Unauthorized")) {
      throw Object.assign(new Error("Xác thực OpenStack thất bại (401)."), {
        code: 401,
      });
    }

    if (message.includes("No server") || message.includes("HTTP 404")) {
      throw Object.assign(new Error("Không tìm thấy server tương ứng (404)."), {
        code: 404,
      });
    }

    return null;
  }
}

export async function POST(request: NextRequest) {
  const { server_name } = await request.json();

  if (!server_name) {
    return NextResponse.json(
      { success: false, error_message: "Thiếu server_name." },
      { status: 400 },
    );
  }

  try {
    const ip = await getServerIP(server_name);

    if (!ip) {
      return NextResponse.json(
        { success: false, error_message: "VM chưa được cấp IP." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, server_name, ip });
  } catch (error: unknown) {
    const errorInfo =
      error instanceof Error
        ? error
        : { message: "Không thể lấy IP của VM.", code: 500 };
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
    return NextResponse.json({ ip: "", error: "Thiếu tham số name." }, { status: 400 });
  }

  try {
    const ip = await getServerIP(serverName);
    return NextResponse.json({ ip: ip || "", status: ip ? "ACTIVE" : "BUILD" });
  } catch {
    return NextResponse.json({ ip: "", status: "BUILD" });
  }
}
