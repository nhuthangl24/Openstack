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
        throw new Error(
          databasesData.error_message || "Không tải được danh sách cơ sở dữ liệu.",
        );
      }

      if (!usageResponse.ok) {
        throw new Error(usageData.error_message || "Không tải được dữ liệu quota.");
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
          : "Không tải được module cơ sở dữ liệu.";
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
      return "Chưa có dữ liệu quota để hiển thị.";
    }

    if (usage.remaining.remainingDatabases > 0) {
      return `Bạn còn ${usage.remaining.remainingDatabases} cơ sở dữ liệu trước khi cần nâng cấp gói.`;
    }

    return "Quota cơ sở dữ liệu đã hết, bạn nên nâng cấp gói để tạo thêm.";
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
        throw new Error(data.error_message || "Không tạo được cơ sở dữ liệu.");
      }

      toast.success(`Đã tạo ${data.database.realDatabaseName}.`);
      setCreateOpen(false);
      setConnectionTitle(`Kết nối của ${data.database.displayName}`);
      setConnectionSubtitle(
        "Mật khẩu này chỉ hiện ở thời điểm tạo thành công. Hãy sao chép sang ứng dụng hoặc VM của bạn.",
      );
      setSelectedConnection(data.connection);
      setConnectionOpen(true);
      await fetchAll({ silent: true });
    } catch (createError) {
      toast.error(
        createError instanceof Error
          ? createError.message
          : "Không tạo được cơ sở dữ liệu.",
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
        throw new Error(data.error_message || "Không tải được thông tin kết nối.");
      }

      setSelectedConnection(data.connection);
      setConnectionTitle(`Kết nối của ${database.displayName}`);
      setConnectionSubtitle(
        `Tài khoản ${database.mysqlUsername} chỉ có quyền trong ${database.realDatabaseName}, không có quyền quản trị toàn hệ thống.`,
      );
      setConnectionOpen(true);
    } catch (viewError) {
      toast.error(
        viewError instanceof Error
          ? viewError.message
          : "Không tải được thông tin kết nối.",
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
        throw new Error(resetData.error_message || "Không đổi được mật khẩu.");
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
          connectionData.error_message ||
            "Đã đổi mật khẩu nhưng chưa tải được thông tin kết nối mới.",
        );
      }

      setSelectedConnection(connectionData.connection);
      setConnectionTitle(`Mật khẩu mới của ${database.displayName}`);
      setConnectionSubtitle(
        "Đổi mật khẩu sẽ xoay vòng cho toàn bộ tài khoản MySQL của người dùng này. Hãy cập nhật lại mọi ứng dụng đang dùng tài khoản đó.",
      );
      setConnectionOpen(true);
      toast.success(`Đã đổi mật khẩu cho ${database.mysqlUsername}.`);
    } catch (resetError) {
      toast.error(
        resetError instanceof Error
          ? resetError.message
          : "Không đổi được mật khẩu.",
      );
    } finally {
      setActiveActionId("");
      await fetchAll({ silent: true });
    }
  }

  async function handleDelete(database: HostedDatabaseItem) {
    const ok = window.confirm(
      `Bạn chắc chắn muốn xóa ${database.realDatabaseName}? Hành động này sẽ xóa toàn bộ dữ liệu và không thể khôi phục từ giao diện.`,
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
        throw new Error(data.error_message || "Không xóa được cơ sở dữ liệu.");
      }

      toast.success(`Đã xóa ${database.realDatabaseName}.`);
      await fetchAll({ silent: true });
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : "Không xóa được cơ sở dữ liệu.",
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
                OrbitStack // Cơ sở dữ liệu
              </p>
              <p className="text-sm font-semibold text-foreground">
                MySQL dùng chung cho từng người dùng OpenStack
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Quay lại bảng điều khiển
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
                Cơ sở dữ liệu dùng chung
              </div>
              <h1 className="mt-5 max-w-5xl text-4xl font-semibold leading-[1.04] tracking-tight text-foreground sm:text-5xl">
                Tạo và quản lý cơ sở dữ liệu qua giao diện, không lộ tài khoản quản trị MySQL.
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Mỗi người dùng có một tài khoản MySQL riêng và nhiều cơ sở dữ liệu riêng.
                Hệ thống giữ quyền quản trị nội bộ, tự cấp quyền đúng phạm vi và chỉ mở
                cổng từ mạng private của VM sang máy chủ cơ sở dữ liệu.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                  Tạo cơ sở dữ liệu
                </button>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/72 px-4 py-3 text-sm font-medium text-muted-foreground">
                  <Server className="h-4 w-4 text-primary" />
                  Máy chủ MySQL riêng trong mạng private
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
                Module này làm gì
              </p>
              <div className="mt-5 space-y-3">
                {[
                  "Kiểm tra và chuẩn hóa tên cơ sở dữ liệu trước khi gửi lệnh tới MySQL.",
                  "Tự tạo tài khoản MySQL riêng cho từng người dùng nếu chưa có.",
                  "Chỉ cấp quyền đúng trên cơ sở dữ liệu của người dùng đó.",
                  "Lưu metadata, quota, thống kê sử dụng và nhật ký audit nội bộ.",
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
                Gói và quota
              </p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4">
                  <p className="text-sm font-semibold text-foreground">
                    {usage ? usage.plan.name : "Đang tải gói"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {upgradeMessage}
                  </p>
                </div>
                <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4">
                  <p className="text-sm font-semibold text-foreground">Dung lượng hiện dùng</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {usage ? usage.usage.totalStorageLabel : "Đang tính toán..."}
                  </p>
                </div>
                <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4">
                  <p className="text-sm font-semibold text-foreground">Gợi ý nâng cấp</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Bạn có thể nối phần này với trang thanh toán hoặc cảnh báo quản trị khi quota sắp hết.
                  </p>
                </div>
              </div>
            </div>

            <div className="surface-panel rounded-[1.5rem] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Ghi chú bảo mật
              </p>
              <div className="mt-4 space-y-3">
                {[
                  "Không cấp GRANT ALL ON *.* và không trao SUPER, FILE, PROCESS hay GRANT OPTION.",
                  "Mật khẩu chỉ được lưu dưới dạng tham chiếu mã hóa ở backend, không ghi log dạng rõ.",
                  "Máy chủ cơ sở dữ liệu chỉ nên mở cổng 3306 cho subnet private của VM, không mở public internet.",
                  "Đổi mật khẩu hiện áp dụng cho toàn bộ tài khoản MySQL của người dùng đó vì một tài khoản dùng chung cho nhiều cơ sở dữ liệu.",
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
