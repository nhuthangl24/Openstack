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
  const cmd = `openstack server show ${escapeShellArg(serverName)} -c addresses -f value`;
  const fullCmd = `bash -c 'source ${OPENRC} ${OS_USER} ${OS_PROJECT} > /dev/null 2>&1 && ${cmd}'`;
  try {
    const { stdout } = await execAsync(fullCmd, { timeout: 15000 });
    const m = stdout.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
    return m ? m[1] : null;
  } catch (err: any) {
    const msg: string = err.stderr || err.message || "";
    if (msg.includes("HTTP 401") || msg.includes("Unauthorized")) {
      throw Object.assign(new Error("Xác thực thất bại (401)"), { code: 401 });
    }
    if (msg.includes("No server") || msg.includes("HTTP 404")) {
      throw Object.assign(new Error("Server không tồn tại (404)"), { code: 404 });
    }
    return null; // VM chưa ACTIVE
  }
}

// POST /api/vm-ip — { server_name }
export async function POST(request: NextRequest) {
  const { server_name } = await request.json();
  if (!server_name) {
    return NextResponse.json({ success: false, error_message: "Missing server_name" }, { status: 400 });
  }
  try {
    const ip = await getServerIP(server_name);
    if (!ip) return NextResponse.json({ success: false, error_message: "VM chưa có IP" }, { status: 500 });
    return NextResponse.json({ success: true, server_name, ip });
  } catch (err: any) {
    return NextResponse.json({ success: false, error_message: err.message }, { status: err.code || 500 });
  }
}

// GET /api/vm-ip?name=<server_name> — frontend polling
export async function GET(request: NextRequest) {
  const serverName = request.nextUrl.searchParams.get("name");
  if (!serverName) return NextResponse.json({ ip: "", error: "Missing name" }, { status: 400 });
  try {
    const ip = await getServerIP(serverName);
    return NextResponse.json({ ip: ip || "", status: ip ? "ACTIVE" : "BUILD" });
  } catch {
    return NextResponse.json({ ip: "", status: "BUILD" });
  }
}
