interface RouteApiConfig {
  baseUrl: string;
  token: string;
  domain: string;
  defaultListenPort: number;
  defaultTargetPort: number;
}

export interface SyncVmRouteInput {
  routeKey: string;
  hostname: string;
  targetIp: string;
  listenPort?: number;
  previousListenPort?: number;
  targetPort?: number;
}

export interface VmRouteInfo {
  route_key: string;
  hostname: string;
  domain: string;
  fqdn: string;
  target_ip: string;
  target_port: number;
  listen_port: number;
  config_path: string;
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Thieu bien moi truong ${name}.`);
  }

  return value;
}

export function getConfiguredRouteDomain() {
  return (process.env.NGINX_ROUTE_DOMAIN || "orbitstack.app").trim();
}

export function getConfiguredRouteListenPort() {
  const port = Number(process.env.NGINX_ROUTE_LISTEN_PORT || 443);

  if (Number.isInteger(port) && port >= 1 && port <= 65535) {
    return port;
  }

  return 443;
}

export function getConfiguredRouteTargetPort() {
  const port = Number(process.env.NGINX_ROUTE_TARGET_PORT || 3000);

  if (Number.isInteger(port) && port >= 1 && port <= 65535) {
    return port;
  }

  return 3000;
}

function getRouteApiConfig(): RouteApiConfig {
  return {
    baseUrl: readRequiredEnv("NGINX_ROUTE_API_BASE_URL").replace(/\/+$/, ""),
    token: readRequiredEnv("NGINX_ROUTE_API_TOKEN"),
    domain: getConfiguredRouteDomain(),
    defaultListenPort: getConfiguredRouteListenPort(),
    defaultTargetPort: getConfiguredRouteTargetPort(),
  };
}

async function requestRouteApi(
  path: string,
  init: {
    method: string;
    body?: Record<string, unknown>;
  },
) {
  const config = getRouteApiConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (response.ok) {
    return response;
  }

  let detail = response.statusText;

  try {
    const payload = (await response.json()) as {
      error?: string;
      detail?: string;
    };
    detail = payload.error || payload.detail || detail;
  } catch {
    const text = await response.text();
    if (text.trim()) {
      detail = text.trim();
    }
  }

  throw new Error(`Nginx route API loi (${response.status}): ${detail}`);
}

export async function syncVmRoute(input: SyncVmRouteInput) {
  const config = getRouteApiConfig();
  const routeKey = encodeURIComponent(input.routeKey);

  await requestRouteApi(`/routes/${routeKey}`, {
    method: "PUT",
    body: {
      hostname: input.hostname,
      target_ip: input.targetIp,
      listen_port: input.listenPort || config.defaultListenPort,
      previous_listen_port: input.previousListenPort,
      target_port: input.targetPort || config.defaultTargetPort,
      domain: config.domain,
    },
  });
}

export async function removeVmRoute(routeKey: string, listenPort?: number) {
  const path = listenPort
    ? `/routes/${encodeURIComponent(routeKey)}?listen_port=${encodeURIComponent(String(listenPort))}`
    : `/routes/${encodeURIComponent(routeKey)}`;

  await requestRouteApi(path, {
    method: "DELETE",
  });
}

export async function getVmRoute(routeKey: string, listenPort?: number): Promise<VmRouteInfo | null> {
  try {
    const path = listenPort
      ? `/routes/${encodeURIComponent(routeKey)}?listen_port=${encodeURIComponent(String(listenPort))}`
      : `/routes/${encodeURIComponent(routeKey)}`;
    const response = await requestRouteApi(path, {
      method: "GET",
    });
    const payload = (await response.json()) as {
      route?: VmRouteInfo;
      routes?: VmRouteInfo[];
    };

    if (payload.route) {
      return payload.route;
    }

    return payload.routes?.[0] ?? null;
  } catch (error) {
    if (error instanceof Error && error.message.includes("(404)")) {
      return null;
    }

    throw error;
  }
}

export async function getVmRoutes(routeKey: string): Promise<VmRouteInfo[]> {
  try {
    const response = await requestRouteApi(`/routes/${encodeURIComponent(routeKey)}`, {
      method: "GET",
    });
    const payload = (await response.json()) as {
      route?: VmRouteInfo;
      routes?: VmRouteInfo[];
    };

    if (Array.isArray(payload.routes)) {
      return payload.routes;
    }

    return payload.route ? [payload.route] : [];
  } catch (error) {
    if (error instanceof Error && error.message.includes("(404)")) {
      return [];
    }

    throw error;
  }
}
