import { NextRequest, NextResponse } from "next/server";
import {
  generateStartupScript,
  createOpenStackVM,
} from "@/lib/openstack";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { instance_name, hostname, password, flavor, os, network, environments } = body;

    // Validate required fields
    if (!instance_name || !hostname || !password || !flavor || !os || !network) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: instance_name, hostname, password, flavor, os, network",
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

    // Validate instance name and hostname format
    const nameRegex = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
    const hostRegex = /^[a-zA-Z0-9-]*$/;
    
    if (!nameRegex.test(instance_name)) {
      return NextResponse.json(
        {
          success: false,
          error: "Instance name must start with alphanumeric and contain only letters, numbers, dots, hyphens, and underscores",
        },
        { status: 400 }
      );
    }

    if (!hostRegex.test(hostname)) {
      return NextResponse.json(
        {
          success: false,
          error: "Hostname only allows letters, numbers, and hyphens",
        },
        { status: 400 }
      );
    }

    // Generate startup script with hostname
    const startupScript = generateStartupScript(password, environments || [], hostname);

    // Create the VM via OpenStack CLI
    const result = await createOpenStackVM(
      {
        instance_name,
        hostname,
        flavor,
        os,
        network,
        environments: environments || [],
        password // We might not need this here since it's in the script, but I'll keep the interface same for now
      },
      startupScript
    );

    if (!result.success) {
      const errMessage = result.error || "";
      if (errMessage.includes("HTTP 401") || errMessage.includes("requires authentication")) {
        return NextResponse.json(
          { success: false, error: "OpenStack authentication failed (HTTP 401)" },
          { status: 401 }
        );
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
