import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const execAsync = promisify(exec);

// ─── Config ────────────────────────────────────────────────────────────────
const OPENRC = process.env.OPENRC_PATH || "/opt/stack/devstack/openrc";
const OS_USER = process.env.OS_USERNAME || "dung";
const OS_PROJECT = process.env.OS_PROJECT_NAME || "Dung_Prj";

// ─── Core CLI runner ───────────────────────────────────────────────────────
/**
 * Chạy lệnh OpenStack sau khi source openrc.
 * Mỗi call tự lấy token mới, không dùng token cứng.
 */
export async function runCLI(command: string): Promise<string> {
  // bash -l (login shell) để load đầy đủ PATH giống interactive terminal
  // Nếu không, Node.js subprocess không tìm thấy openstack binary
  const fullCmd = `bash -lc 'source ${OPENRC} ${OS_USER} ${OS_PROJECT} && ${command} 2>&1'`;
  try {
    const { stdout, stderr } = await execAsync(fullCmd, { timeout: 60000 });
    if (!stdout && stderr) throw new Error(stderr.trim());
    return stdout.trim();
  } catch (err: any) {
    const detail = err.stderr?.trim() || err.stdout?.trim() || err.message;
    throw new Error(detail);
  }
}

// ─── Shell escape ──────────────────────────────────────────────────────────
export function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// ─── Temp file ─────────────────────────────────────────────────────────────
export async function writeTempScript(content: string): Promise<string> {
  const path = join(tmpdir(), `userdata-${randomUUID()}.sh`);
  await writeFile(path, content, { mode: 0o755 });
  return path;
}

export async function cleanupTempFile(path: string): Promise<void> {
  try { await unlink(path); } catch { /* ignore */ }
}

// ─── Lookup ID: lấy full JSON list rồi filter theo Name trong Node.js ──────
export async function lookupId(
  type: "image" | "flavor" | "network",
  name: string
): Promise<string> {
  const raw = await runCLI(`openstack ${type} list -f json`);
  const list: any[] = JSON.parse(raw);

  // Các field Name khác nhau tùy type
  const item = list.find((r: any) =>
    (r.Name === name) || (r.name === name) ||
    (type === "image" && r.Name === name) ||
    (type === "flavor" && (r.Name === name || r.name === name)) ||
    (type === "network" && (r.Name === name || r.name === name))
  );

  if (!item) {
    throw Object.assign(
      new Error(`${type} "${name}" không tìm thấy trong OpenStack`),
      { notFound: true }
    );
  }

  return item.ID || item.id;
}

// ─── Generate cloud-init script ────────────────────────────────────────────
export function generatePostCreateScript(
  hostname: string,
  password: string,
  environments: string[]
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

  if (env.includes("docker")) script += "apt-get install -y docker.io && systemctl enable --now docker\n";
  if (env.includes("nodejs")) {
    script += "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs\n";
  }
  if (env.includes("pm2")) script += "npm install -g pm2\n";
  if (env.includes("python") || env.includes("python3")) script += "apt-get install -y python3 python3-pip\n";
  if (env.includes("java") || env.includes("jdk")) script += "apt-get install -y default-jdk\n";
  if (env.includes("php")) script += "apt-get install -y php php-cli php-fpm\n";
  if (env.includes("composer")) script += "apt-get install -y composer\n";
  if (env.includes("go") || env.includes("golang")) script += "apt-get install -y golang\n";
  if (env.includes("git")) script += "apt-get install -y git\n";
  if (env.includes("mysql")) script += "apt-get install -y mysql-server && systemctl enable --now mysql\n";
  if (env.includes("postgresql") || env.includes("postgres")) {
    script += "apt-get install -y postgresql postgresql-contrib && systemctl enable --now postgresql\n";
  }
  if (env.includes("mongodb") || env.includes("mongo")) script += "apt-get install -y mongodb && systemctl enable --now mongodb\n";
  if (env.includes("redis")) script += "apt-get install -y redis-server && systemctl enable --now redis-server\n";
  if (env.includes("nginx")) script += "apt-get install -y nginx && systemctl enable --now nginx\n";
  if (env.includes("apache2") || env.includes("apache")) script += "apt-get install -y apache2 && systemctl enable --now apache2\n";

  return script;
}

// ─── Types ─────────────────────────────────────────────────────────────────
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

// ─── Create VM ─────────────────────────────────────────────────────────────
export async function createOpenStackVM(
  data: CreateVMData,
  script: string
): Promise<CreateVMResponse> {
  let scriptPath = "";
  try {
    // 1. Resolve IDs (full list → filter in Node.js)
    const [imageId, flavorId, networkId] = await Promise.all([
      lookupId("image", data.os),
      lookupId("flavor", data.flavor),
      lookupId("network", data.network),
    ]);

    // 2. Write cloud-init script
    scriptPath = await writeTempScript(script);

    // 3. Create server
    const cmd = [
      "openstack server create",
      `--image ${escapeShellArg(imageId)}`,
      `--flavor ${escapeShellArg(flavorId)}`,
      `--network ${escapeShellArg(networkId)}`,
      `--user-data ${escapeShellArg(scriptPath)}`,
      `${escapeShellArg(data.instance_name)}`,
      "-f json",
    ].join(" ");

    const output = await runCLI(cmd);
    const result = JSON.parse(output);
    const vmId = result.id || result.ID;

    return { success: true, vm_name: data.instance_name, vm_id: vmId, status: result.status || "BUILD", ip: "" };
  } catch (error) {
    return { success: false, vm_name: data.instance_name, status: "ERROR", error: String(error instanceof Error ? error.message : error) };
  } finally {
    if (scriptPath) await cleanupTempFile(scriptPath);
  }
}

// ─── Backward compat ───────────────────────────────────────────────────────
export function getOpenStackEnv() { return {}; }
export { runCLI as runOpenStackCommand };
