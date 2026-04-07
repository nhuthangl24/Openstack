import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const execAsync = promisify(exec);

const OPENRC_PATH = "/opt/stack/devstack/openrc";
const OPENRC_SOURCE = `source ${OPENRC_PATH} admin admin`;

/**
 * Execute an OpenStack CLI command with sourced credentials.
 */
export async function runOpenStackCommand(command: string): Promise<string> {
  const fullCommand = `bash -c '${OPENRC_SOURCE} && ${command}'`;

  const { stdout, stderr } = await execAsync(fullCommand, {
    timeout: 30000,
    env: { ...process.env, OS_CLOUD: "" },
  });

  if (stderr && !stdout) {
    throw new Error(stderr.trim());
  }

  return stdout.trim();
}

/**
 * Generate a bash user-data script for cloud-init.
 */
export function generateStartupScript(
  password: string,
  environments: string[]
): string {
  let script = `#!/bin/bash
echo "ubuntu:${password}" | chpasswd
sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
find /etc/ssh/sshd_config.d -type f -name "*.conf" -exec sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/' {} \\;
systemctl restart ssh
apt update -y
`;

  if (environments.includes("docker")) {
    script += "apt install -y docker.io\n";
  }

  if (environments.includes("nodejs")) {
    script += "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -\n";
    script += "apt install -y nodejs\n";
  }

  if (environments.includes("python")) {
    script += "apt install -y python3 python3-pip\n";
  }

  if (environments.includes("mysql")) {
    script += "apt install -y mysql-server\n";
  }

  if (environments.includes("nginx")) {
    script += "apt install -y nginx\n";
  }

  return script;
}

/**
 * Write user-data script to a temp file, return the path.
 */
export async function writeTempScript(script: string): Promise<string> {
  const filename = `userdata-${randomUUID()}.sh`;
  const filepath = join(tmpdir(), filename);
  await writeFile(filepath, script, { mode: 0o755 });
  return filepath;
}

/**
 * Clean up a temp file (best-effort).
 */
export async function cleanupTempFile(filepath: string): Promise<void> {
  try {
    await unlink(filepath);
  } catch {
    // ignore cleanup errors
  }
}

export interface CreateVMData {
  instance_name: string;
  password: string;
  flavor: string;
  image: string;
  environments: string[];
}

export interface CreateVMResponse {
  success: boolean;
  vm_name: string;
  vm_id?: string;
  status: string;
  error?: string;
}

/**
 * Create a VM on OpenStack using CLI.
 */
export async function createOpenStackVM(
  data: CreateVMData,
  script: string
): Promise<CreateVMResponse> {
  let scriptPath = "";

  try {
    // Write user-data to temp file
    scriptPath = await writeTempScript(script);

    // Build the openstack server create command
    const cmd = [
      "openstack server create",
      `--image '${data.image}'`,
      `--flavor '${data.flavor}'`,
      "--network public",
      `--user-data '${scriptPath}'`,
      `'${data.instance_name}'`,
      "-f json",
    ].join(" ");

    const output = await runOpenStackCommand(cmd);
    const result = JSON.parse(output);

    return {
      success: true,
      vm_name: data.instance_name,
      vm_id: result.id || result.ID,
      status: result.status || "BUILD",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error creating VM";
    return {
      success: false,
      vm_name: data.instance_name,
      status: "ERROR",
      error: message,
    };
  } finally {
    if (scriptPath) {
      await cleanupTempFile(scriptPath);
    }
  }
}
