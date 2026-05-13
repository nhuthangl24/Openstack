import { NextRequest, NextResponse } from "next/server";
import { getConfiguredRouteListenPort, getVmRoutes } from "@/lib/nginx-route-sync";
import { pickPrimaryVmRoute } from "@/lib/public-routes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const vmName = request.nextUrl.searchParams.get("vm_name")?.trim() || "";

    if (!vmName) {
      return NextResponse.json(
        { success: false, error_message: "Thieu vm_name." },
        { status: 400 },
      );
    }

    const routes = await getVmRoutes(vmName);

    if (routes.length === 0) {
      return NextResponse.json(
        { success: false, error_message: "Khong tim thay route cho VM nay." },
        { status: 404 },
      );
    }

    const route = pickPrimaryVmRoute(routes, getConfiguredRouteListenPort()) || routes[0];

    return NextResponse.json({
      success: true,
      route,
      routes,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Khong lay duoc route.";
    console.error("[vm-route] error:", message);
    return NextResponse.json(
      { success: false, error_message: message },
      { status: 500 },
    );
  }
}
