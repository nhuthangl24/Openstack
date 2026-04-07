import { NextRequest, NextResponse } from "next/server";
import { runCLI, escapeShellArg } from "@/lib/openstack";

export const dynamic = "force-dynamic";

// DELETE /api/delete-vm   body: { server_name: string }
export async function DELETE(request: NextRequest) {
  try {
    const { server_name } = await request.json();
    if (!server_name) {
      return NextResponse.json(
        { success: false, error_message: "Missing server_name" },
        { status: 400 }
      );
    }

    await runCLI(`openstack server delete ${escapeShellArg(server_name)} --wait`);
    return NextResponse.json({ success: true, server_name });
  } catch (err: any) {
    console.error("[delete-vm] error:", err.message);
    return NextResponse.json(
      { success: false, error_message: err.message },
      { status: 500 }
    );
  }
}
