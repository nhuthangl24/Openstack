import { NextRequest, NextResponse } from "next/server";
import { getDatabaseConnectionForRequest, toSafeErrorResponse } from "@/lib/mysql-admin";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const connection = await getDatabaseConnectionForRequest(request, id);

    return NextResponse.json(
      {
        success: true,
        connection,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const safe = toSafeErrorResponse(error);
    console.error("[databases:connection] error:", error);

    return NextResponse.json(
      {
        success: false,
        error_message: safe.message,
      },
      { status: safe.status },
    );
  }
}
