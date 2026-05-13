import { NextRequest, NextResponse } from "next/server";
import {
  createOpenStackVM,
  generatePostCreateScript,
  isValidHostnameLabel,
  normalizeHostnameLabel,
  waitForServerIP,
} from "@/lib/openstack";
import {
  getConfiguredRouteDomain,
  getConfiguredRouteListenPort,
  getConfiguredRouteTargetPort,
  syncVmRoute,
} from "@/lib/nginx-route-sync";
import { pickPrimaryVmRoute, type VmRouteSnapshot } from "@/lib/public-routes";

export const dynamic = "force-dynamic";

interface RouteMappingPayload {
  listen_port: number;
  target_port: number;
}

function parsePort(value: unknown) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }

  return port;
}

function parseRouteMappings(
  value: unknown,
  defaultListenPort: number,
  defaultTargetPort: number,
) {
  if (value === undefined) {
    return [
      {
        listen_port: defaultListenPort,
        target_port: defaultTargetPort,
      },
    ] satisfies RouteMappingPayload[];
  }

  if (!Array.isArray(value)) {
    throw new Error("route_mappings phai la mot mang.");
  }

  const usedListenPorts = new Set<number>();
  const mappings: RouteMappingPayload[] = [];

  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object") {
      throw new Error(`route_mappings[${index}] khong hop le.`);
    }

    const mapping = item as Record<string, unknown>;
    const listenPort = parsePort(mapping.listen_port);
    const targetPort = parsePort(mapping.target_port);

    if (!listenPort) {
      throw new Error(`route_mappings[${index}].listen_port khong hop le.`);
    }

    if (!targetPort) {
      throw new Error(`route_mappings[${index}].target_port khong hop le.`);
    }

    if (usedListenPorts.has(listenPort)) {
      throw new Error(`Host port :${listenPort} bi trung trong route_mappings.`);
    }

    usedListenPorts.add(listenPort);
    mappings.push({
      listen_port: listenPort,
      target_port: targetPort,
    });
  }

  return mappings;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      instance_name,
      hostname,
      password,
      flavor,
      os,
      network,
      environments,
      route_mappings,
    } = body;

    if (!instance_name || !password || !flavor || !os || !network) {
      return NextResponse.json(
        {
          success: false,
          error_message:
            "Thiếu dữ liệu bắt buộc: instance_name, password, flavor, os, network.",
        },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        {
          success: false,
          error_message: "Mật khẩu phải có ít nhất 8 ký tự.",
        },
        { status: 400 },
      );
    }

    const nameRegex = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
    const hostnameLabel = normalizeHostnameLabel(hostname || instance_name);

    if (!nameRegex.test(instance_name)) {
      return NextResponse.json(
        {
          success: false,
          error_message:
            "Tên máy chỉ được dùng chữ, số, dấu chấm, gạch ngang và gạch dưới.",
        },
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

    let requestedRouteMappings: RouteMappingPayload[];

    try {
      requestedRouteMappings = parseRouteMappings(
        route_mappings,
        getConfiguredRouteListenPort(),
        getConfiguredRouteTargetPort(),
      );
    } catch (routeMappingError) {
      const message =
        routeMappingError instanceof Error
          ? routeMappingError.message
          : "route_mappings khong hop le.";

      return NextResponse.json(
        {
          success: false,
          error_message: message,
        },
        { status: 400 },
      );
    }

    const startupScript = generatePostCreateScript(
      hostnameLabel,
      password,
      environments || [],
    );

    const result = await createOpenStackVM(
      {
        instance_name,
        password,
        flavor,
        os,
        network,
        environments: environments || [],
      },
      startupScript,
    );

    if (!result.success) {
      const message = result.error || "Không thể tạo VM.";
      console.error("[create-vm] error:", message);

      if (
        message.includes("HTTP 401") ||
        message.includes("requires authentication") ||
        message.includes("Unauthorized")
      ) {
        return NextResponse.json(
          {
            success: false,
            error_message: "Xác thực OpenStack thất bại (401).",
          },
          { status: 401 },
        );
      }

      if (message.includes("HTTP 403") || message.toLowerCase().includes("quota")) {
        return NextResponse.json(
          {
            success: false,
            error_message: "Quota OpenStack không đủ để tạo thêm VM (403).",
          },
          { status: 403 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error_message: message,
        },
        { status: 500 },
      );
    }

    const ip = await waitForServerIP(result.vm_id || result.vm_name);
    const syncedRouteMappings: VmRouteSnapshot[] = [];
    const routeSyncWarnings: string[] = [];

    for (const mapping of requestedRouteMappings) {
      try {
        await syncVmRoute({
          routeKey: instance_name,
          hostname: hostnameLabel,
          targetIp: ip,
          listenPort: mapping.listen_port,
          targetPort: mapping.target_port,
        });

        syncedRouteMappings.push({
          route_key: instance_name,
          hostname: hostnameLabel,
          domain: getConfiguredRouteDomain(),
          fqdn: `${hostnameLabel}.${getConfiguredRouteDomain()}`,
          target_ip: ip,
          target_port: mapping.target_port,
          listen_port: mapping.listen_port,
          config_path: "",
        });
      } catch (routeError) {
        const detail =
          routeError instanceof Error
            ? routeError.message
            : "Khong dong bo duoc route Nginx.";
        routeSyncWarnings.push(`:${mapping.listen_port} -> :${mapping.target_port}: ${detail}`);
        console.error("[create-vm] nginx route sync error:", detail);
      }
    }

    const primaryRoute =
      pickPrimaryVmRoute(syncedRouteMappings, getConfiguredRouteListenPort()) ??
      syncedRouteMappings[0] ??
      null;

    return NextResponse.json({
      success: true,
      vm_name: result.vm_name,
      vm_id: result.vm_id,
      status: result.status,
      ip,
      hostname: hostnameLabel,
      fqdn: `${hostnameLabel}.${getConfiguredRouteDomain()}`,
      route_mappings: syncedRouteMappings,
      route_listen_port: primaryRoute?.listen_port,
      route_target_port: primaryRoute?.target_port,
      route_sync_warning: routeSyncWarnings.join(" | ") || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[create-vm] uncaught:", message);

    return NextResponse.json(
      {
        success: false,
        error_message: `Lỗi nội bộ khi tạo VM: ${message}`,
      },
      { status: 500 },
    );
  }
}
