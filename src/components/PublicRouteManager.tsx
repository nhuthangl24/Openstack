"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
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
  isValidPortNumber,
  parsePortNumber,
  pickPrimaryVmRoute,
  sortVmRoutes,
  suggestListenPort,
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

type PartialRoute = Partial<VmRouteSnapshot>;

function buildRouteSummary(route: VmRouteSnapshot, vmIp?: string) {
  return `${buildPublicUrl(route.fqdn, route.listen_port)} -> ${vmIp || route.target_ip}:${route.target_port}`;
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
  description = "Quan ly danh sach host port cong khai va target port cho VM dang chon.",
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
  const [editorOpen, setEditorOpen] = useState(() => (initialRoutes?.length ? false : true));
  const selectedListenPortRef = useRef<number | null>(selectedListenPort);

  const normalizeRoute = useCallback(
    (route: PartialRoute, fallback?: PartialRoute): VmRouteSnapshot | null => {
      const fallbackListenPort = parsePortNumber(fallback?.listen_port);
      const fallbackTargetPort = parsePortNumber(fallback?.target_port) || 3000;
      const derivedListenPort =
        parsePortNumber(route.listen_port) ||
        (() => {
          const configMatch = route.config_path?.match(/-(\d+)\.conf$/);
          return configMatch ? parsePortNumber(configMatch[1]) : null;
        })() ||
        fallbackListenPort;

      if (!derivedListenPort) {
        return null;
      }

      const hostnameValue = route.hostname || fallback?.hostname || hostname || vmName;
      const domainValue = route.domain || fallback?.domain || "";
      const fqdnValue =
        route.fqdn ||
        fallback?.fqdn ||
        (hostnameValue && domainValue ? `${hostnameValue}.${domainValue}` : "");

      if (!fqdnValue) {
        return null;
      }

      return {
        route_key: route.route_key || fallback?.route_key || vmName,
        hostname: hostnameValue,
        domain: domainValue,
        fqdn: fqdnValue,
        target_ip: route.target_ip || fallback?.target_ip || vmIp || "",
        target_port: parsePortNumber(route.target_port) || fallbackTargetPort,
        listen_port: derivedListenPort,
        config_path: route.config_path || fallback?.config_path || "",
      };
    },
    [hostname, vmIp, vmName],
  );

  const normalizeRoutes = useCallback(
    (nextRoutes: PartialRoute[]) => {
      const deduped = new Map<number, VmRouteSnapshot>();

      for (const route of nextRoutes) {
        const normalized = normalizeRoute(route);

        if (!normalized) {
          continue;
        }

        deduped.set(normalized.listen_port, normalized);
      }

      return sortVmRoutes([...deduped.values()]);
    },
    [normalizeRoute],
  );

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
  const editorTitle = isCreating
    ? "Tao mapping moi"
    : `Sua mapping :${selectedRoute.listen_port}`;

  const applyRoutes = useCallback(
    (nextRoutes: PartialRoute[], preferredListenPort?: number | null) => {
      const sorted = normalizeRoutes(nextRoutes);
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
    [normalizeRoutes, onRoutesChange],
  );

  useEffect(() => {
    selectedListenPortRef.current = selectedListenPort;
  }, [selectedListenPort]);

  useEffect(() => {
    if (routes.length === 0) {
      setEditorOpen(true);
    }
  }, [routes.length]);

  function selectRoute(route: VmRouteSnapshot) {
    setSelectedListenPort(route.listen_port);
    setListenPortInput(String(route.listen_port));
    setTargetPortInput(String(route.target_port));
    setEditorOpen(true);
    setMessage("");
  }

  function prepareNewRoute() {
    const baseTargetPort =
      selectedRoute?.target_port ?? pickPrimaryVmRoute(routes)?.target_port ?? 3000;

    setSelectedListenPort(null);
    setListenPortInput(String(suggestListenPort(routes, baseTargetPort)));
    setTargetPortInput(String(baseTargetPort));
    setEditorOpen(true);
    setMessage("");
  }

  function collapseEditor() {
    if (routes.length > 0) {
      setEditorOpen(false);
      setMessage("");
    }
  }

  useEffect(() => {
    applyRoutes(initialRoutes || [], pickPrimaryVmRoute(initialRoutes || [])?.listen_port ?? null);
    setMessage(initialNotice);
    setEditorOpen((initialRoutes?.length || 0) === 0);
  }, [applyRoutes, initialNotice, initialRoutes]);

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
          ? (data.routes as PartialRoute[])
          : data.route
            ? [data.route as PartialRoute]
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

      const nextRoute = normalizeRoute(data as PartialRoute, {
        route_key: vmName,
        hostname: data.hostname || hostname || vmName,
        domain: data.domain,
        fqdn: data.fqdn,
        target_ip: data.ip || vmIp || selectedRoute?.target_ip,
        listen_port: parsedListenPort,
        target_port: parsedTargetPort,
      });

      if (!nextRoute) {
        throw new Error("Khong dong bo duoc du lieu route vua luu.");
      }

      const replacedPorts = new Set<number>([nextRoute.listen_port]);

      if (selectedRoute?.listen_port) {
        replacedPorts.add(selectedRoute.listen_port);
      }

      applyRoutes(
        [
          ...routes.filter((route) => !replacedPorts.has(route.listen_port)),
          nextRoute,
        ],
        nextRoute.listen_port,
      );
      setMessage("");
      setEditorOpen(false);

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
    const listenPortToDelete = selectedRoute?.listen_port ?? parsedListenPort;

    if (!isValidPortNumber(listenPortToDelete)) {
      const detail = "Khong xac dinh duoc host port de xoa.";
      setMessage(detail);
      toast.error("Xoa route that bai", { description: detail });
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
          listen_port: listenPortToDelete,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error_message || data.error || "Khong xoa duoc route.");
      }

      const nextRoutes = routes.filter((route) => route.listen_port !== listenPortToDelete);
      applyRoutes(nextRoutes);
      setMessage("");
      setEditorOpen(nextRoutes.length === 0);

      toast.success("Da xoa mapping public", {
        description: activeFqdn ? buildPublicUrl(activeFqdn, listenPortToDelete) : `:${listenPortToDelete}`,
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
        "min-w-0 rounded-[1.35rem] border border-border/70 bg-background/75 p-5 backdrop-blur sm:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-foreground">
            {routes.length} mapping
          </div>
          <button
            type="button"
            onClick={prepareNewRoute}
            disabled={loading || saving || deleting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border/70 bg-background/80 px-4 text-sm font-semibold whitespace-nowrap text-foreground transition hover:border-primary/35 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Them mapping
          </button>
          {routes.length > 0 ? (
            <button
              type="button"
              onClick={() => setEditorOpen((current) => !current)}
              disabled={loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-border/70 bg-background/80 px-4 text-sm font-semibold whitespace-nowrap text-foreground transition hover:border-primary/35 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {editorOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {editorOpen ? "Thu gon" : "Mo form"}
            </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <div className="mt-4 flex items-start gap-3 rounded-[1rem] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{message}</p>
        </div>
      ) : null}

      <div
        className={cn(
          "mt-5 grid gap-5",
          editorOpen
            ? "2xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.95fr)]"
            : "grid-cols-1",
        )}
      >
        <section className="min-w-0 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Danh sach mapping
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Moi dong la mot host port cong khai tro vao mot target port ben trong VM.
            </p>
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
                      "min-w-0 rounded-[1.1rem] border px-4 py-4 transition",
                      active
                        ? "border-foreground/20 bg-background/85 shadow-[0_0_0_1px_rgba(255,255,255,0.05)]"
                        : "border-border/70 bg-background/60 hover:border-foreground/15",
                    )}
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] whitespace-nowrap text-muted-foreground">
                            Host :{route.listen_port}
                          </span>
                          <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] whitespace-nowrap text-muted-foreground">
                            Target :{route.target_port}
                          </span>
                          {active ? (
                            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] whitespace-nowrap text-emerald-300">
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
                            "inline-flex h-9 items-center justify-center rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition",
                            active
                              ? "border-foreground/20 bg-background/80 text-foreground"
                              : "border-border/70 bg-background/80 text-foreground hover:border-primary/30 hover:text-primary",
                          )}
                        >
                          {active && editorOpen ? "Dang sua" : "Sua"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopy(route)}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 text-xs font-semibold whitespace-nowrap text-foreground transition hover:border-primary/30 hover:text-primary"
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

        {editorOpen ? (
          <section className="min-w-0 rounded-[1.15rem] border border-border/70 bg-background/60 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {editorTitle}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {isCreating
                    ? "Nhap host port cong khai va target port ben trong VM. Khong bi gioi han so luong cong."
                    : "Chinh sua mapping dang chon, hoac xoa no neu khong can dung nua."}
                </p>
              </div>

              {routes.length > 0 ? (
                <button
                  type="button"
                  onClick={collapseEditor}
                  disabled={loading || saving || deleting}
                  className="inline-flex h-9 items-center justify-center rounded-full border border-border/70 bg-background/80 px-3 text-xs font-semibold whitespace-nowrap text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Thu gon
                </button>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
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
                  Port ma Nginx se lang nghe tren domain nay.
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
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold whitespace-nowrap text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isCreating ? "Tao mapping" : "Luu thay doi"}
              </button>

              {!isCreating ? (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={loading || saving || deleting}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-rose-500/25 bg-rose-500/10 px-5 text-sm font-semibold whitespace-nowrap text-rose-200 transition hover:border-rose-500/40 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Xoa mapping
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
