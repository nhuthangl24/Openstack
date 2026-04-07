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
 * 1. Hàm generatePostCreateScript(body) bổ sung cấu hình user-data.
 */
export function generatePostCreateScript(
  instance_name: string,
  password: string,
  environments: string[]
): string {
  let script = `#!/bin/bash
# 1. Đặt hostname và cập nhật /etc/hosts
hostnamectl set-hostname ${instance_name}
echo "127.0.0.1 ${instance_name}" >> /etc/hosts

# 2. Đổi password cho root và ubuntu, bật SSH password login
echo "root:${password}" | chpasswd
echo "ubuntu:${password}" | chpasswd
sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
sed -i 's/^#\\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
find /etc/ssh/sshd_config.d -type f -name "*.conf" -exec sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/' {} \\;
systemctl restart ssh

# 3. Update & Upgrade mọi packages
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
`;

  // 4. Cài cắm môi trường theo mảng JSON
  if (environments.length > 0) {
    if (environments.includes("docker")) {
      script += "apt-get install -y docker.io\n";
    }
    if (environments.includes("nodejs")) {
      script += "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -\n";
      script += "apt-get install -y nodejs\n";
      if (environments.includes("pm2")) {
        script += "npm install -g pm2\n";
      }
    }
    if (environments.includes("python3") || environments.includes("python")) {
      script += "apt-get install -y python3 python3-pip\n";
    }
    if (environments.includes("java") || environments.includes("jdk")) {
      script += "apt-get install -y default-jdk\n";
    }
    if (environments.includes("php")) {
      script += "apt-get install -y php php-cli php-fpm\n";
      if (environments.includes("composer")) {
        script += "apt-get install -y composer\n";
      }
    }
    if (environments.includes("golang") || environments.includes("go")) {
      script += "apt-get install -y golang\n";
    }
    if (environments.includes("git")) {
      script += "apt-get install -y git\n";
    }
    if (environments.includes("mysql")) {
      script += "apt-get install -y mysql-server\n";
    }
    if (environments.includes("postgresql") || environments.includes("postgres")) {
      script += "apt-get install -y postgresql postgresql-contrib\n";
    }
    if (environments.includes("mongodb") || environments.includes("mongo")) {
      script += "apt-get install -y mongodb\n";
    }
    if (environments.includes("redis")) {
      script += "apt-get install -y redis-server\n";
    }
    if (environments.includes("nginx")) {
      script += "apt-get install -y nginx\n";
    }
    if (environments.includes("apache2") || environments.includes("apache")) {
      script += "apt-get install -y apache2\n";
    }
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
  ip?: string;
  error?: string;
  error_message?: string;
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


/**
 * Poll for VM status until ACTIVE and return the first IP found.
 */
export async function pollVMIP(
  vmId: string,
  envVars: Record<string, string>,
  maxAttempts = 24,
  intervalMs = 5000
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((r) => setTimeout(r, intervalMs));
      const out = await runOpenStackCommand(
        `openstack server show ${escapeShellArg(vmId)} -f json`,
        envVars
      );
      const vm = JSON.parse(out);
      if (vm.status === "ACTIVE") {
        // Parse addresses - could be object like { public: [{addr: '...'}] }
        const addresses = vm.addresses;
        if (addresses && typeof addresses === "object") {
          for (const net of Object.values(addresses) as any[]) {
            if (Array.isArray(net) && net.length > 0 && net[0].addr) {
              return net[0].addr;
            }
          }
        }
        // addresses may already be a string in some OpenStack versions
        if (typeof addresses === "string" && addresses.length > 0) {
          const match = addresses.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (match) return match[1];
        }
      }
    } catch {
      // Keep polling
    }
  }
  return "";
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
    const vmId = result.id || result.ID;

    return {
      success: true,
      vm_name: data.instance_name,
      vm_id: vmId,
      status: result.status || "BUILD",
      ip: "",
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
