"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  ExternalLink,
  KeyRound,
  Loader2,
  Monitor,
  Package,
  Server,
  Terminal,
  Wifi,
  X,
} from "lucide-react";
import PublicRouteManager from "@/components/PublicRouteManager";
import { copyToClipboard } from "@/lib/clipboard";
import { type VmRouteSnapshot } from "@/lib/public-routes";

interface VMInfo {
  vm_name: string;
  vm_id: string;
  status: string;
  flavor: string;
  os: string;
  password: string;
  environments: string[];
  ip?: string;
  hostname?: string;
  fqdn?: string;
  route_listen_port?: number;
  route_target_port?: number;
  route_sync_warning?: string;
}

interface VMSuccessModalProps {
  info: VMInfo;
  onOpenTerminal?: (host: string) => void;
  onClose: () => void;
}

function buildFallbackHostname(vmName: string, hostname?: string) {
  const source = hostname?.trim() || vmName;

  return source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function SummaryCopyButton({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(text);

    if (!ok) {
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
      title={`Sao chep ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{copied ? "Da copy" : label}</span>
    </button>
  );
}

export default function VMSuccessModal({
  info,
  onOpenTerminal,
  onClose,
}: VMSuccessModalProps) {
  const initialIp = info.ip?.trim() || "";
  const hostnameLabel = useMemo(
    () => buildFallbackHostname(info.vm_name, info.hostname),
    [info.hostname, info.vm_name],
  );
  const [ip, setIp] = useState(initialIp);
  const [attempts, setAttempts] = useState(0);
  const [ipStatus, setIpStatus] = useState<"polling" | "found" | "timeout">(
    initialIp ? "found" : "polling",
  );
  const maxAttempts = 30;
  const initialRoutes = useMemo<VmRouteSnapshot[]>(() => {
    if (
      !info.fqdn ||
      typeof info.route_listen_port !== "number" ||
      typeof info.route_target_port !== "number"
    ) {
      return [];
    }

    return [
      {
        route_key: info.vm_name,
        hostname: hostnameLabel,
        domain: info.fqdn.startsWith(`${hostnameLabel}.`)
          ? info.fqdn.slice(hostnameLabel.length + 1)
          : "",
        fqdn: info.fqdn,
        target_ip: initialIp,
        target_port: info.route_target_port,
        listen_port: info.route_listen_port,
        config_path: "",
      },
    ];
  }, [hostnameLabel, info.fqdn, info.route_listen_port, info.route_target_port, info.vm_name, initialIp]);

  useEffect(() => {
    async function pollIp() {
      if (ipStatus !== "polling") {
        return;
      }

      try {
        const response = await fetch(
          `/api/vm-ip?name=${encodeURIComponent(info.vm_name)}`,
        );
        const data = await response.json();

        if (data.ip) {
          setIp(data.ip);
          setIpStatus("found");
        }
      } catch {
        // Bo qua loi tam thoi khi polling IP.
      }
    }

    void pollIp();

    const interval = window.setInterval(() => {
      setAttempts((current) => {
        const next = current + 1;

        if (next >= maxAttempts) {
          setIpStatus("timeout");
          window.clearInterval(interval);
        }

        return next;
      });

      void pollIp();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [info.vm_name, ipStatus]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const sshCommand = `ssh ubuntu@${ip || "<IP>"}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="surface-panel relative w-full max-w-3xl overflow-hidden rounded-[2rem]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent" />

        <div className="flex items-center justify-between border-b border-border/70 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-emerald-500 text-white shadow-[0_16px_40px_-24px_rgba(16,185,129,0.6)]">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
                Tao may thanh cong
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                VM da duoc tao thanh cong
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Cloud-init dang chay trong nen. Ban co the theo doi IP, mo terminal va
                doi port public route ngay tai day.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="space-y-5 px-5 py-5 sm:px-6">
            <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Wifi className="h-4 w-4 text-primary" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Public IP
                    </p>
                    {ipStatus === "found" ? (
                      <p className="mt-2 font-mono text-3xl font-semibold text-foreground">
                        {ip}
                      </p>
                    ) : ipStatus === "timeout" ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Chua lay duoc IP sau nhieu lan thu. Ban van co the luu lai port,
                        route API se tu resolve IP cua VM neu can.
                      </p>
                    ) : (
                      <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Dang cho OpenStack cap IP... ({attempts}/{maxAttempts})
                      </div>
                    )}
                  </div>
                </div>

                {ip && <SummaryCopyButton text={ip} label="IP" />}
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    SSH Command
                  </p>
                  <p className="mt-2 font-mono text-sm text-foreground">{sshCommand}</p>
                </div>
                <SummaryCopyButton text={sshCommand} label="SSH" />
              </div>

              {ip && onOpenTerminal && (
                <button
                  type="button"
                  onClick={() => onOpenTerminal(ip)}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <Terminal className="h-4 w-4" />
                  Mo terminal ngay
                </button>
              )}
            </div>

            <PublicRouteManager
              vmName={info.vm_name}
              vmId={info.vm_id}
              vmIp={ip || undefined}
              hostname={hostnameLabel}
              initialRoutes={initialRoutes}
              initialNotice={info.route_sync_warning || ""}
              className="rounded-[1.6rem] p-5"
              title="Public routes"
              description="Mot VM co the host nhieu cong cong khai khac nhau tren cung domain nay."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <SummaryCard
                icon={Server}
                label="VM Name"
                value={info.vm_name}
                copyValue={info.vm_name}
              />
              <SummaryCard
                icon={Cpu}
                label="Flavor"
                value={info.flavor}
              />
              <SummaryCard
                icon={Monitor}
                label="Image"
                value={info.os}
              />
              <SummaryCard
                icon={KeyRound}
                label="SSH Password"
                value={info.password}
                copyValue={info.password}
              />
            </div>

            {info.environments.length > 0 && (
              <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-5">
                <div className="flex items-center gap-3">
                  <Package className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Software da chon
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {info.environments.map((env) => (
                    <span
                      key={env}
                      className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-semibold text-foreground"
                    >
                      {env}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          <aside className="border-t border-border/70 bg-background/45 px-5 py-5 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <div className="rounded-[1.6rem] border border-border/70 bg-card/85 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Deploy note
                </p>
                <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
                  <p>
                    Instance ID: <span className="font-mono text-foreground">{info.vm_id}</span>
                  </p>
                  <p>
                    Neu SSH chua vao duoc ngay, hay doi cloud-init cai xong package va
                    thu lai sau khoang 30 den 60 giay.
                  </p>
                  <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Fleet se tu cap nhat lai khi ban dong modal
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex w-full items-center justify-center rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90"
              >
                Dong va quay lai dashboard
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  copyValue,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  copyValue?: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-border/70 bg-background/70 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </p>
        </div>
        {copyValue && <SummaryCopyButton text={copyValue} label={label} />}
      </div>
      <p className="mt-3 break-all text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
