"use client";

import { useState } from "react";
import { Database, Loader2, Sparkles, X } from "lucide-react";

export default function CreateDatabaseDialog({
  open,
  creating,
  onCreate,
  onClose,
}: {
  open: boolean;
  creating: boolean;
  onCreate: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  if (!open) {
    return null;
  }

  async function handleSubmit() {
    const normalized = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_{2,}/g, "_");

    if (!/^[a-z0-9_]{3,32}$/.test(normalized)) {
      setError("Tên cơ sở dữ liệu phải dài 3-32 ký tự, chỉ gồm chữ thường, số và dấu _.");
      return;
    }

    setError("");
    await onCreate(normalized);
    setName("");
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
      <div className="surface-panel relative w-full max-w-2xl overflow-hidden rounded-[2rem]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-foreground text-background">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Cơ sở dữ liệu
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                Tạo cơ sở dữ liệu mới
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Cơ sở dữ liệu sẽ được tạo trên máy chủ MySQL dùng chung. Hệ thống tự cấp
                quyền đúng quota và đúng tài khoản MySQL của bạn.
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

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="rounded-[1.3rem] border border-border/70 bg-background/70 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Quy tắc đặt tên
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                "Bạn chỉ nhập tên ngắn, hệ thống sẽ tự ghép prefix người dùng vào tên DB thật.",
                "Chỉ chấp nhận chữ thường, số và dấu _. Regex: /^[a-z0-9_]{3,32}$/",
                "Tài khoản MySQL của bạn sẽ được dùng lại cho nhiều cơ sở dữ liệu.",
                "Mật khẩu quản trị MySQL không bao giờ lộ ra ở giao diện người dùng.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[1rem] border border-border/70 bg-card px-4 py-3 text-sm leading-6 text-foreground"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.3rem] border border-border/70 bg-background/70 px-4 py-4">
            <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Tên cơ sở dữ liệu
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="blog, shop, analytics ..."
              className="mt-3 h-12 w-full rounded-[1rem] border border-border/70 bg-card px-4 text-sm text-foreground outline-none transition focus:border-primary/35"
            />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Ví dụ: bạn nhập <code>blog</code>, hệ thống sẽ sinh tên DB thật theo kiểu
              <code> gh_username_blog</code>.
            </p>
          </div>

          {error && (
            <div className="rounded-[1rem] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border/70 bg-background/92 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Hệ thống sẽ ghi log, kiểm tra quota và tự rollback nếu tạo lỗi.
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-full border border-border/70 bg-background/70 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={creating}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
              Tạo cơ sở dữ liệu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
