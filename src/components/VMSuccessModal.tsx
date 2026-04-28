"use client";

import { useEffect, useState } from "react";
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
import { copyToClipboard } from "@/lib/clipboard";

interface VMInfo {
  vm_name: string;
  vm_id: string;
  status: string;
  flavor: string;
  os: string;
  password: string;
  environments: string[];
}

interface VMSuccessModalProps {
  info: VMInfo;
  onOpenTerminal?: (host: string) => void;
  onClose: () => void;
}

function CopyButton({
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
      title={`Sao chép ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{copied ? "Đã copy" : label}</span>
    </button>
  );
}

export default function VMSuccessModal({
  info,
  onOpenTerminal,
  onClose,
}: VMSuccessModalProps) {
  const [ip, setIp] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [ipStatus, setIpStatus] = useState<"polling" | "found" | "timeout">(
    "polling",
  );
  const maxAttempts = 30;

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
        // Bỏ qua lỗi tạm thời khi polling.
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
                Deploy Success
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                VM đã được tạo thành công
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Cloud-init đang chạy trong nền. Bạn có thể theo dõi IP và mở Terminal Lab
                ngay khi máy sẵn sàng.
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
                        Chưa lấy được IP sau nhiều lần thử. Bạn có thể đóng modal và
                        kiểm tra lại trong danh sách fleet.
                      </p>
                    ) : (
                      <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Đang chờ OpenStack cấp IP... ({attempts}/{maxAttempts})
                      </div>
                    )}
                  </div>
                </div>

                {ip && <CopyButton text={ip} label="IP" />}
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
                <CopyButton text={sshCommand} label="SSH" />
              </div>

              {ip && onOpenTerminal && (
                <button
                  type="button"
                  onClick={() => onOpenTerminal(ip)}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <Terminal className="h-4 w-4" />
                  Mở Terminal Lab ngay
                </button>
              )}
            </div>

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
                label="Mật khẩu SSH"
                value={info.password}
                copyValue={info.password}
              />
            </div>

            {info.environments.length > 0 && (
              <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-5">
                <div className="flex items-center gap-3">
                  <Package className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Software đã chọn
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
                    Nếu SSH chưa vào được ngay, hãy đợi cloud-init cài xong package
                    và retry sau khoảng 30 đến 60 giây.
                  </p>
                  <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Fleet sẽ tự cập nhật lại khi bạn đóng modal
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="inline-flex w-full items-center justify-center rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90"
              >
                Đóng và quay lại dashboard
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
        {copyValue && <CopyButton text={copyValue} label={label} />}
      </div>
      <p className="mt-3 break-all text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
