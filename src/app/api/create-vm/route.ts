import { NextRequest, NextResponse } from "next/server";
import {
  generateStartupScript,
  createOpenStackVM,
} from "@/lib/openstack";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { instance_name, password, flavor, os, network, environments, username, project } = body;

    // Validate required fields
    if (!instance_name || !password || !flavor || !os || !network) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing required fields: instance_name, password, flavor, os, network",
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

    // Validate instance name format
    const nameRegex = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
    if (!nameRegex.test(instance_name)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Instance name must start with alphanumeric and contain only letters, numbers, dots, hyphens, and underscores",
        },
        { status: 400 }
      );
    }

    // Generate startup script
    const startupScript = generateStartupScript(
      password,
      environments || []
    );

    // Create the VM via OpenStack CLI
    const result = await createOpenStackVM(
      {
        instance_name,
        password,
        flavor,
        os,
        network,
        environments: environments || [],
        username,
        project,
      },
      startupScript
    );

    if (!result.success) {
      // Return specific error status if it resembles 401 Authentication Required
      const errMessage = result.error || "";
      if (errMessage.includes("HTTP 401") || errMessage.includes("requires authentication")) {
        return NextResponse.json(result, { status: 401 });
      }
      return NextResponse.json(result, { status: 500 });
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
