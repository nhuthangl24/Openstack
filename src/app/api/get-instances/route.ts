import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

const OPENRC = "/opt/stack/devstack/openrc";
const OS_USER = "dung";
const OS_PROJECT = "Dung_Prj";

/**
 * Chạy lệnh OpenStack CLI sau khi source openrc.
 * Pattern: bash -c 'source <openrc> <user> <project> && <cmd>'
 */
export async function runWithOpenRC(cmd: string): Promise<string> {
  const fullCmd = `bash -c 'source ${OPENRC} ${OS_USER} ${OS_PROJECT} > /dev/null 2>&1 && ${cmd}'`;
  const { stdout, stderr } = await execAsync(fullCmd, { timeout: 30000 });
  if (stderr && !stdout) throw new Error(stderr.trim());
  return stdout.trim();
}

// GET /api/get-instances
export async function GET() {
  try {
    const raw = await runWithOpenRC("openstack server list -f json");
    const list = JSON.parse(raw);

    const instances = list.map((vm: any) => ({
      id: vm.ID || vm.id,
      name: vm.Name || vm.name,
      status: vm.Status || vm.status,
      networks: vm.Networks || vm.networks || "",
      image: vm.Image || vm.image || "",
      flavor: vm.Flavor || vm.flavor || "",
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
