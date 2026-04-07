import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const execAsync = promisify(exec);

/**
 * Execute an OpenStack CLI command with credentials supplied via environment.
 */
export async function runOpenStackCommand(
  command: string,
  envVars: Record<string, string> = {}
): Promise<string> {
  const fullCommand = `bash -c '${command}'`;

  const { stdout, stderr } = await execAsync(fullCommand, {
    timeout: 30000,
    env: { ...process.env, OS_CLOUD: "", ...envVars },
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
  os: string;
  network: string;
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
 * Safely escape a string for bash shell argument passing.
 */
export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Verify if an OpenStack resource exists by name or ID.
 */
export async function verifyOpenStackResource(
  type: "network" | "image" | "flavor",
  name: string,
  envVars: Record<string, string>
): Promise<boolean> {
  const cmd = `openstack ${type} show ${escapeShellArg(name)} -f json`;
  try {
    await runOpenStackCommand(cmd, envVars);
    return true;
  } catch {
    return false;
  }
}

export interface CreateVMData {
  instance_name: string;
  password: string;
  flavor: string;
  os: string;
  network: string;
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
    // Ensure FULL OpenStack environment variables are injected into child_process.exec env
    const openstackEnv = {
      OS_AUTH_URL: process.env.OS_AUTH_URL || "http://127.0.0.1/identity",
      OS_REGION_NAME: process.env.OS_REGION_NAME || "RegionOne",
      OS_USER_DOMAIN_ID: process.env.OS_USER_DOMAIN_ID || "default",
      OS_PROJECT_DOMAIN_ID: process.env.OS_PROJECT_DOMAIN_ID || "default",
      OS_AUTH_TYPE: process.env.OS_AUTH_TYPE || "password",
      OS_USERNAME: "dung",
      OS_PROJECT_NAME: "Dung_Prj",
      OS_PASSWORD: "mtdung2004",
    };

    // 1. Verify existence of required resources before creating
    const [networkValid, imageValid, flavorValid] = await Promise.all([
      verifyOpenStackResource("network", data.network, openstackEnv),
      verifyOpenStackResource("image", data.os, openstackEnv),
      verifyOpenStackResource("flavor", data.flavor, openstackEnv),
    ]);

    if (!networkValid || !imageValid || !flavorValid) {
      const missing = [];
      if (!networkValid) missing.push(`Network: ${data.network}`);
      if (!imageValid) missing.push(`Image: ${data.os}`);
      if (!flavorValid) missing.push(`Flavor: ${data.flavor}`);
      
      return {
        success: false,
        vm_name: data.instance_name,
        status: "ERROR",
        error: `Resources not found in OpenStack: ${missing.join(', ')}`,
      };
    }

    // Write user-data to temp file
    scriptPath = await writeTempScript(script);

    // Build the openstack server create command with properly escaped shell arguments
    const cmd = [
      "openstack server create",
      `--image ${escapeShellArg(data.os)}`,
      `--flavor ${escapeShellArg(data.flavor)}`,
      `--network ${escapeShellArg(data.network)}`,
      `--user-data ${escapeShellArg(scriptPath)}`,
      `${escapeShellArg(data.instance_name)}`,
      "-f json",
    ].join(" ");

    const output = await runOpenStackCommand(cmd, openstackEnv);
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
