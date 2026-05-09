import { NextRequest, NextResponse } from "next/server";
import { getServerIP, isValidHostnameLabel, normalizeHostnameLabel } from "@/lib/openstack";
import {
  getConfiguredRouteDomain,
  syncVmRoute,
} from "@/lib/nginx-route-sync";

export const dynamic = "force-dynamic";

function parseTargetPort(value: unknown) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return port;
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const vmName = String(body.vm_name || "").trim();
    const hostnameLabel = normalizeHostnameLabel(
      String(body.hostname || body.vm_name || "").trim(),
    );
    const targetPort = parseTargetPort(body.target_port);
    const hintedIp = String(body.target_ip || "").trim();

    if (!vmName) {
      return NextResponse.json(
        { success: false, error_message: "Thieu vm_name." },
        { status: 400 },
      );
    }

    if (!hostnameLabel || !isValidHostnameLabel(hostnameLabel)) {
      return NextResponse.json(
        {
          success: false,
          error_message:
            "Hostname public khong hop le. Chi dung chu thuong, so va dau gach ngang.",
        },
        { status: 400 },
      );
    }

    if (!targetPort) {
      return NextResponse.json(
        {
          success: false,
          error_message: "Port khong hop le. Hay nhap so tu 1 den 65535.",
        },
        { status: 400 },
      );
    }

    const targetIp = hintedIp || (await getServerIP(vmName));

    if (!targetIp) {
      return NextResponse.json(
        {
          success: false,
          error_message: "Chua lay duoc IP cua VM de cap nhat route.",
        },
        { status: 409 },
      );
    }

    await syncVmRoute({
      routeKey: vmName,
      hostname: hostnameLabel,
      targetIp,
      targetPort,
    });

    return NextResponse.json({
      success: true,
      vm_name: vmName,
      hostname: hostnameLabel,
      fqdn: `${hostnameLabel}.${getConfiguredRouteDomain()}`,
      ip: targetIp,
      target_port: targetPort,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cap nhat route that bai.";
    console.error("[update-vm-route] error:", message);
    return NextResponse.json(
      { success: false, error_message: message },
      { status: 500 },
    );
  }
}
