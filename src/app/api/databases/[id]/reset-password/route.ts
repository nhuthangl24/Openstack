import { NextRequest, NextResponse } from "next/server";
import { resetDatabasePasswordForRequest, toSafeErrorResponse } from "@/lib/mysql-admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const result = await resetDatabasePasswordForRequest(request, id);

    return NextResponse.json(
      {
        success: true,
        mysql_username: result.mysqlUsername,
        password: result.password,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const safe = toSafeErrorResponse(error);
    console.error("[databases:reset-password] error:", error);

    return NextResponse.json(
      {
        success: false,
        error_message: safe.message,
      },
      { status: safe.status },
    );
  }
}
