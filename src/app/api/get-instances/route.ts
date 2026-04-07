import { NextResponse } from "next/server";
import { runCLI, extractIPv4 } from "@/lib/openstack";

export const dynamic = "force-dynamic";

// GET /api/get-instances
export async function GET() {
  try {
    const raw = await runCLI("openstack server list -f json");
    const list = JSON.parse(raw);

    const instances = list.map((vm: any) => ({
      id:      vm.ID      || vm.id,
      name:    vm.Name    || vm.name,
      status:  vm.Status  || vm.status,
      networks: vm.Networks || vm.networks || "",
      ip:      extractIPv4(vm.Networks ?? vm.networks),
      image:   vm.Image   || vm.image   || "",
      flavor:  vm.Flavor  || vm.flavor  || "",
    }));

    return NextResponse.json({ success: true, instances });
  } catch (err: any) {
    console.error("[get-instances] error:", err.message);
    return NextResponse.json(
      { success: false, error_message: err.message },
      { status: 500 }
    );
  }
}
