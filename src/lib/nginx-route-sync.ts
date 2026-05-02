import { readFile } from "node:fs/promises";
import { Client, type ConnectConfig } from "ssh2";
import { escapeShellArg } from "@/lib/openstack";

interface RouteSyncConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  privateKey?: string;
  domain: string;
  remoteScriptPath: string;
  defaultTargetPort: number;
}

export interface SyncVmRouteInput {
  routeKey: string;
  hostname: string;
  targetIp: string;
  targetPort?: number;
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Thieu bien moi truong ${name}.`);
  }

  return value;
}

async function loadPrivateKey() {
  const inlineKey = process.env.NGINX_ROUTE_SSH_PRIVATE_KEY?.trim();

  if (inlineKey) {
    return inlineKey.replace(/\\n/g, "\n");
  }

  const privateKeyPath = process.env.NGINX_ROUTE_SSH_PRIVATE_KEY_PATH?.trim();

  if (!privateKeyPath) {
    return undefined;
  }

  return readFile(privateKeyPath, "utf8");
}

async function getRouteSyncConfig(): Promise<RouteSyncConfig> {
  const privateKey = await loadPrivateKey();
  const password = process.env.NGINX_ROUTE_SSH_PASSWORD?.trim();

  if (!privateKey && !password) {
    throw new Error(
      "Can cau hinh NGINX_ROUTE_SSH_PASSWORD hoac NGINX_ROUTE_SSH_PRIVATE_KEY.",
    );
  }

  return {
    host: readRequiredEnv("NGINX_ROUTE_SSH_HOST"),
    port: Number(process.env.NGINX_ROUTE_SSH_PORT || 22),
    user: readRequiredEnv("NGINX_ROUTE_SSH_USER"),
    password: password || undefined,
    privateKey,
    domain: (process.env.NGINX_ROUTE_DOMAIN || "orbitstack.app").trim(),
    remoteScriptPath: (
      process.env.NGINX_ROUTE_REMOTE_SCRIPT || "/usr/local/bin/orbitstack-route"
    ).trim(),
    defaultTargetPort: Number(process.env.NGINX_ROUTE_TARGET_PORT || 80),
  };
}

function getSshConnectConfig(config: RouteSyncConfig): ConnectConfig {
  return {
    host: config.host,
    port: config.port,
    username: config.user,
    password: config.password,
    privateKey: config.privateKey,
    readyTimeout: 15_000,
  };
}

async function runRemoteCommand(command: string) {
  const config = await getRouteSyncConfig();
  const connection = new Client();

  return new Promise<string>((resolve, reject) => {
    connection
      .on("ready", () => {
        connection.exec(command, (execError, stream) => {
          if (execError) {
            connection.end();
            reject(execError);
            return;
          }

          let stdout = "";
          let stderr = "";

          stream.on("close", (code: number | null) => {
            connection.end();

            if (code === 0) {
              resolve(stdout.trim());
              return;
            }

            reject(new Error(stderr.trim() || stdout.trim() || `Lenh loi voi ma ${code}.`));
          });

          stream.on("data", (chunk: Buffer | string) => {
            stdout += chunk.toString();
          });

          stream.stderr.on("data", (chunk: Buffer | string) => {
            stderr += chunk.toString();
          });
        });
      })
      .on("error", (error) => {
        reject(error);
      })
      .connect(getSshConnectConfig(config));
  });
}

export async function syncVmRoute(input: SyncVmRouteInput) {
  const config = await getRouteSyncConfig();
  const command = [
    "sudo",
    escapeShellArg(config.remoteScriptPath),
    "upsert",
    escapeShellArg(input.routeKey),
    escapeShellArg(input.hostname),
    escapeShellArg(input.targetIp),
    escapeShellArg(String(input.targetPort || config.defaultTargetPort)),
    escapeShellArg(config.domain),
  ].join(" ");

  return runRemoteCommand(command);
}

export async function removeVmRoute(routeKey: string) {
  const config = await getRouteSyncConfig();
  const command = [
    "sudo",
    escapeShellArg(config.remoteScriptPath),
    "remove",
    escapeShellArg(routeKey),
  ].join(" ");

  return runRemoteCommand(command);
}
