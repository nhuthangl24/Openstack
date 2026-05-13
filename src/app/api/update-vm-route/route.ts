import { NextRequest, NextResponse } from "next/server";
import { getServerIP, isValidHostnameLabel, normalizeHostnameLabel } from "@/lib/openstack";
import {
  getConfiguredRouteDomain,
  getConfiguredRouteListenPort,
  getVmRoute,
  removeVmRoute,
  syncVmRoute,
} from "@/lib/nginx-route-sync";

export const dynamic = "force-dynamic";

function parsePort(value: unknown) {
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
    const requestedHostname = String(body.hostname || "").trim();
    const targetPort = parsePort(body.target_port);
    const listenPort = parsePort(body.listen_port) || getConfiguredRouteListenPort();
    const previousListenPort = parsePort(body.previous_listen_port);
    const hintedIp = String(body.target_ip || "").trim();

    if (!vmName) {
      return NextResponse.json(
        { success: false, error_message: "Thieu vm_name." },
        { status: 400 },
      );
    }

    const existingRoute = await getVmRoute(vmName, previousListenPort || listenPort);
    const hostnameLabel = normalizeHostnameLabel(
      requestedHostname || existingRoute?.hostname || vmName,
    );

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
      listenPort,
      previousListenPort: previousListenPort || undefined,
      targetPort,
    });

    return NextResponse.json({
      success: true,
      vm_name: vmName,
      hostname: hostnameLabel,
      domain: getConfiguredRouteDomain(),
      fqdn: `${hostnameLabel}.${getConfiguredRouteDomain()}`,
      ip: targetIp,
      listen_port: listenPort,
      target_port: targetPort,
      existed_before: Boolean(existingRoute && existingRoute.listen_port === listenPort),
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

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const vmName = String(body.vm_name || "").trim();
    const listenPort = parsePort(body.listen_port);

    if (!vmName) {
      return NextResponse.json(
        { success: false, error_message: "Thieu vm_name." },
        { status: 400 },
      );
    }

    if (!listenPort) {
      return NextResponse.json(
        { success: false, error_message: "Thieu listen_port hop le." },
        { status: 400 },
      );
    }

    await removeVmRoute(vmName, listenPort);

    return NextResponse.json({
      success: true,
      vm_name: vmName,
      listen_port: listenPort,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Xoa route that bai.";
    console.error("[update-vm-route:delete] error:", message);
    return NextResponse.json(
      { success: false, error_message: message },
      { status: 500 },
    );
  }
}
