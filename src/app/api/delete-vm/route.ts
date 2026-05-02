import { NextRequest, NextResponse } from "next/server";
import { runCLI, escapeShellArg } from "@/lib/openstack";
import { removeVmRoute } from "@/lib/nginx-route-sync";

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

    let routeSyncWarning = "";

    try {
      await removeVmRoute(server_name);
    } catch (routeError) {
      routeSyncWarning =
        routeError instanceof Error
          ? routeError.message
          : "Khong go duoc route Nginx tren server remote.";
      console.error("[delete-vm] nginx route cleanup error:", routeSyncWarning);
    }

    return NextResponse.json({
      success: true,
      server_name,
      route_sync_warning: routeSyncWarning || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete VM failed.";
    console.error("[delete-vm] error:", message);
    return NextResponse.json(
      { success: false, error_message: message },
      { status: 500 }
    );
  }
}
