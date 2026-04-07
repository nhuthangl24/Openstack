import { NextRequest, NextResponse } from "next/server";
import { generatePostCreateScript, createOpenStackVM } from "@/lib/openstack";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { instance_name, password, flavor, os, network, environments } = body;

    // Validate required fields
    if (!instance_name || !password || !flavor || !os || !network) {
      return NextResponse.json(
        { success: false, error_message: "Thiếu field: instance_name, password, flavor, os, network" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error_message: "Mật khẩu phải có ít nhất 8 ký tự" },
        { status: 400 }
      );
    }

    const nameRegex = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
    if (!nameRegex.test(instance_name)) {
      return NextResponse.json(
        { success: false, error_message: "Tên máy chỉ được dùng chữ, số, dấu chấm, gạch ngang, gạch dưới" },
        { status: 400 }
      );
    }

    // Generate cloud-init script (hostname = instance_name)
    const startupScript = generatePostCreateScript(instance_name, password, environments || []);

    // Create VM (lookupId inside: name → ID)
    const result = await createOpenStackVM(
      { instance_name, password, flavor, os, network, environments: environments || [] },
      startupScript
    );

    if (!result.success) {
      const msg = result.error || "Unknown error";
      console.error("[create-vm] error:", msg);

      if (msg.includes("HTTP 401") || msg.includes("requires authentication") || msg.includes("Unauthorized")) {
        return NextResponse.json({ success: false, error_message: "Xác thực OpenStack thất bại (401)" }, { status: 401 });
      }
      if (msg.includes("HTTP 403") || msg.toLowerCase().includes("quota")) {
        return NextResponse.json({ success: false, error_message: "Vượt quota OpenStack (403)" }, { status: 403 });
      }
      return NextResponse.json({ success: false, error_message: msg }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      vm_name: result.vm_name,
      vm_id: result.vm_id,
      status: result.status,
      ip: result.ip || "",
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[create-vm] uncaught:", msg);
    return NextResponse.json(
      { success: false, error_message: "Internal server error: " + msg },
      { status: 500 }
    );
  }
}
