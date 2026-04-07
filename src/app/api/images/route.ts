import { NextResponse } from "next/server";
import { runOpenStackCommand } from "@/lib/openstack";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const output = await runOpenStackCommand("openstack image list -f json");
    const images = JSON.parse(output);

    // Normalize the response: OpenStack may use different key casings
    const normalized = images.map(
      (img: Record<string, string>) => ({
        ID: img.ID || img.id,
        Name: img.Name || img.name,
        Status: img.Status || img.status,
      })
    );

    return NextResponse.json(normalized);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch images from OpenStack";

    console.error("[API /api/images] Error:", message);

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
