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

function getSuggestedListenPort(
  routes: VmRouteSnapshot[],
  fallbackTargetPort: number,
) {
  const usedPorts = new Set(routes.map((route) => route.listen_port));
  const suggestions = [443, 3000, 8080, 80, 8443, fallbackTargetPort, 5000, 5173, 8000];

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

function RouteStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1rem] border border-border/70 bg-background/60 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-all font-mono text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default function PublicRouteManager({
  vmName,
  vmId,
  vmIp,
  hostname,
  title = "Public routes",
  description = "Quan ly danh sach mapping public cho VM nay. Moi mapping la 1 host port -> 1 target port.",
  emptyMessage = "Chua co mapping public nao cho VM nay.",
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
  const isCreating = !selectedRoute;
  const parsedListenPort = parsePortNumber(listenPortInput);
  const parsedTargetPort = parsePortNumber(targetPortInput);
  const activeDomain = selectedRoute?.domain || routes[0]?.domain || "";
  const activeFqdn =
    selectedRoute?.fqdn ||
    (hostname && activeDomain ? `${hostname}.${activeDomain}` : "") ||
    routes[0]?.fqdn ||
    "";
  const previewTargetIp = vmIp || selectedRoute?.target_ip || routes[0]?.target_ip || "IP cua VM";
  const previewUrl =
    activeFqdn && parsedListenPort ? buildPublicUrl(activeFqdn, parsedListenPort) : "";

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
    setListenPortInput(String(getSuggestedListenPort(routes, baseTargetPort)));
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
          setMessage(response.status === 404 ? "" : data.error_message || emptyMessage);
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
    if (!parsedListenPort) {
      const detail = "Host port khong hop le. Hay nhap so tu 1 den 65535.";
      setMessage(detail);
      toast.error("Khong cap nhat duoc route", { description: detail });
      return;
    }

    if (!parsedTargetPort) {
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
          listen_port: parsedListenPort,
          target_port: parsedTargetPort,
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
            if (
              selectedRoute?.listen_port != null &&
              route.listen_port === selectedRoute.listen_port
            ) {
              return false;
            }

            return route.listen_port !== nextRoute.listen_port;
          }),
          nextRoute,
        ],
        nextRoute.listen_port,
      );
      setMessage("");

      toast.success(isCreating ? "Da tao mapping public" : "Da cap nhat mapping public", {
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
      setMessage("");

      toast.success("Da xoa mapping public", {
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
    <div
      className={cn(
        "rounded-[1.25rem] border border-border/70 bg-background/75 p-4 backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-semibold text-foreground">
            {routes.length} mapping
          </div>
          <button
            type="button"
            onClick={prepareNewRoute}
            disabled={loading || saving || deleting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border/70 bg-background/80 px-4 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Them mapping
          </button>
        </div>
      </div>

      {message ? (
        <div className="mt-4 flex items-start gap-3 rounded-[1rem] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{message}</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Danh sach mapping
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Moi dong la mot host port cong khai tro vao mot target port ben trong VM.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Dang tai danh sach route public...
            </div>
          ) : routes.length > 0 ? (
            <div className="space-y-3">
              {routes.map((route) => {
                const active = route.listen_port === selectedRoute?.listen_port;

                return (
                  <div
                    key={`${route.route_key}-${route.listen_port}`}
                    className={cn(
                      "rounded-[1.1rem] border px-4 py-4 transition",
                      active
                        ? "border-foreground/20 bg-background/85 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]"
                        : "border-border/70 bg-background/60 hover:border-foreground/15",
                    )}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Host :{route.listen_port}
                          </span>
                          <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Target :{route.target_port}
                          </span>
                          {active ? (
                            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                              Dang chinh
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-3 break-all font-mono text-sm font-semibold text-foreground">
                          {buildPublicUrl(route.fqdn, route.listen_port)}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Forward toi {(vmIp || route.target_ip || "IP cua VM")}:{route.target_port}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => selectRoute(route)}
                          className={cn(
                            "inline-flex h-9 items-center justify-center rounded-full border px-3 text-xs font-semibold transition",
                            active
                              ? "border-foreground/20 bg-background/80 text-foreground"
                              : "border-border/70 bg-background/80 text-foreground hover:border-primary/30 hover:text-primary",
                          )}
                        >
                          {active ? "Dang chinh" : "Sua"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopy(route)}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:text-primary"
                        >
                          {copiedRoutePort === route.listen_port ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[1.1rem] border border-dashed border-border/70 bg-background/55 px-4 py-5 text-sm leading-6 text-muted-foreground">
              {emptyMessage}
              {" "}
              Bam
              {" "}
              <span className="font-semibold text-foreground">Them mapping</span>
              {" "}
              de tao host port dau tien.
            </div>
          )}
        </section>

        <section className="rounded-[1.15rem] border border-border/70 bg-background/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {isCreating ? "Tao mapping moi" : `Sua mapping :${selectedRoute.listen_port}`}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {isCreating
                  ? "Nhap host port cong khai va target port ben trong VM. Khong bi gioi han 2 hay 3 cong."
                  : "Chinh sua mapping dang chon, hoac tao them mapping moi neu VM can nhieu cong cong khai."}
              </p>
            </div>

            {!isCreating ? (
              <button
                type="button"
                onClick={prepareNewRoute}
                disabled={loading || saving || deleting}
                className="inline-flex h-9 items-center justify-center rounded-full border border-border/70 bg-background/80 px-3 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Tao moi
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <RouteStat label="Preview host port" value={`:${listenPortInput || "?"}`} />
            <RouteStat label="Preview target" value={`${previewTargetIp}:${targetPortInput || "?"}`} />
          </div>

          {previewUrl ? (
            <div className="mt-4 rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Globe className="h-3.5 w-3.5" />
                Preview URL
              </div>
              <p className="mt-2 break-all font-mono text-sm font-semibold text-foreground">
                {previewUrl}
              </p>
            </div>
          ) : null}

          <div className="mt-4 grid gap-4">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Host port
              </span>
              <Input
                id={vmId ? `route-listen-port-${vmId}` : `route-listen-port-${vmName}`}
                type="number"
                min={1}
                max={65535}
                inputMode="numeric"
                value={listenPortInput}
                onChange={(event) => setListenPortInput(event.target.value)}
                disabled={loading || saving || deleting}
                placeholder="443, 3000, 8080, 8443..."
                className="mt-2 h-11 bg-background/75 font-mono"
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Port ma Nginx se lang nghe tren domain nay. Ban co the dung bat ky cong hop le nao.
              </p>
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Target port
              </span>
              <Input
                id={vmId ? `route-target-port-${vmId}` : `route-target-port-${vmName}`}
                type="number"
                min={1}
                max={65535}
                inputMode="numeric"
                value={targetPortInput}
                onChange={(event) => setTargetPortInput(event.target.value)}
                disabled={loading || saving || deleting}
                placeholder="3000, 8080, 80..."
                className="mt-2 h-11 bg-background/75 font-mono"
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Port cua ung dung ben trong VM ma mapping nay se forward toi.
              </p>
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={loading || saving || deleting}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isCreating ? "Tao mapping" : "Luu thay doi"}
            </button>

            {!isCreating ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={loading || saving || deleting}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-rose-500/25 bg-rose-500/10 px-5 text-sm font-semibold text-rose-200 transition hover:border-rose-500/40 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Xoa mapping
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
