import { NextRequest, NextResponse } from "next/server";
import { runOpenStackCommand } from "@/lib/openstack";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { error: "Missing vm_id parameter" },
        { status: 400 }
      );
    }

    const output = await runOpenStackCommand(`openstack server show '${id}' -f json`);
    const vmData = JSON.parse(output);

    return NextResponse.json({
      status: vmData.status || vmData.Status || "ERROR"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch VM status";
    console.error(`[API /api/vm-status] Error fetching status for ${error}:`, message);

    // If VM not found or other OpenStack error
    return NextResponse.json(
      { status: "ERROR", error: message },
      { status: 500 }
    );
  }
}
