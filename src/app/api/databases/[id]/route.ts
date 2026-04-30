import { NextRequest, NextResponse } from "next/server";
import { deleteHostedDatabaseForRequest, toSafeErrorResponse } from "@/lib/mysql-admin";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const result = await deleteHostedDatabaseForRequest(request, id);

    return NextResponse.json(
      {
        success: true,
        deleted: result,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const safe = toSafeErrorResponse(error);
    console.error("[databases:delete] error:", error);

    return NextResponse.json(
      {
        success: false,
        error_message: safe.message,
      },
      { status: safe.status },
    );
  }
}
