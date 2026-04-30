"use client";

import { ExternalLink, KeyRound, Loader2, Trash2 } from "lucide-react";
import type { HostedDatabaseItem } from "@/components/database/types";

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized === "active"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : normalized === "suspended"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
        : normalized === "deleted"
          ? "border-slate-500/20 bg-slate-500/10 text-slate-300"
          : "border-rose-500/20 bg-rose-500/10 text-rose-300";

  const label =
    normalized === "active"
      ? "Hoạt động"
      : normalized === "suspended"
        ? "Tạm ngưng"
        : normalized === "deleted"
          ? "Đã xóa"
          : status;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] ${tone}`}
    >
      {label}
    </span>
  );
}

export default function DatabaseTable({
  databases,
  loading,
  activeActionId,
  onViewConnection,
  onResetPassword,
  onDelete,
}: {
  databases: HostedDatabaseItem[];
  loading: boolean;
  activeActionId: string;
  onViewConnection: (database: HostedDatabaseItem) => void;
  onResetPassword: (database: HostedDatabaseItem) => void;
  onDelete: (database: HostedDatabaseItem) => void;
}) {
  if (loading) {
    return (
      <div className="surface-panel rounded-[1.5rem] p-5">
        <div className="space-y-3">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="rounded-[1rem] border border-border/70 bg-background/70 p-4"
            >
              <div className="skeleton h-4 w-28" />
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="skeleton h-10 w-full" />
                <div className="skeleton h-10 w-full" />
                <div className="skeleton h-10 w-full" />
                <div className="skeleton h-10 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!databases.length) {
    return (
      <div className="surface-panel rounded-[1.5rem] p-8 text-center">
        <h3 className="text-2xl font-semibold tracking-tight text-foreground">
          Chưa có cơ sở dữ liệu nào
        </h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Tạo cơ sở dữ liệu đầu tiên để hệ thống cấp tài khoản MySQL riêng, phân
          quyền đúng phạm vi và sinh chuỗi kết nối cho bạn.
        </p>
      </div>
    );
  }

  return (
    <div className="surface-panel overflow-hidden rounded-[1.5rem]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border/70 text-left">
          <thead className="bg-background/70">
            <tr>
              {[
                "Tên hiển thị",
                "Tên DB thật",
                "Máy chủ",
                "Cổng",
                "Dung lượng",
                "Trạng thái",
                "Ngày tạo",
                "Thao tác",
              ].map((heading) => (
                <th
                  key={heading}
                  className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70 bg-card/50">
            {databases.map((database) => {
              const working = activeActionId === database.id;

              return (
                <tr key={database.id} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-foreground">{database.displayName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {database.mysqlUsername}
                    </p>
                  </td>
                  <td className="px-5 py-4 font-mono text-sm text-foreground">
                    {database.realDatabaseName}
                  </td>
                  <td className="px-5 py-4 text-sm text-foreground">{database.host}</td>
                  <td className="px-5 py-4 text-sm text-foreground">{database.port}</td>
                  <td className="px-5 py-4 text-sm text-foreground">
                    {database.currentSizeLabel}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={database.status} />
                  </td>
                  <td className="px-5 py-4 text-sm text-foreground">
                    {new Date(database.createdAt).toLocaleString("vi-VN", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex min-w-[14rem] flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onViewConnection(database)}
                        disabled={working}
                        className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:text-primary disabled:opacity-60"
                      >
                        {working ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ExternalLink className="h-3.5 w-3.5" />
                        )}
                        Xem kết nối
                      </button>
                      <button
                        type="button"
                        onClick={() => onResetPassword(database)}
                        disabled={working}
                        className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:text-primary disabled:opacity-60"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        Đổi mật khẩu
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(database)}
                        disabled={working}
                        className="inline-flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:border-rose-500/35 hover:bg-rose-500/15 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
