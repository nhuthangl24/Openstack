import { Database, HardDrive, Signal, Sparkles } from "lucide-react";
import type { DatabaseUsagePayload } from "@/components/database/types";

function Metric({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="surface-panel rounded-[1.3rem] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{helper}</p>
        </div>
        <div className="rounded-[0.9rem] border border-border/70 bg-background/70 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export default function QuotaWidget({
  usage,
}: {
  usage: DatabaseUsagePayload | null;
}) {
  if (!usage) {
    return (
      <div className="grid gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="surface-panel rounded-[1.3rem] p-5"
          >
            <div className="skeleton h-4 w-24" />
            <div className="mt-4 skeleton h-10 w-20" />
            <div className="mt-3 skeleton h-4 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <Metric
        icon={Database}
        label="Gói"
        value={usage.plan.name}
        helper={`${usage.usage.totalDatabases}/${usage.quota.maxDatabases} cơ sở dữ liệu đã dùng`}
      />
      <Metric
        icon={HardDrive}
        label="Dung lượng"
        value={usage.usage.totalStorageLabel}
        helper={`${usage.remaining.remainingStorageLabel} còn lại trong quota`}
      />
      <Metric
        icon={Signal}
        label="Kết nối"
        value={String(usage.usage.activeConnections)}
        helper={`${usage.remaining.remainingConnections} kết nối còn lại`}
      />
      <Metric
        icon={Sparkles}
        label="Nâng cấp"
        value={usage.plan.code === "business" ? "Cao nhất" : "Có thể nâng"}
        helper={
          usage.plan.code === "business"
            ? "Gói Business đang là mức quota cao nhất hiện tại."
            : "Nâng cấp gói để mở thêm database, dung lượng và số kết nối."
        }
      />
    </div>
  );
}
