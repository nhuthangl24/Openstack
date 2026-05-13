import { NextRequest, NextResponse } from "next/server";
import { getVmRoute } from "@/lib/nginx-route-sync";

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

    const route = await getVmRoute(vmName);

    if (!route) {
      return NextResponse.json(
        { success: false, error_message: "Khong tim thay route cho VM nay." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      route,
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
