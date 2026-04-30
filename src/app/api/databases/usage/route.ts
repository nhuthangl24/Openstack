import { NextRequest, NextResponse } from "next/server";
import { getDatabaseUsageForRequest, toSafeErrorResponse } from "@/lib/mysql-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const usage = await getDatabaseUsageForRequest(request);

    return NextResponse.json(
      {
        success: true,
        ...usage,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const safe = toSafeErrorResponse(error);
    console.error("[databases:usage] error:", error);

    return NextResponse.json(
      {
        success: false,
        error_message: safe.message,
      },
      { status: safe.status },
    );
  }
}
