import { NextRequest, NextResponse } from "next/server";
import {
  createOpenStackVM,
  generatePostCreateScript,
  isValidHostnameLabel,
  normalizeHostnameLabel,
  waitForServerIP,
} from "@/lib/openstack";
import { syncVmRoute } from "@/lib/nginx-route-sync";

export const dynamic = "force-dynamic";

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
    let routeSyncWarning = "";

    try {
      await syncVmRoute({
        routeKey: instance_name,
        hostname: hostnameLabel,
        targetIp: ip,
      });
    } catch (routeError) {
      routeSyncWarning =
        routeError instanceof Error
          ? routeError.message
          : "Khong dong bo duoc route Nginx.";
      console.error("[create-vm] nginx route sync error:", routeSyncWarning);
    }

    return NextResponse.json({
      success: true,
      vm_name: result.vm_name,
      vm_id: result.vm_id,
      status: result.status,
      ip,
      hostname: hostnameLabel,
      fqdn: `${hostnameLabel}.${process.env.NGINX_ROUTE_DOMAIN || "orbitstack.app"}`,
      route_sync_warning: routeSyncWarning || undefined,
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
