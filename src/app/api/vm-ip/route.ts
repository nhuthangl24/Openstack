import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

/**
 * Lấy IP của VM theo tên server, dùng:
 * openstack server show <name> -c addresses -f value
 * Output dạng: "public=192.168.1.10, ::1" hoặc "network=10.0.0.5"
 */
export async function getServerIP(
  serverName: string,
  project: { user: string; name: string }
): Promise<string | null> {
  const env = {
    ...process.env,
    OS_CLOUD: "",
    OS_AUTH_URL: process.env.OS_AUTH_URL || "http://127.0.0.1/identity",
    OS_REGION_NAME: process.env.OS_REGION_NAME || "RegionOne",
    OS_USER_DOMAIN_ID: process.env.OS_USER_DOMAIN_ID || "default",
    OS_PROJECT_DOMAIN_ID: process.env.OS_PROJECT_DOMAIN_ID || "default",
    OS_AUTH_TYPE: process.env.OS_AUTH_TYPE || "password",
    OS_USERNAME: project.user,
    OS_PROJECT_NAME: project.name,
    OS_PASSWORD: process.env.OS_PASSWORD || "mtdung2004",
  };

  // Dùng -c addresses -f value để lấy thẳng giá trị addresses, không cần parse JSON
  const cmd = `openstack server show '${serverName.replace(/'/g, "'\\''")}' -c addresses -f value`;

  try {
    const { stdout, stderr } = await execAsync(`bash -c '${cmd}'`, {
      timeout: 15000,
      env,
    });

    const raw = stdout.trim();
    if (!raw) return null;

    // Parse IPv4: raw có dạng "public=10.0.0.5, fe80::1" hoặc "net=10.0.0.5"
    const ipv4Match = raw.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
    if (ipv4Match) return ipv4Match[1];

    return null;
  } catch (err: any) {
    const msg: string = err.stderr || err.message || "";
    if (msg.includes("HTTP 401") || msg.includes("requires authentication")) {
      throw Object.assign(new Error("AUTH_FAIL"), { code: 401 });
    }
    if (msg.includes("No server") || msg.includes("HTTP 404") || msg.includes("No matching")) {
      throw Object.assign(new Error("NOT_FOUND"), { code: 404 });
    }
    return null; // server tồn tại nhưng chưa có IP (đang BUILD)
  }
}

// POST /api/vm-ip
// Body: { server_name: string, project: { user: string, name: string } }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { server_name, project } = body;

    if (!server_name || !project?.user || !project?.name) {
      return NextResponse.json(
        { success: false, error_message: "Missing server_name or project" },
        { status: 400 }
      );
    }

    const ip = await getServerIP(server_name, project);

    if (ip === null) {
      return NextResponse.json(
        { success: false, server_name, error_message: "IP chưa có hoặc VM chưa ACTIVE" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, server_name, ip });
  } catch (err: any) {
    const code = err.code || 500;
    const msgMap: Record<number, string> = {
      401: "Xác thực OpenStack thất bại (401)",
      404: "Không tìm thấy server trên OpenStack (404)",
    };
    return NextResponse.json(
      { success: false, error_message: msgMap[code] || err.message },
      { status: code }
    );
  }
}

// Giữ GET để frontend polling theo id (backward compat)
export async function GET(request: NextRequest) {
  const serverName = request.nextUrl.searchParams.get("name");
  const vmId = request.nextUrl.searchParams.get("id"); // fallback cũ

  const nameToUse = serverName || vmId;
  if (!nameToUse) {
    return NextResponse.json({ error: "Missing name or id" }, { status: 400 });
  }

  try {
    const ip = await getServerIP(nameToUse, { user: "dung", name: "Dung_Prj" });
    return NextResponse.json({ ip: ip || "", status: ip ? "ACTIVE" : "BUILD" });
  } catch (err: any) {
    return NextResponse.json({ ip: "", status: "BUILD", error: err.message });
  }
}
