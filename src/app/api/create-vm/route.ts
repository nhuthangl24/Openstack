import { NextRequest, NextResponse } from "next/server";
import { generateStartupScript } from "@/lib/generate-script";
import { createOpenStackVM } from "@/lib/openstack";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { instance_name, password, flavor, os, environments } = body;

    // Validate required fields
    if (!instance_name || !password || !flavor) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: instance_name, password, flavor",
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

    // Create the VM via OpenStack (stub)
    const result = await createOpenStackVM(
      {
        instance_name,
        password,
        flavor,
        os: os || "Ubuntu 24.04",
        environments: environments || [],
      },
      startupScript
    );

    return NextResponse.json({
      ...result,
      message: `VM "${instance_name}" is being created with flavor ${flavor}`,
      startup_script_preview: startupScript.substring(0, 200) + "...",
    });
  } catch (error) {
    console.error("Error creating VM:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error while creating VM",
      },
      { status: 500 }
    );
  }
}
