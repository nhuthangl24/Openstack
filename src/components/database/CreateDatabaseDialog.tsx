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
      setError("Ten database phai dai 3-32 ky tu, chi gom chu thuong, so va dau _.");
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
                Database Hosting
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                Tạo database managed mới
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Database sẽ được tạo trên shared MySQL server, rồi app tự grant đúng
                quota và mysql user của bạn.
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
              Naming policy
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                "Chi nhap ten hien thi, app tu ghep prefix user vao real DB name.",
                "Chi chap nhan chu thuong, so va dau _. Regex: /^[a-z0-9_]{3,32}$/",
                "MySQL user cua ban se duoc tai su dung cho nhieu database.",
                "Root/admin password khong bao gio lo ra UI user.",
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
              Database name
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="blog, shop, analytics ..."
              className="mt-3 h-12 w-full rounded-[1rem] border border-border/70 bg-card px-4 text-sm text-foreground outline-none transition focus:border-primary/35"
            />
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Ví dụ: bạn nhập `blog`, app sẽ sinh real DB name kiểu `gh_username_blog`.
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
            App sẽ tự log audit, kiểm tra quota và rollback nếu create lỗi.
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
              Tạo database
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
