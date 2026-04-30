"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Link2, ShieldCheck, X } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";
import type { DatabaseConnectionInfo } from "@/components/database/types";

function ConnectionRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(value);

    if (!ok) {
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 break-all font-mono text-sm text-foreground">{value}</p>
        </div>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground transition hover:border-primary/35 hover:text-primary"
          title={`Sao chép ${label}`}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function ConnectionModal({
  open,
  title,
  subtitle,
  connection,
  onClose,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  connection: DatabaseConnectionInfo | null;
  onClose: () => void;
}) {
  if (!open || !connection) {
    return null;
  }

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
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-foreground text-background">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Thông tin kết nối
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{subtitle}</p>
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

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="grid gap-4 md:grid-cols-2">
            <ConnectionRow label="DB_HOST" value={connection.host} />
            <ConnectionRow label="DB_PORT" value={String(connection.port)} />
            <ConnectionRow label="DB_NAME" value={connection.database} />
            <ConnectionRow label="DB_USER" value={connection.username} />
          </div>

          <ConnectionRow label="DB_PASSWORD" value={connection.password} />
          <ConnectionRow label="DATABASE_URL" value={connection.databaseUrl} />

          <div className="rounded-[1rem] border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-300">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p>
                Mật khẩu được ứng dụng giữ dưới dạng tham chiếu mã hóa nội bộ. Giao diện
                chỉ hiển thị khi bạn chủ động xem kết nối hoặc vừa đổi mật khẩu.
              </p>
            </div>
          </div>

          <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <Link2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
              <p>
                Từ VM client trong private network, bạn chỉ cần export các biến trên
                hoặc dùng trực tiếp <code>DATABASE_URL</code> để kết nối tới máy chủ
                MySQL dùng chung.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
