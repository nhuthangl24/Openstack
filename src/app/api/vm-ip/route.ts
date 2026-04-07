import { NextRequest, NextResponse } from "next/server";
import { runOpenStackCommand, escapeShellArg } from "@/lib/openstack";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const vmId = request.nextUrl.searchParams.get("id");
  if (!vmId) {
    return NextResponse.json({ error: "Missing vm id" }, { status: 400 });
  }

  const openstackEnv = {
    OS_AUTH_URL: process.env.OS_AUTH_URL || "http://127.0.0.1/identity",
    OS_REGION_NAME: process.env.OS_REGION_NAME || "RegionOne",
    OS_USER_DOMAIN_ID: process.env.OS_USER_DOMAIN_ID || "default",
    OS_PROJECT_DOMAIN_ID: process.env.OS_PROJECT_DOMAIN_ID || "default",
    OS_AUTH_TYPE: process.env.OS_AUTH_TYPE || "password",
    OS_USERNAME: "dung",
    OS_PROJECT_NAME: "Dung_Prj",
    OS_PASSWORD: "mtdung2004",
  };

  try {
    const out = await runOpenStackCommand(
      `openstack server show ${escapeShellArg(vmId)} -f json`,
      openstackEnv
    );
    const vm = JSON.parse(out);
    const status = vm.status;

    // Parse IP from addresses field
    // OpenStack CLI returns addresses as a string like: "public=10.0.0.5, ::1"
    let ip = "";
    const rawAddresses = vm.addresses;

    if (typeof rawAddresses === "string" && rawAddresses.length > 0) {
      const match = rawAddresses.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (match) ip = match[1];
    } else if (rawAddresses && typeof rawAddresses === "object") {
      for (const nets of Object.values(rawAddresses) as any[]) {
        if (Array.isArray(nets)) {
          const v4 = nets.find((n: any) => n.version === 4 || !n.version?.toString().includes("6"));
          if (v4?.addr) { ip = v4.addr; break; }
        }
      }
    }

    return NextResponse.json({ status, ip });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
