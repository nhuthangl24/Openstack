import { NextRequest, NextResponse } from "next/server";
import {
  createHostedDatabaseForRequest,
  listDatabasesForRequest,
  toSafeErrorResponse,
} from "@/lib/mysql-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const databases = await listDatabasesForRequest(request);

    return NextResponse.json(
      {
        success: true,
        databases,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const safe = toSafeErrorResponse(error);
    console.error("[databases:list] error:", error);

    return NextResponse.json(
      {
        success: false,
        error_message: safe.message,
      },
      { status: safe.status },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
    };

    if (!body.name) {
      return NextResponse.json(
        {
          success: false,
          error_message: "Thieu ten database.",
        },
        { status: 400 },
      );
    }

    const result = await createHostedDatabaseForRequest(request, {
      name: body.name,
    });

    return NextResponse.json(
      {
        success: true,
        database: result.database,
        connection: result.connection,
        password_was_created: result.passwordWasCreated,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const safe = toSafeErrorResponse(error);
    console.error("[databases:create] error:", error);

    return NextResponse.json(
      {
        success: false,
        error_message: safe.message,
      },
      { status: safe.status },
    );
  }
}
