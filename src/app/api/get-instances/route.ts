import { NextResponse } from "next/server";
import { runCLI, extractIPv4 } from "@/lib/openstack";

export const dynamic = "force-dynamic";

interface OpenStackServerRow {
  ID?: string;
  id?: string;
  Name?: string;
  name?: string;
  Status?: string;
  status?: string;
  Networks?: unknown;
  networks?: unknown;
  Image?: string;
  image?: string;
  Flavor?: string;
  flavor?: string;
}

// GET /api/get-instances
export async function GET() {
  try {
    const raw = await runCLI("openstack server list -f json");
    const list: OpenStackServerRow[] = JSON.parse(raw);

    const instances = list.map((vm) => ({
      id:      vm.ID      || vm.id,
      name:    vm.Name    || vm.name,
      status:  vm.Status  || vm.status,
      networks: vm.Networks || vm.networks || "",
      ip:      extractIPv4(vm.Networks ?? vm.networks),
      image:   vm.Image   || vm.image   || "",
      flavor:  vm.Flavor  || vm.flavor  || "",
    }));

    return NextResponse.json({ success: true, instances });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Không lấy được danh sách server.";
    console.error("[get-instances] error:", message);
    return NextResponse.json(
      { success: false, error_message: message },
      { status: 500 }
    );
  }
}
