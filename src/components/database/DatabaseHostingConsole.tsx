"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Database,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import GitHubAccessGate from "@/components/GitHubAccessGate";
import ThemeToggle from "@/components/ThemeToggle";
import ConnectionModal from "@/components/database/ConnectionModal";
import CreateDatabaseDialog from "@/components/database/CreateDatabaseDialog";
import DatabaseTable from "@/components/database/DatabaseTable";
import QuotaWidget from "@/components/database/QuotaWidget";
import type {
  DatabaseConnectionInfo,
  DatabaseUsagePayload,
  HostedDatabaseItem,
} from "@/components/database/types";

function DatabaseHostingContent() {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeActionId, setActiveActionId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [usage, setUsage] = useState<DatabaseUsagePayload | null>(null);
  const [databases, setDatabases] = useState<HostedDatabaseItem[]>([]);
  const [selectedConnection, setSelectedConnection] =
    useState<DatabaseConnectionInfo | null>(null);
  const [connectionTitle, setConnectionTitle] = useState("");
  const [connectionSubtitle, setConnectionSubtitle] = useState("");
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [error, setError] = useState("");

  async function fetchAll({ silent = false }: { silent?: boolean } = {}) {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const [databasesResponse, usageResponse] = await Promise.all([
        fetch("/api/databases", {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/databases/usage", {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      const databasesData = await databasesResponse.json();
      const usageData = await usageResponse.json();

      if (!databasesResponse.ok) {
        throw new Error(databasesData.error_message || "Khong tai duoc danh sach database.");
      }

      if (!usageResponse.ok) {
        throw new Error(usageData.error_message || "Khong tai duoc quota usage.");
      }

      setDatabases(databasesData.databases || []);
      setUsage({
        plan: usageData.plan,
        quota: usageData.quota,
        usage: usageData.usage,
        remaining: usageData.remaining,
      });
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Khong tai duoc module Database Hosting.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void fetchAll();
  }, []);

  const upgradeMessage = useMemo(() => {
    if (!usage) {
      return "Database Hosting module chua co du lieu quota.";
    }

    if (usage.remaining.remainingDatabases > 0) {
      return `Ban con ${usage.remaining.remainingDatabases} database truoc khi can nang cap plan.`;
    }

    return "Quota database da het, day la luc hop ly de nang cap plan.";
  }, [usage]);

  async function handleCreate(name: string) {
    setCreating(true);

    try {
      const response = await fetch("/api/databases", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error_message || "Khong tao duoc database.");
      }

      toast.success(`Da tao database ${data.database.realDatabaseName}.`);
      setCreateOpen(false);
      setConnectionTitle(`Connection cho ${data.database.displayName}`);
      setConnectionSubtitle(
        "Password nay se duoc hien thi ngay luc create thanh cong. Ban co the copy sang VM client.",
      );
      setSelectedConnection(data.connection);
      setConnectionOpen(true);
      await fetchAll({ silent: true });
    } catch (createError) {
      toast.error(
        createError instanceof Error
          ? createError.message
          : "Khong tao duoc database.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleViewConnection(database: HostedDatabaseItem) {
    setActiveActionId(database.id);

    try {
      const response = await fetch(`/api/databases/${database.id}/connection`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error_message || "Khong tai duoc connection.");
      }

      setSelectedConnection(data.connection);
      setConnectionTitle(`Connection cho ${database.displayName}`);
      setConnectionSubtitle(
        `Scoped credentials cua ${database.realDatabaseName}. User khong co quyen root hay cross-database.`,
      );
      setConnectionOpen(true);
    } catch (viewError) {
      toast.error(
        viewError instanceof Error
          ? viewError.message
          : "Khong tai duoc connection.",
      );
    } finally {
      setActiveActionId("");
    }
  }

  async function handleResetPassword(database: HostedDatabaseItem) {
    setActiveActionId(database.id);

    try {
      const resetResponse = await fetch(
        `/api/databases/${database.id}/reset-password`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const resetData = await resetResponse.json();

      if (!resetResponse.ok || !resetData.success) {
        throw new Error(resetData.error_message || "Khong reset duoc password.");
      }

      const connectionResponse = await fetch(
        `/api/databases/${database.id}/connection`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      const connectionData = await connectionResponse.json();

      if (!connectionResponse.ok || !connectionData.success) {
        throw new Error(
          connectionData.error_message || "Password da reset nhung khong tai duoc connection.",
        );
      }

      setSelectedConnection(connectionData.connection);
      setConnectionTitle(`Password moi cho ${database.displayName}`);
      setConnectionSubtitle(
        "Reset password se quay vong cho toan bo MySQL account cua user nay. Hay cap nhat lai tat ca app dang dung account do.",
      );
      setConnectionOpen(true);
      toast.success(`Da rotate password cho ${database.mysqlUsername}.`);
    } catch (resetError) {
      toast.error(
        resetError instanceof Error
          ? resetError.message
          : "Khong reset duoc password.",
      );
    } finally {
      setActiveActionId("");
      await fetchAll({ silent: true });
    }
  }

  async function handleDelete(database: HostedDatabaseItem) {
    const ok = window.confirm(
      `Ban chac chan muon xoa database ${database.realDatabaseName}? Hanh dong nay se drop toan bo data va khong the phuc hoi tu UI.`,
    );

    if (!ok) {
      return;
    }

    setActiveActionId(database.id);

    try {
      const response = await fetch(`/api/databases/${database.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error_message || "Khong xoa duoc database.");
      }

      toast.success(`Da xoa ${database.realDatabaseName}.`);
      await fetchAll({ silent: true });
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : "Khong xoa duoc database.",
      );
    } finally {
      setActiveActionId("");
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-12rem] top-[-10rem] h-[24rem] w-[24rem] rounded-full bg-cyan-400/12 blur-3xl dark:bg-cyan-500/16" />
        <div className="absolute right-[-10rem] top-20 h-[22rem] w-[22rem] rounded-full bg-emerald-300/15 blur-3xl dark:bg-emerald-500/10" />
        <div className="absolute bottom-[-10rem] left-1/2 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full bg-amber-300/14 blur-3xl dark:bg-amber-500/10" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="surface-panel flex flex-col gap-4 rounded-[1.5rem] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-foreground text-background">
              <Database className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                OrbitStack // Database Hosting
              </p>
              <p className="text-sm font-semibold text-foreground">
                Shared managed MySQL platform cho OpenStack user
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Quay lại control plane
            </Link>
            <button
              type="button"
              onClick={() => void fetchAll({ silent: true })}
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Làm mới
            </button>
            <ThemeToggle />
          </div>
        </div>

        <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <div className="surface-panel surface-noise rounded-[1.8rem] p-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/72 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Production-grade DBaaS mini
              </div>
              <h1 className="mt-5 max-w-5xl text-4xl font-semibold leading-[1.04] tracking-tight text-foreground sm:text-5xl">
                User tạo database qua UI, còn MySQL root/admin chỉ tồn tại ở control plane nội bộ.
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Module này đi theo mô hình shared managed database: một DB server riêng trong
                private network, app giữ admin quyền nội bộ, user chỉ nhìn thấy database của
                họ và chỉ thao tác create/delete/reset thông qua API dashboard.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                  Create Database
                </button>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/72 px-4 py-3 text-sm font-medium text-muted-foreground">
                  <Server className="h-4 w-4 text-primary" />
                  Shared private DB server • root password never leaves backend
                </div>
              </div>
            </div>

            <QuotaWidget usage={usage} />

            {error && (
              <div className="rounded-[1.2rem] border border-rose-500/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-300">
                {error}
              </div>
            )}

            <DatabaseTable
              databases={databases}
              loading={loading}
              activeActionId={activeActionId}
              onViewConnection={(database) => void handleViewConnection(database)}
              onResetPassword={(database) => void handleResetPassword(database)}
              onDelete={(database) => void handleDelete(database)}
            />
          </div>

          <aside className="space-y-4">
            <div className="surface-panel rounded-[1.5rem] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                What this module does
              </p>
              <div className="mt-5 space-y-3">
                {[
                  "Validate và sanitize tên DB trước khi đụng MySQL.",
                  "Tự tạo MySQL account riêng cho từng user nếu chưa có.",
                  "GRANT scoped quyền đúng trên database của user.",
                  "Lưu metadata, quota, usage stats và audit logs nội bộ.",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4 text-sm leading-6 text-foreground"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-panel rounded-[1.5rem] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Billing / Quota
              </p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4">
                  <p className="text-sm font-semibold text-foreground">
                    {usage ? usage.plan.name : "Loading plan..."}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {upgradeMessage}
                  </p>
                </div>
                <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4">
                  <p className="text-sm font-semibold text-foreground">Current storage</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {usage ? usage.usage.totalStorageLabel : "Dang tinh toan..."}
                  </p>
                </div>
                <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4">
                  <p className="text-sm font-semibold text-foreground">Upgrade CTA</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Bạn có thể nối widget này vào billing page hoặc Telegram admin alert khi quota sắp hết.
                  </p>
                </div>
              </div>
            </div>

            <div className="surface-panel rounded-[1.5rem] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Security notes
              </p>
              <div className="mt-4 space-y-3">
                {[
                  "Không GRANT ALL ON *.* và không trao SUPER/FILE/PROCESS/GRANT OPTION.",
                  "Mật khẩu app encrypt reference ở backend, UI chỉ hiện khi user chủ động xem.",
                  "DB server nên chỉ mở 3306 cho private VM subnet và chặn public internet.",
                  "Reset password hiện áp dụng cho toàn bộ MySQL account của user vì một user dùng chung nhiều DB.",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4 text-sm leading-6 text-foreground"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>

      <CreateDatabaseDialog
        open={createOpen}
        creating={creating}
        onCreate={handleCreate}
        onClose={() => setCreateOpen(false)}
      />

      <ConnectionModal
        open={connectionOpen}
        title={connectionTitle}
        subtitle={connectionSubtitle}
        connection={selectedConnection}
        onClose={() => setConnectionOpen(false)}
      />
    </div>
  );
}

export default function DatabaseHostingConsole() {
  return (
    <GitHubAccessGate>
      <DatabaseHostingContent />
    </GitHubAccessGate>
  );
}
