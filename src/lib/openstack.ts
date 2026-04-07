import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const execAsync = promisify(exec);

// ─── OpenStack env vars ────────────────────────────────────────────────────
export function getOpenStackEnv(): Record<string, string> {
  return {
    OS_AUTH_URL: process.env.OS_AUTH_URL || "http://127.0.0.1/identity",
    OS_REGION_NAME: process.env.OS_REGION_NAME || "RegionOne",
    OS_USER_DOMAIN_ID: process.env.OS_USER_DOMAIN_ID || "default",
    OS_PROJECT_DOMAIN_ID: process.env.OS_PROJECT_DOMAIN_ID || "default",
    OS_AUTH_TYPE: process.env.OS_AUTH_TYPE || "password",
    OS_USERNAME: process.env.OS_USERNAME || "dung",
    OS_PROJECT_NAME: process.env.OS_PROJECT_NAME || "Dung_Prj",
    OS_PASSWORD: process.env.OS_PASSWORD || "mtdung2004",
  };
}

// ─── Run CLI ────────────────────────────────────────────────────────────────
export async function runOpenStackCommand(
  command: string,
  envVars: Record<string, string> = {}
): Promise<string> {
  const { stdout, stderr } = await execAsync(`bash -c '${command}'`, {
    timeout: 60000,
    env: { ...process.env, OS_CLOUD: "", ...envVars },
  });

  if (stderr && !stdout) throw new Error(stderr.trim());
  return stdout.trim();
}

// ─── Lookup ID by name ──────────────────────────────────────────────────────
// openstack image|flavor|network list --name <name> -f value -c ID
export async function lookupId(
  type: "image" | "flavor" | "network",
  name: string,
  envVars: Record<string, string>
): Promise<string> {
  const cmd = `openstack ${type} list --name ${escapeShellArg(name)} -f value -c ID`;
  const output = await runOpenStackCommand(cmd, envVars);
  const id = output.split("\n")[0].trim();
  if (!id) throw new Error(`${type} "${name}" không tìm thấy trong OpenStack`);
  return id;
}

// ─── Shell escape ───────────────────────────────────────────────────────────
export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// ─── Temp file helpers ──────────────────────────────────────────────────────
export async function writeTempScript(script: string): Promise<string> {
  const filepath = join(tmpdir(), `userdata-${randomUUID()}.sh`);
  await writeFile(filepath, script, { mode: 0o755 });
  return filepath;
}

export async function cleanupTempFile(filepath: string): Promise<void> {
  try { await unlink(filepath); } catch { /* ignore */ }
}

// ─── Generate cloud-init user-data ─────────────────────────────────────────
export function generatePostCreateScript(
  hostname: string,
  password: string,
  environments: string[]
): string {
  let script = `#!/bin/bash
# 1. Set hostname
hostnamectl set-hostname ${hostname}
echo "127.0.0.1 ${hostname}" >> /etc/hosts

# 2. Passwords & SSH
echo "root:${password}" | chpasswd
echo "ubuntu:${password}" | chpasswd
sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
find /etc/ssh/sshd_config.d -type f -name "*.conf" -exec sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/' {} \\;
systemctl restart ssh

# 3. Update packages
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
`;

  if (environments.length > 0) {
    if (environments.includes("docker")) {
      script += "apt-get install -y docker.io\n";
      script += "systemctl enable --now docker\n";
    }
    if (environments.includes("nodejs")) {
      script += "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -\n";
      script += "apt-get install -y nodejs\n";
    }
    if (environments.includes("pm2")) {
      script += "npm install -g pm2\n";
    }
    if (environments.includes("python") || environments.includes("python3")) {
      script += "apt-get install -y python3 python3-pip\n";
    }
    if (environments.includes("java") || environments.includes("jdk")) {
      script += "apt-get install -y default-jdk\n";
    }
    if (environments.includes("php")) {
      script += "apt-get install -y php php-cli php-fpm\n";
    }
    if (environments.includes("composer")) {
      script += "apt-get install -y composer\n";
    }
    if (environments.includes("go") || environments.includes("golang")) {
      script += "apt-get install -y golang\n";
    }
    if (environments.includes("git")) {
      script += "apt-get install -y git\n";
    }
    if (environments.includes("mysql")) {
      script += "apt-get install -y mysql-server\n";
      script += "systemctl enable --now mysql\n";
    }
    if (environments.includes("postgresql") || environments.includes("postgres")) {
      script += "apt-get install -y postgresql postgresql-contrib\n";
      script += "systemctl enable --now postgresql\n";
    }
    if (environments.includes("mongodb") || environments.includes("mongo")) {
      script += "apt-get install -y mongodb\n";
      script += "systemctl enable --now mongodb\n";
    }
    if (environments.includes("redis")) {
      script += "apt-get install -y redis-server\n";
      script += "systemctl enable --now redis-server\n";
    }
    if (environments.includes("nginx")) {
      script += "apt-get install -y nginx\n";
      script += "systemctl enable --now nginx\n";
    }
    if (environments.includes("apache2") || environments.includes("apache")) {
      script += "apt-get install -y apache2\n";
      script += "systemctl enable --now apache2\n";
    }
  }

  return script;
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface CreateVMData {
  instance_name: string;
  password: string;
  flavor: string; // name, e.g. "m1.small"
  os: string;     // name, e.g. "Ubuntu 24.04 Noble"
  network: string; // name, e.g. "public"
  environments: string[];
}

export interface CreateVMResponse {
  success: boolean;
  vm_name: string;
  vm_id?: string;
  status: string;
  ip?: string;
  error?: string;
  error_message?: string;
}

// ─── Create VM ───────────────────────────────────────────────────────────────
export async function createOpenStackVM(
  data: CreateVMData,
  script: string
): Promise<CreateVMResponse> {
  let scriptPath = "";
  const envVars = getOpenStackEnv();

  try {
    // Step 1: Lookup IDs by name
    const [imageId, flavorId, networkId] = await Promise.all([
      lookupId("image", data.os, envVars),
      lookupId("flavor", data.flavor, envVars),
      lookupId("network", data.network, envVars),
    ]);

    // Step 2: Write cloud-init script to temp file
    scriptPath = await writeTempScript(script);

    // Step 3: Create server using IDs
    const cmd = [
      "openstack server create",
      `--image ${escapeShellArg(imageId)}`,
      `--flavor ${escapeShellArg(flavorId)}`,
      `--network ${escapeShellArg(networkId)}`,
      `--user-data ${escapeShellArg(scriptPath)}`,
      `${escapeShellArg(data.instance_name)}`,
      "-f json",
    ].join(" ");

    const output = await runOpenStackCommand(cmd, envVars);
    const result = JSON.parse(output);
    const vmId = result.id || result.ID;

    return {
      success: true,
      vm_name: data.instance_name,
      vm_id: vmId,
      status: result.status || "BUILD",
      ip: "",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      vm_name: data.instance_name,
      status: "ERROR",
      error: message,
    };
  } finally {
    if (scriptPath) await cleanupTempFile(scriptPath);
  }
}
