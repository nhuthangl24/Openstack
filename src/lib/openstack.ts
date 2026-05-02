import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const execAsync = promisify(exec);
const OPENRC = process.env.OPENRC_PATH || "/opt/stack/devstack/openrc";
const OS_USER = process.env.OS_USERNAME || "dung";
const OS_PROJECT = process.env.OS_PROJECT_NAME || "Dung_Prj";

export function extractIPv4(networks: unknown): string {
  if (!networks) {
    return "";
  }

  if (typeof networks === "string") {
    const match = networks.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
    return match ? match[1] : "";
  }

  if (typeof networks === "object") {
    for (const addresses of Object.values(networks as Record<string, unknown>)) {
      if (!Array.isArray(addresses)) {
        continue;
      }

      const ipv4 = addresses.find(
        (address): address is string =>
          typeof address === "string" &&
          /^\d{1,3}(?:\.\d{1,3}){3}$/.test(address),
      );

      if (ipv4) {
        return ipv4;
      }
    }
  }

  return "";
}

function sleep(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function runCLI(command: string): Promise<string> {
  const fullCommand = `bash -lc 'source ${OPENRC} ${OS_USER} ${OS_PROJECT} && ${command} 2>&1'`;

  try {
    const { stdout, stderr } = await execAsync(fullCommand, { timeout: 60000 });

    if (!stdout && stderr) {
      throw new Error(stderr.trim());
    }

    return stdout.trim();
  } catch (error: unknown) {
    const detail =
      error instanceof Error ? error.message : typeof error === "string" ? error : "";
    throw new Error(detail);
  }
}

export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

export async function writeTempScript(content: string): Promise<string> {
  const path = join(tmpdir(), `userdata-${randomUUID()}.sh`);
  await writeFile(path, content, { mode: 0o755 });
  return path;
}

export async function cleanupTempFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    // Ignore cleanup errors for temporary files.
  }
}

export async function lookupId(
  type: "image" | "flavor" | "network",
  name: string,
): Promise<string> {
  const raw = await runCLI(`openstack ${type} list -f json`);
  const list: Array<Record<string, string>> = JSON.parse(raw);

  const item = list.find((row) => row.Name === name || row.name === name);

  if (!item) {
    throw Object.assign(
      new Error(`${type} "${name}" không tồn tại trong OpenStack.`),
      { notFound: true },
    );
  }

  return item.ID || item.id;
}

export function normalizeHostnameLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63);
}

export function isValidHostnameLabel(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
}

export async function getServerDetails(serverRef: string) {
  const raw = await runCLI(
    `openstack server show ${escapeShellArg(serverRef)} -f json`,
  );

  return JSON.parse(raw) as Record<string, unknown>;
}

export async function getServerIP(serverRef: string): Promise<string | null> {
  try {
    const details = await getServerDetails(serverRef);
    const ip = extractIPv4(details.addresses || details.Addresses);
    return ip || null;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : typeof error === "string" ? error : "";

    if (message.includes("HTTP 401") || message.includes("Unauthorized")) {
      throw Object.assign(new Error("Xac thuc OpenStack that bai (401)."), {
        code: 401,
      });
    }

    if (message.includes("No server") || message.includes("HTTP 404")) {
      throw Object.assign(new Error("Khong tim thay server tuong ung (404)."), {
        code: 404,
      });
    }

    throw error;
  }
}

export async function waitForServerIP(
  serverRef: string,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
  },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 300_000;
  const intervalMs = options?.intervalMs ?? 5_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const ip = await getServerIP(serverRef);

    if (ip) {
      return ip;
    }

    await sleep(intervalMs);
  }

  throw new Error("VM da tao xong nhung chua lay duoc IP trong thoi gian cho.");
}

export function generatePostCreateScript(
  hostname: string,
  password: string,
  environments: string[],
): string {
  const env = environments || [];

  let script = `#!/bin/bash
# Hostname
hostnamectl set-hostname ${hostname}
echo "127.0.0.1 ${hostname}" >> /etc/hosts

# Passwords & SSH
echo "root:${password}" | chpasswd
echo "ubuntu:${password}" | chpasswd
sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
find /etc/ssh/sshd_config.d -type f -name "*.conf" -exec sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/' {} \\; 2>/dev/null || true
systemctl restart ssh 2>/dev/null || systemctl restart sshd

# Update
export DEBIAN_FRONTEND=noninteractive
apt-get update -y && apt-get upgrade -y
`;

  if (env.includes("docker")) {
    script += "apt-get install -y docker.io && systemctl enable --now docker\n";
  }
  if (env.includes("nodejs")) {
    script +=
      "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs\n";
  }
  if (env.includes("pm2")) {
    script += "npm install -g pm2\n";
  }
  if (env.includes("python") || env.includes("python3")) {
    script += "apt-get install -y python3 python3-pip\n";
  }
  if (env.includes("java") || env.includes("jdk")) {
    script += "apt-get install -y default-jdk\n";
  }
  if (env.includes("php")) {
    script += "apt-get install -y php php-cli php-fpm\n";
  }
  if (env.includes("composer")) {
    script += "apt-get install -y composer\n";
  }
  if (env.includes("go") || env.includes("golang")) {
    script += "apt-get install -y golang\n";
  }
  if (env.includes("git")) {
    script += "apt-get install -y git\n";
  }
  if (env.includes("mysql")) {
    script += "apt-get install -y mysql-server && systemctl enable --now mysql\n";
  }
  if (env.includes("postgresql") || env.includes("postgres")) {
    script +=
      "apt-get install -y postgresql postgresql-contrib && systemctl enable --now postgresql\n";
  }
  if (env.includes("mongodb") || env.includes("mongo")) {
    script += "apt-get install -y mongodb && systemctl enable --now mongodb\n";
  }
  if (env.includes("redis")) {
    script += "apt-get install -y redis-server && systemctl enable --now redis-server\n";
  }
  if (env.includes("nginx")) {
    script += "apt-get install -y nginx && systemctl enable --now nginx\n";
  }
  if (env.includes("apache2") || env.includes("apache")) {
    script += "apt-get install -y apache2 && systemctl enable --now apache2\n";
  }

  return script;
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
  ip?: string;
  error?: string;
}

export async function createOpenStackVM(
  data: CreateVMData,
  script: string,
): Promise<CreateVMResponse> {
  let scriptPath = "";

  try {
    const [imageId, flavorId, networkId] = await Promise.all([
      lookupId("image", data.os),
      lookupId("flavor", data.flavor),
      lookupId("network", data.network),
    ]);

    scriptPath = await writeTempScript(script);

    const command = [
      "openstack server create",
      `--image ${escapeShellArg(imageId)}`,
      `--flavor ${escapeShellArg(flavorId)}`,
      `--network ${escapeShellArg(networkId)}`,
      `--user-data ${escapeShellArg(scriptPath)}`,
      `${escapeShellArg(data.instance_name)}`,
      "-f json",
    ].join(" ");

    const output = await runCLI(command);
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
    return {
      success: false,
      vm_name: data.instance_name,
      status: "ERROR",
      error: String(error instanceof Error ? error.message : error),
    };
  } finally {
    if (scriptPath) {
      await cleanupTempFile(scriptPath);
    }
  }
}

export function getOpenStackEnv() {
  return {};
}

export { runCLI as runOpenStackCommand };
