import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { getOpenStackEnv, escapeShellArg } from "@/lib/openstack";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

/**
 * Lấy IP của server theo tên.
 * Dùng: openstack server show <name> -c addresses -f value
 * Output: "public=192.168.1.10, ::1" → parse IPv4
 */
export async function getServerIP(
  serverName: string,
  envVars: Record<string, string>
): Promise<string | null> {
  const cmd = `openstack server show ${escapeShellArg(serverName)} -c addresses -f value`;
  try {
    const { stdout } = await execAsync(`bash -c '${cmd}'`, {
      timeout: 15000,
      env: { ...process.env, OS_CLOUD: "", ...envVars },
    });
    const ipv4 = stdout.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
    return ipv4 ? ipv4[1] : null;
  } catch (err: any) {
    const msg: string = err.stderr || err.message || "";
    if (msg.includes("HTTP 401") || msg.includes("Unauthorized")) {
      throw Object.assign(new Error("AUTH_FAIL"), { code: 401 });
    }
    if (msg.includes("No server") || msg.includes("HTTP 404")) {
      throw Object.assign(new Error("NOT_FOUND"), { code: 404 });
    }
    return null; // VM chưa ACTIVE, chưa có IP
  }
}

// POST /api/vm-ip
// Body: { server_name: string, project?: { user: string, name: string } }
export async function POST(request: NextRequest) {
  try {
    const { server_name } = await request.json();
    if (!server_name) {
      return NextResponse.json({ success: false, error_message: "Missing server_name" }, { status: 400 });
    }
    const env = getOpenStackEnv();
    const ip = await getServerIP(server_name, env);
    if (!ip) {
      return NextResponse.json({ success: false, server_name, error_message: "VM chưa ACTIVE hoặc chưa có IP" }, { status: 500 });
    }
    return NextResponse.json({ success: true, server_name, ip });
  } catch (err: any) {
    return NextResponse.json({ success: false, error_message: err.message }, { status: err.code || 500 });
  }
}

// GET /api/vm-ip?name=<server_name>  — frontend polling
export async function GET(request: NextRequest) {
  const serverName = request.nextUrl.searchParams.get("name");
  if (!serverName) {
    return NextResponse.json({ ip: "", error: "Missing name" }, { status: 400 });
  }
  try {
    const env = getOpenStackEnv();
    const ip = await getServerIP(serverName, env);
    return NextResponse.json({ ip: ip || "", status: ip ? "ACTIVE" : "BUILD" });
  } catch {
    return NextResponse.json({ ip: "", status: "BUILD" });
  }
}
