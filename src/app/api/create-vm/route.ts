import { NextRequest, NextResponse } from "next/server";
import {
  generatePostCreateScript,
  createOpenStackVM,
} from "@/lib/openstack";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { instance_name, password, flavor, os, network, environments } = body;

    // Validate required fields
    if (!instance_name || !password || !flavor || !os || !network) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: instance_name, password, flavor, os, network",
        },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 8) {
      return NextResponse.json(
        {
          success: false,
          error: "Password must be at least 8 characters",
        },
        { status: 400 }
      );
    }

    // Validate instance name (which assumes role of hostname)
    const nameRegex = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
    
    if (!nameRegex.test(instance_name)) {
      return NextResponse.json(
        {
          success: false,
          error: "Instance name must start with alphanumeric and contain only letters, numbers, dots, hyphens, and underscores",
        },
        { status: 400 }
      );
    }

    // Generate startup script using instance_name
    const startupScript = generatePostCreateScript(instance_name, password, environments || []);

    // Create the VM via OpenStack CLI
    const result = await createOpenStackVM(
      {
        instance_name,
        flavor,
        os,
        network,
        environments: environments || [],
        password
      },
      startupScript
    );

    if (!result.success) {
      const errMessage = result.error || "";
      if (errMessage.includes("HTTP 401") || errMessage.includes("requires authentication")) {
        return NextResponse.json(
          { success: false, vm_name: instance_name, status: "ERROR", error_message: "OpenStack authentication failed (HTTP 401)" },
          { status: 401 }
        );
      }
      if (errMessage.includes("HTTP 403") || errMessage.includes("Quota exceeded") || errMessage.includes("quota")) {
        return NextResponse.json(
          { success: false, vm_name: instance_name, status: "ERROR", error_message: "Quota exceeded on OpenStack (HTTP 403)" },
          { status: 403 }
        );
      }
      if (errMessage.includes("Resources not found") || errMessage.includes("HTTP 404") || errMessage.includes("No matching")) {
        return NextResponse.json(
          { success: false, vm_name: instance_name, status: "ERROR", error_message: errMessage },
          { status: 404 }
        );
      }
      return NextResponse.json({ ...result, error_message: errMessage }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[API /api/create-vm] Error:", error);
    return NextResponse.json(
      {
        success: false,
        vm_name: "",
        status: "ERROR",
        error: "Internal server error while creating VM",
      },
      { status: 500 }
    );
  }
}
