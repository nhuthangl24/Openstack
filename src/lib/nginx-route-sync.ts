interface RouteApiConfig {
  baseUrl: string;
  token: string;
  domain: string;
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

function getRouteApiConfig(): RouteApiConfig {
  return {
    baseUrl: readRequiredEnv("NGINX_ROUTE_API_BASE_URL").replace(/\/+$/, ""),
    token: readRequiredEnv("NGINX_ROUTE_API_TOKEN"),
    domain: (process.env.NGINX_ROUTE_DOMAIN || "orbitstack.app").trim(),
    defaultTargetPort: Number(process.env.NGINX_ROUTE_TARGET_PORT || 80),
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
      target_port: input.targetPort || config.defaultTargetPort,
      domain: config.domain,
    },
  });
}

export async function removeVmRoute(routeKey: string) {
  await requestRouteApi(`/routes/${encodeURIComponent(routeKey)}`, {
    method: "DELETE",
  });
}
