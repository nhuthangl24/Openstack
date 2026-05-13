"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Globe,
  Loader2,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { copyToClipboard } from "@/lib/clipboard";
import {
  buildPublicUrl,
  COMMON_PUBLIC_PORTS,
  COMMON_TARGET_PORTS,
  getInitialListenPort,
  getInitialTargetPort,
  parsePortNumber,
  pickPrimaryVmRoute,
  sortVmRoutes,
  type VmRouteSnapshot,
} from "@/lib/public-routes";
import { cn } from "@/lib/utils";

interface PublicRouteManagerProps {
  vmName: string;
  vmId?: string;
  vmIp?: string;
  hostname?: string;
  title?: string;
  description?: string;
  emptyMessage?: string;
  initialRoutes?: VmRouteSnapshot[];
  initialNotice?: string;
  className?: string;
  onRoutesChange?: (routes: VmRouteSnapshot[]) => void;
}

function buildRouteSummary(route: VmRouteSnapshot, vmIp?: string) {
  return `${buildPublicUrl(route.fqdn, route.listen_port)} -> ${vmIp || route.target_ip}:${route.target_port}`;
}

export default function PublicRouteManager({
  vmName,
  vmId,
  vmIp,
  hostname,
  title = "Public routes",
  description = "Map nhieu host port vao cac dich vu dang chay ben trong VM nay.",
  emptyMessage = "Chua co route public cho VM nay.",
  initialRoutes,
  initialNotice = "",
  className,
  onRoutesChange,
}: PublicRouteManagerProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [routes, setRoutes] = useState<VmRouteSnapshot[]>(() =>
    sortVmRoutes(initialRoutes || []),
  );
  const [selectedListenPort, setSelectedListenPort] = useState<number | null>(
    () => pickPrimaryVmRoute(initialRoutes || [])?.listen_port ?? null,
  );
  const [listenPortInput, setListenPortInput] = useState(() =>
    String(getInitialListenPort(pickPrimaryVmRoute(initialRoutes || [])?.listen_port)),
  );
  const [targetPortInput, setTargetPortInput] = useState(() =>
    String(getInitialTargetPort(pickPrimaryVmRoute(initialRoutes || [])?.target_port)),
  );
  const [message, setMessage] = useState(initialNotice);
  const [copiedRoutePort, setCopiedRoutePort] = useState<number | null>(null);
  const selectedListenPortRef = useRef<number | null>(selectedListenPort);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.listen_port === selectedListenPort) ?? null,
    [routes, selectedListenPort],
  );

  const applyRoutes = useCallback(
    (nextRoutes: VmRouteSnapshot[], preferredListenPort?: number | null) => {
      const sorted = sortVmRoutes(nextRoutes);
      const preferredRoute =
        (preferredListenPort == null
          ? null
          : sorted.find((route) => route.listen_port === preferredListenPort) ?? null) ??
        pickPrimaryVmRoute(sorted);

      setRoutes(sorted);
      setSelectedListenPort(preferredRoute?.listen_port ?? null);
      setListenPortInput(String(getInitialListenPort(preferredRoute?.listen_port)));
      setTargetPortInput(String(getInitialTargetPort(preferredRoute?.target_port)));
      onRoutesChange?.(sorted);
    },
    [onRoutesChange],
  );

  useEffect(() => {
    selectedListenPortRef.current = selectedListenPort;
  }, [selectedListenPort]);

  function selectRoute(route: VmRouteSnapshot) {
    setSelectedListenPort(route.listen_port);
    setListenPortInput(String(route.listen_port));
    setTargetPortInput(String(route.target_port));
    setMessage("");
  }

  function prepareNewRoute() {
    const baseTargetPort =
      selectedRoute?.target_port ?? pickPrimaryVmRoute(routes)?.target_port ?? 3000;

    setSelectedListenPort(null);
    setListenPortInput(String(baseTargetPort));
    setTargetPortInput(String(baseTargetPort));
    setMessage("");
  }

  useEffect(() => {
    const seededRoutes = sortVmRoutes(initialRoutes || []);
    applyRoutes(seededRoutes, pickPrimaryVmRoute(seededRoutes)?.listen_port ?? null);
    setMessage(initialNotice);
  }, [applyRoutes, initialNotice, initialRoutes, vmName]);

  useEffect(() => {
    let cancelled = false;

    async function loadRoutes() {
      if (!vmName) {
        applyRoutes([]);
        setMessage("");
        return;
      }

      setLoading(true);

      try {
        const response = await fetch(
          `/api/vm-route?vm_name=${encodeURIComponent(vmName)}`,
          { cache: "no-store" },
        );
        const data = await response.json();

        if (cancelled) {
          return;
        }

        if (!response.ok || !data.success) {
          applyRoutes([]);
          setMessage(data.error_message || emptyMessage);
          return;
        }

        const nextRoutes = Array.isArray(data.routes)
          ? (data.routes as VmRouteSnapshot[])
          : data.route
            ? [data.route as VmRouteSnapshot]
            : [];

        applyRoutes(nextRoutes, selectedListenPortRef.current);
        setMessage(nextRoutes.length === 0 ? emptyMessage : "");
      } catch {
        if (!cancelled) {
          applyRoutes([]);
          setMessage("Khong tai duoc danh sach public route.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRoutes();

    return () => {
      cancelled = true;
    };
  }, [applyRoutes, emptyMessage, vmName]);

  async function handleCopy(route: VmRouteSnapshot) {
    const ok = await copyToClipboard(buildPublicUrl(route.fqdn, route.listen_port));

    if (!ok) {
      toast.error("Khong the sao chep URL public.");
      return;
    }

    setCopiedRoutePort(route.listen_port);
    window.setTimeout(
      () => setCopiedRoutePort((current) => (current === route.listen_port ? null : current)),
      1400,
    );
    toast.success("Da sao chep URL public.");
  }

  async function handleSave() {
    const listenPort = parsePortNumber(listenPortInput);
    const targetPort = parsePortNumber(targetPortInput);

    if (!listenPort) {
      const detail = "Host port khong hop le. Hay nhap so tu 1 den 65535.";
      setMessage(detail);
      toast.error("Khong cap nhat duoc route", { description: detail });
      return;
    }

    if (!targetPort) {
      const detail = "Target port khong hop le. Hay nhap so tu 1 den 65535.";
      setMessage(detail);
      toast.error("Khong cap nhat duoc route", { description: detail });
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/update-vm-route", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vm_name: vmName,
          hostname,
          target_ip: vmIp || selectedRoute?.target_ip || undefined,
          listen_port: listenPort,
          target_port: targetPort,
          previous_listen_port: selectedRoute?.listen_port ?? undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error_message || data.error || "Khong cap nhat duoc route.");
      }

      const nextRoute: VmRouteSnapshot = {
        route_key: data.vm_name || vmName,
        hostname: data.hostname,
        domain: data.domain || "",
        fqdn: data.fqdn,
        target_ip: data.ip,
        target_port: data.target_port,
        listen_port: data.listen_port,
        config_path: data.config_path || "",
      };

      applyRoutes(
        [
          ...routes.filter((route) => {
            if (selectedRoute?.listen_port != null && route.listen_port === selectedRoute.listen_port) {
              return false;
            }

            return route.listen_port !== nextRoute.listen_port;
          }),
          nextRoute,
        ],
        nextRoute.listen_port,
      );
      setMessage("");

      toast.success("Da luu public route", {
        description: buildRouteSummary(nextRoute, vmIp),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Khong cap nhat duoc route.";
      setMessage(detail);
      toast.error("Cap nhat route that bai", { description: detail });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedRoute) {
      return;
    }

    setDeleting(true);

    try {
      const response = await fetch("/api/update-vm-route", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vm_name: vmName,
          listen_port: selectedRoute.listen_port,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error_message || data.error || "Khong xoa duoc route.");
      }

      const nextRoutes = routes.filter(
        (route) => route.listen_port !== selectedRoute.listen_port,
      );
      applyRoutes(nextRoutes);
      setMessage(nextRoutes.length === 0 ? emptyMessage : "");

      toast.success("Da xoa public route", {
        description: buildPublicUrl(selectedRoute.fqdn, selectedRoute.listen_port),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Khong xoa duoc route.";
      setMessage(detail);
      toast.error("Xoa route that bai", { description: detail });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={cn("rounded-[1.2rem] border border-border/70 bg-background/75 p-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          {selectedRoute ? (
            <>
              <p className="mt-3 break-all font-mono text-sm text-foreground">
                {buildPublicUrl(selectedRoute.fqdn, selectedRoute.listen_port)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Host :{selectedRoute.listen_port}
                {" -> "}
                {(vmIp || selectedRoute.target_ip || "IP cua VM")}:
                {selectedRoute.target_port}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-foreground">{emptyMessage}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={prepareNewRoute}
            disabled={loading || saving || deleting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[0.85rem] border border-border/70 bg-background/70 px-3 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Them port
          </button>

          {selectedRoute ? (
            <>
              <button
                type="button"
                onClick={() => void handleCopy(selectedRoute)}
                disabled={loading || saving || deleting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[0.85rem] border border-border/70 bg-background/70 px-3 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                {copiedRoutePort === selectedRoute.listen_port ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Copy URL
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={loading || saving || deleting}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-[0.85rem] border border-rose-500/25 bg-rose-500/10 px-3 text-xs font-semibold text-rose-200 transition hover:border-rose-500/40 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Xoa
              </button>
            </>
          ) : null}
        </div>
      </div>

      {message ? (
        <div className="mt-4 flex items-start gap-3 rounded-[1rem] border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{message}</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {loading ? (
          <div className="flex items-center gap-3 rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Dang tai danh sach route public...
          </div>
        ) : routes.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {routes.map((route) => {
              const active = route.listen_port === selectedRoute?.listen_port;
              return (
                <button
                  key={`${route.route_key}-${route.listen_port}`}
                  type="button"
                  onClick={() => selectRoute(route)}
                  className={cn(
                    "rounded-[1rem] border px-4 py-3 text-left transition",
                    active
                      ? "border-primary/35 bg-primary/10 shadow-[0_0_0_1px_rgba(59,130,246,0.12)]"
                      : "border-border/70 bg-background/70 hover:border-primary/30",
                  )}
                >
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <Globe className="h-3.5 w-3.5" />
                    Host Port :{route.listen_port}
                  </div>
                  <p className="mt-2 break-all font-mono text-sm text-foreground">
                    {buildPublicUrl(route.fqdn, route.listen_port)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Target {(vmIp || route.target_ip || "IP cua VM")}:{route.target_port}
                  </p>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Host port
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Port ma Nginx se lang nghe tren domain nay. Vi du 443, 3000, 8080.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {COMMON_PUBLIC_PORTS.map((port) => {
              const selected = Number(listenPortInput) === port;

              return (
                <button
                  key={`host-${port}`}
                  type="button"
                  onClick={() => setListenPortInput(String(port))}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    selected
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/70 bg-background/70 text-foreground hover:border-primary/30",
                  )}
                >
                  {port}
                </button>
              );
            })}
          </div>
          <Input
            id={vmId ? `route-listen-port-${vmId}` : `route-listen-port-${vmName}`}
            type="number"
            min={1}
            max={65535}
            inputMode="numeric"
            value={listenPortInput}
            onChange={(event) => setListenPortInput(event.target.value)}
            disabled={loading || saving || deleting}
            className="mt-3 h-10 bg-background/70 font-mono"
          />
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Target port
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Port cua ung dung ben trong VM. Vi du Node app o 3000 va admin panel o 8080.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {COMMON_TARGET_PORTS.map((port) => {
              const selected = Number(targetPortInput) === port;

              return (
                <button
                  key={`target-${port}`}
                  type="button"
                  onClick={() => setTargetPortInput(String(port))}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    selected
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/70 bg-background/70 text-foreground hover:border-primary/30",
                  )}
                >
                  {port}
                </button>
              );
            })}
          </div>
          <Input
            id={vmId ? `route-target-port-${vmId}` : `route-target-port-${vmName}`}
            type="number"
            min={1}
            max={65535}
            inputMode="numeric"
            value={targetPortInput}
            onChange={(event) => setTargetPortInput(event.target.value)}
            disabled={loading || saving || deleting}
            className="mt-3 h-10 bg-background/70 font-mono"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={loading || saving || deleting}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[0.85rem] bg-foreground px-4 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {selectedRoute ? "Luu route" : "Tao route"}
        </button>

        <p className="text-xs leading-5 text-muted-foreground">
          Cung mot domain co the co nhieu host port khac nhau, vi du
          {" "}
          <span className="font-mono">:3000</span>
          {" "}
          va
          {" "}
          <span className="font-mono">:8080</span>
          .
        </p>
      </div>
    </div>
  );
}
