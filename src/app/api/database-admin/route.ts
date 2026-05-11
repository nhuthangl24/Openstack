import { NextRequest, NextResponse } from "next/server";
import {
  DatabaseHostingError,
  getDatabaseHostingAdminOverviewForRequest,
  toSafeErrorResponse,
  updateDatabaseHostingUserPlanForRequest,
} from "@/lib/mysql-admin";

export const dynamic = "force-dynamic";

function parsePositiveInteger(value: unknown, field: string) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new DatabaseHostingError(`${field} phai la so nguyen duong.`, 400, true);
  }

  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const overview = await getDatabaseHostingAdminOverviewForRequest(request);

    return NextResponse.json(
      {
        success: true,
        access_mode: overview.accessMode,
        allowed_admins: overview.allowedAdmins,
        plans: overview.plans,
        users: overview.users,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const safe = toSafeErrorResponse(error);
    console.error("[database-admin:list] error:", error);

    return NextResponse.json(
      {
        success: false,
        error_message: safe.message,
      },
      { status: safe.status },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      user_id?: number | string;
      plan_code?: string;
      max_databases?: number | string;
      max_storage_mb?: number | string;
      max_connections?: number | string;
    };

    if (!body.plan_code?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error_message: "Thieu plan_code.",
        },
        { status: 400 },
      );
    }

    const result = await updateDatabaseHostingUserPlanForRequest(request, {
      userId: parsePositiveInteger(body.user_id, "user_id"),
      planCode: body.plan_code.trim().toLowerCase(),
      maxDatabases: parsePositiveInteger(body.max_databases, "max_databases"),
      maxStorageMb: parsePositiveInteger(body.max_storage_mb, "max_storage_mb"),
      maxConnections: parsePositiveInteger(body.max_connections, "max_connections"),
    });

    return NextResponse.json(
      {
        success: true,
        user: result.user,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const safe = toSafeErrorResponse(error);
    console.error("[database-admin:update] error:", error);

    return NextResponse.json(
      {
        success: false,
        error_message: safe.message,
      },
      { status: safe.status },
    );
  }
}
