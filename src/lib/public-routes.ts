export interface VmRouteSnapshot {
  route_key: string;
  hostname: string;
  domain: string;
  fqdn: string;
  target_ip: string;
  target_port: number;
  listen_port: number;
  config_path: string;
}

export interface VmRoutePortMapping {
  listen_port: number;
  target_port: number;
}

export const COMMON_PUBLIC_PORTS = [443, 3000, 8080, 80] as const;
export const COMMON_TARGET_PORTS = [3000, 8080, 443, 80] as const;

function sortWeight(port: number) {
  if (port === 443) {
    return -2;
  }

  if (port === 80) {
    return -1;
  }

  return port;
}

export function isValidPortNumber(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 65535;
}

export function parsePortNumber(value: unknown) {
  const port = Number(value);
  return isValidPortNumber(port) ? port : null;
}

export function getInitialListenPort(value?: number) {
  return isValidPortNumber(value) ? value : 443;
}

export function getInitialTargetPort(value?: number) {
  return isValidPortNumber(value) ? value : 3000;
}

export function buildPublicUrl(fqdn: string, listenPort: number) {
  if (!fqdn) {
    return "";
  }

  return listenPort === 443 ? `https://${fqdn}` : `https://${fqdn}:${listenPort}`;
}

export function sortVmRoutes(routes: VmRouteSnapshot[]) {
  return [...routes].sort(
    (left, right) => sortWeight(left.listen_port) - sortWeight(right.listen_port),
  );
}

export function pickPrimaryVmRoute(
  routes: VmRouteSnapshot[],
  preferredListenPort = 443,
) {
  const sorted = sortVmRoutes(routes);

  return (
    sorted.find((route) => route.listen_port === preferredListenPort) ??
    sorted.find((route) => route.listen_port === 443) ??
    sorted[0] ??
    null
  );
}

export function suggestListenPort(
  routes: Array<{ listen_port: number }>,
  fallbackTargetPort = 3000,
) {
  const usedPorts = new Set(routes.map((route) => route.listen_port));
  const suggestions = [
    443,
    3000,
    8080,
    80,
    8443,
    fallbackTargetPort,
    5000,
    5173,
    8000,
  ];

  for (const candidate of suggestions) {
    if (candidate >= 1 && candidate <= 65535 && !usedPorts.has(candidate)) {
      return candidate;
    }
  }

  let candidate = Math.max(3000, ...routes.map((route) => route.listen_port)) + 1;

  while (candidate <= 65535 && usedPorts.has(candidate)) {
    candidate += 1;
  }

  return candidate <= 65535 ? candidate : 443;
}
