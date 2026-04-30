"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import {
  Activity,
  ArrowUpRight,
  Boxes,
  Check,
  CircleAlert,
  CloudOff,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  GitBranch,
  Grid2X2,
  LayoutList,
  Loader2,
  LogOut,
  Network,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import CreateServerModal from "@/components/CreateServerModal";
import GitHubDeployModal, {
  type GitHubDeployPlan,
} from "@/components/GitHubDeployModal";
import TerminalWorkbench from "@/components/TerminalWorkbench";
import ThemeToggle from "@/components/ThemeToggle";
import VMSuccessModal from "@/components/VMSuccessModal";
import { copyToClipboard } from "@/lib/clipboard";
import { serverPresets } from "@/lib/presets";
import { writeTerminalWorkspace } from "@/lib/terminal-workspace";

interface VM {
  id: string;
  name: string;
  status: string;
  ip: string;
  flavor: string;
  image: string;
}

interface VMResult {
  vm_name: string;
  vm_id: string;
  status: string;
  flavor: string;
  os: string;
  password: string;
  environments: string[];
}

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

type FilterKey = "all" | "ready" | "building" | "attention";
type SortKey = "status" | "name" | "ip";
type ViewMode = "grid" | "list";
export type ConsoleTab =
  | "mission"
  | "fleet"
  | "launch"
  | "inspect"
  | "command"
  | "terminal";

const SSH_USER = "ubuntu";
const AUTO_REFRESH_KEY = "orbitstack:auto-refresh";
const VIEW_MODE_KEY = "orbitstack:view-mode";

const presetIcons: Record<string, LucideIcon> = {
  "docker-host": Boxes,
  "node-api": Workflow,
  "data-lab": Database,
};

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window.localStorage.getItem(key);
  return value === null ? fallback : value === "true";
}

function readStoredViewMode() {
  if (typeof window === "undefined") {
    return "grid" as ViewMode;
  }

  const value = window.localStorage.getItem(VIEW_MODE_KEY);
  return value === "list" ? "list" : "grid";
}

function handleSelectableSurfaceKeyDown(
  event: KeyboardEvent<HTMLElement>,
  onSelect: () => void,
) {
  if (event.target !== event.currentTarget) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect();
  }
}

function statusPriority(status: string) {
  switch (status) {
    case "ACTIVE":
      return 0;
    case "BUILD":
      return 1;
    case "SHUTOFF":
      return 2;
    case "ERROR":
      return 3;
    default:
      return 4;
  }
}

function getStatusMeta(status: string) {
  switch (status) {
    case "ACTIVE":
      return {
        label: "Sẵn sàng",
        tone:
          "border-emerald-500/20 bg-emerald-500/10 text-emerald-300 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300",
        dot: "bg-emerald-400",
        description: "VM đang chạy ổn định.",
      };
    case "BUILD":
      return {
        label: "Đang dựng",
        tone:
          "border-amber-500/20 bg-amber-500/10 text-amber-300 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
        dot: "bg-amber-400 status-pulse",
        description: "OpenStack vẫn đang provision máy.",
      };
    case "ERROR":
      return {
        label: "Lỗi",
        tone:
          "border-rose-500/20 bg-rose-500/10 text-rose-300 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-300",
        dot: "bg-rose-400",
        description: "Cần kiểm tra lại thao tác hoặc quota.",
      };
    case "SHUTOFF":
      return {
        label: "Đã tắt",
        tone:
          "border-slate-500/20 bg-slate-500/10 text-slate-300 dark:border-slate-400/20 dark:bg-slate-400/10 dark:text-slate-300",
        dot: "bg-slate-400",
        description: "Máy đang dừng và chưa sẵn sàng SSH.",
      };
    default:
      return {
        label: status || "Không rõ",
        tone:
          "border-slate-500/20 bg-slate-500/10 text-slate-300 dark:border-slate-400/20 dark:bg-slate-400/10 dark:text-slate-300",
        dot: "bg-slate-400",
        description: "Trạng thái chưa được phân loại.",
      };
  }
}

function formatLastUpdated(value: Date | null) {
  if (!value) {
    return "Chưa đồng bộ";
  }

  const diff = Math.floor((Date.now() - value.getTime()) / 1000);

  if (diff < 10) {
    return "Vừa xong";
  }

  if (diff < 60) {
    return `${diff}s trước`;
  }

  if (diff < 3600) {
    return `${Math.floor(diff / 60)} phút trước`;
  }

  return value.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildInventoryText(vms: VM[]) {
  if (!vms.length) {
    return "Chưa có VM nào trong danh sách.";
  }

  return [
    "OrbitStack Fleet Snapshot",
    "",
    ...vms.map(
      (vm, index) =>
        `${index + 1}. ${vm.name} | ${vm.status} | ${vm.ip || "Chưa có IP"} | ${vm.flavor || "Chưa rõ flavor"} | ${vm.image || "Chưa rõ image"}`,
    ),
  ].join("\n");
}

async function tryCopy(text: string, successMessage: string) {
  const copied = await copyToClipboard(text);

  if (copied) {
    toast.success(successMessage);
    return;
  }

  toast.error("Không thể sao chép vào clipboard.");
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="surface-panel relative overflow-hidden rounded-[1.2rem] p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/40 to-transparent" />
      <div className="absolute right-4 top-4 rounded-[0.8rem] border border-border/70 bg-background/80 p-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-7 text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{helper}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = getStatusMeta(status);

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-[0.8rem] border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${meta.tone}`}
    >
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function CopyChip({
  text,
  label,
}: {
  text: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();

    const ok = await copyToClipboard(text);

    if (!ok) {
      toast.error(`Không thể sao chép ${label.toLowerCase()}.`);
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/65 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
      title={`Sao chép ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      <span>{copied ? "Đã copy" : label}</span>
    </button>
  );
}

function EmptyFleet({
  onCreate,
  onPreset,
}: {
  onCreate: () => void;
  onPreset: (presetKey: string) => void;
}) {
  return (
    <div className="surface-panel rounded-[1.5rem] p-8 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1rem] border border-border/70 bg-background/75 text-muted-foreground">
        <CloudOff className="h-7 w-7" />
      </div>
      <h3 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
        Chưa có máy nào trong fleet
      </h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        Mình đã thay dashboard sang layout mới, giờ bạn có thể tạo VM thủ công hoặc
        dùng preset để lên nhanh một máy Docker, Node API hay Data Lab chỉ với vài
        cú nhấp.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-[0.9rem] bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Tạo VM mới
        </button>
        {serverPresets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onPreset(preset.key)}
            className="inline-flex items-center gap-2 rounded-[0.9rem] border border-border/70 bg-background/70 px-4 py-3 text-sm font-medium text-foreground transition hover:border-primary/35 hover:text-primary"
          >
            <Sparkles className="h-4 w-4" />
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FleetSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[1, 2, 3, 4].map((item) => (
        <div
          key={item}
          className="surface-panel rounded-[1.8rem] p-5"
        >
          <div className="skeleton h-4 w-28" />
          <div className="mt-5 space-y-3">
            <div className="skeleton h-12 w-full" />
            <div className="skeleton h-12 w-full" />
            <div className="skeleton h-12 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PresetCard({
  presetKey,
  onClick,
}: {
  presetKey: string;
  onClick: (presetKey: string) => void;
}) {
  const preset = serverPresets.find((item) => item.key === presetKey);

  if (!preset) {
    return null;
  }

  const Icon = presetIcons[preset.key] ?? Server;

  return (
    <button
      type="button"
      onClick={() => onClick(preset.key)}
      className="surface-panel group relative overflow-hidden rounded-[1.2rem] p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/35"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/90 via-primary/45 to-transparent" />
      <div className="absolute right-4 top-4 rounded-[0.8rem] bg-primary/12 p-2 text-primary transition group-hover:scale-105">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        Quick Kit
      </p>
      <h3 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
        {preset.label}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {preset.description}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {preset.highlights.map((item) => (
          <span
            key={item}
            className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-medium text-foreground"
          >
            {item}
          </span>
        ))}
      </div>
      <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
        Mở preset
        <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </button>
  );
}

function ServerCard({
  vm,
  selected,
  deleting,
  onSelect,
  onDelete,
  onTerminal,
  onGitHub,
}: {
  vm: VM;
  selected: boolean;
  deleting: boolean;
  onSelect: () => void;
  onDelete: (name: string) => void;
  onTerminal: (vm: VM) => void;
  onGitHub: (vmId: string) => void;
}) {
  const status = getStatusMeta(vm.status);
  const sshCommand = vm.ip ? `ssh ${SSH_USER}@${vm.ip}` : "";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => handleSelectableSurfaceKeyDown(event, onSelect)}
      className={`surface-panel group relative w-full overflow-hidden rounded-[1.15rem] p-5 text-left transition ${
        selected
          ? "border-primary/45 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.42)]"
          : "hover:-translate-y-0.5 hover:border-primary/25"
      }`}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/35 to-transparent" />
      <div className="absolute right-4 top-4">
        <StatusBadge status={vm.status} />
      </div>
      <div className="max-w-[70%]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          {vm.flavor || "Flavor chưa rõ"}
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          {vm.name}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">{status.description}</p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <InfoMiniCard
          icon={Network}
          label="IP"
          value={vm.ip || "Đang chờ cấp"}
          accent={Boolean(vm.ip)}
        />
        <InfoMiniCard
          icon={Server}
          label="Image"
          value={vm.image || "Chưa rõ"}
        />
        <InfoMiniCard
          icon={Cpu}
          label="SSH"
          value={vm.ip ? "Có thể kết nối" : "Chưa sẵn sàng"}
          accent={vm.status === "ACTIVE" && Boolean(vm.ip)}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {vm.ip && <CopyChip text={vm.ip} label="Copy IP" />}
        {sshCommand && <CopyChip text={sshCommand} label="Copy SSH" />}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <ActionButton
          label="Terminal"
          icon={Terminal}
          disabled={!vm.ip}
          onClick={(event) => {
            event.stopPropagation();
            onTerminal(vm);
          }}
        />
        <ActionButton
          label="Triển khai repo"
          icon={GitBranch}
          onClick={(event) => {
            event.stopPropagation();
            onGitHub(vm.id);
          }}
        />
        <ActionButton
          label={deleting ? "Đang xoá..." : "Xoá VM"}
          icon={deleting ? Loader2 : Trash2}
          destructive
          disabled={deleting}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(vm.name);
          }}
        />
      </div>
    </div>
  );
}

function ServerRow({
  vm,
  selected,
  deleting,
  onSelect,
  onDelete,
  onTerminal,
  onGitHub,
}: {
  vm: VM;
  selected: boolean;
  deleting: boolean;
  onSelect: () => void;
  onDelete: (name: string) => void;
  onTerminal: (vm: VM) => void;
  onGitHub: (vmId: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => handleSelectableSurfaceKeyDown(event, onSelect)}
      className={`surface-panel flex w-full flex-col gap-4 rounded-[1.1rem] p-4 text-left transition md:flex-row md:items-center ${
        selected
          ? "border-primary/45 shadow-[0_24px_54px_-40px_rgba(15,23,42,0.38)]"
          : "hover:border-primary/25"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-[0.8rem] border border-border/70 bg-background/70">
            <Server className="h-5 w-5 text-primary" />
          </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{vm.name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {vm.image || "Image chưa rõ"} • {vm.flavor || "Flavor chưa rõ"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 md:justify-end">
        <StatusBadge status={vm.status} />
        <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground">
          {vm.ip || "Chưa có IP"}
        </span>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="SSH"
            icon={Terminal}
            disabled={!vm.ip}
            onClick={(event) => {
              event.stopPropagation();
              onTerminal(vm);
            }}
          />
          <ActionButton
            label="Repo"
            icon={GitBranch}
            onClick={(event) => {
              event.stopPropagation();
              onGitHub(vm.id);
            }}
          />
          <ActionButton
            label={deleting ? "Đang xoá..." : "Xoá"}
            icon={deleting ? Loader2 : Trash2}
            destructive
            disabled={deleting}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(vm.name);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  destructive = false,
}: {
  label: string;
  icon: LucideIcon;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-[0.8rem] border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        destructive
          ? "border-rose-500/20 bg-rose-500/10 text-rose-300 hover:border-rose-500/35 hover:bg-rose-500/15"
          : "border-border/70 bg-background/70 text-foreground hover:border-primary/35 hover:text-primary"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${label.includes("Đang") ? "animate-spin" : ""}`} />
      {label}
    </button>
  );
}

function InfoMiniCard({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-[0.95rem] border border-border/70 bg-background/70 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${accent ? "text-primary" : ""}`} />
        {label}
      </div>
      <p className="mt-3 line-clamp-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[0.95rem] border border-border/70 bg-background/70 px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span className="max-w-[65%] truncate text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

function GitHubSessionCard({
  user,
  loading,
  refreshing,
  selectedVm,
  onRefresh,
  onDeploy,
  onLogout,
}: {
  user: GitHubUser | null;
  loading: boolean;
  refreshing: boolean;
  selectedVm: VM | null;
  onRefresh: () => void;
  onDeploy: () => void;
  onLogout: () => void;
}) {
  const deployReady = Boolean(selectedVm?.ip);

  return (
    <div className="surface-panel rounded-[1.2rem] p-4">
      <div className="flex items-start gap-3">
        {user ? (
          <Image
            src={user.avatar_url}
            alt={user.login}
            width={44}
            height={44}
            className="h-11 w-11 rounded-[1rem] border border-border/70 object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] border border-border/70 bg-card text-primary">
            <GitBranch className="h-5 w-5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            GitHub
          </p>
          {loading ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang đồng bộ phiên GitHub...
            </div>
          ) : user ? (
            <>
              <p className="mt-1 truncate text-base font-semibold text-foreground">
                {user.name || user.login}
              </p>
              <p className="truncate text-sm text-muted-foreground">@{user.login}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Chưa đọc được phiên GitHub hiện tại.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1.1rem] border border-border/70 bg-card px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Phiên
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">
            {user ? "Đã xác thực" : "Cần kiểm tra"}
          </p>
        </div>
        <div className="rounded-[1.1rem] border border-border/70 bg-card px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            VM mục tiêu
          </p>
          <p className="mt-2 truncate text-sm font-medium text-foreground">
            {selectedVm?.name || "Chưa chọn"}
          </p>
        </div>
        <div className="rounded-[1.1rem] border border-border/70 bg-card px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Deploy repo
          </p>
          <p className="mt-2 text-sm font-medium text-foreground">
            {deployReady ? "Sẵn sàng triển khai" : "Cần VM có IP"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {user?.html_url && (
          <a
            href={user.html_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-[0.8rem] border border-border/70 bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
          >
            <ExternalLink className="h-4 w-4" />
            Hồ sơ GitHub
          </a>
        )}
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-[0.8rem] border border-border/70 bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Làm mới phiên
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 rounded-[0.8rem] border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:border-rose-500/35 hover:bg-rose-500/15"
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </button>
      </div>

      <button
        type="button"
        onClick={onDeploy}
        disabled={!selectedVm}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[0.9rem] bg-foreground px-4 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GitBranch className="h-4 w-4" />
        {selectedVm ? `Chọn repo cho ${selectedVm.name}` : "Chọn VM để deploy repo"}
      </button>
    </div>
  );
}

function ControlPlaneCard({
  total,
  visible,
  attentionCount,
  lastUpdated,
  autoRefresh,
  selectedVm,
  onRefreshFleet,
  onCreate,
  onCopySnapshot,
}: {
  total: number;
  visible: number;
  attentionCount: number;
  lastUpdated: Date | null;
  autoRefresh: boolean;
  selectedVm: VM | null;
  onRefreshFleet: () => void;
  onCreate: () => void;
  onCopySnapshot: () => void;
}) {
  return (
    <div className="surface-panel rounded-[1.2rem] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Điều phối
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Nhịp vận hành OpenStack
          </h2>
        </div>
        <ShieldCheck className="h-5 w-5 text-primary" />
      </div>

      <div className="mt-5 space-y-3">
        <DetailRow label="Hiển thị" value={`${visible}/${total} VM`} />
        <DetailRow label="Cảnh báo" value={`${attentionCount} mục cần xem`} />
        <DetailRow label="Lần sync" value={formatLastUpdated(lastUpdated)} />
        <DetailRow label="Tự refresh" value={autoRefresh ? "Đang bật" : "Đang tắt"} />
        <DetailRow label="VM đang focus" value={selectedVm?.name || "Chưa chọn"} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRefreshFleet}
          className="inline-flex items-center gap-2 rounded-[0.8rem] border border-border/70 bg-background/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
        >
          <RefreshCw className="h-4 w-4" />
          Đồng bộ fleet
        </button>
        <button
          type="button"
          onClick={onCopySnapshot}
          className="inline-flex items-center gap-2 rounded-[0.8rem] border border-border/70 bg-background/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
        >
          <Copy className="h-4 w-4" />
          Copy snapshot
        </button>
      </div>

      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[0.9rem] border border-border/70 bg-background/70 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
      >
        <Plus className="h-4 w-4" />
        Tạo VM mới từ control plane
      </button>
    </div>
  );
}

function NavbarLink({
  href,
  label,
  active = false,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? "border-primary/25 bg-primary/10 text-primary shadow-[0_10px_30px_-20px_rgba(251,191,36,0.8)]"
          : "border-border/40 bg-background/45 text-muted-foreground hover:border-border/70 hover:bg-background/75 hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

function HeroFeatureCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[1rem] border border-border/70 bg-background/70 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
          {label}
        </span>
      </div>
      <p className="mt-3 text-lg font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}

function FooterStatus({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[0.95rem] border border-border/70 bg-background/70 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

export default function Dashboard({
  tab = "mission",
}: {
  tab?: ConsoleTab;
}) {
  const router = useRouter();
  const [vms, setVMs] = useState<VM[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortBy, setSortBy] = useState<SortKey>("status");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createPresetKey, setCreatePresetKey] = useState<string | null>(null);
  const [vmResult, setVmResult] = useState<VMResult | null>(null);
  const [deletingName, setDeletingName] = useState("");
  const [showGitHub, setShowGitHub] = useState(false);
  const [githubTargetVmId, setGitHubTargetVmId] = useState<string | null>(null);
  const [selectedVmId, setSelectedVmId] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [githubUser, setGitHubUser] = useState<GitHubUser | null>(null);
  const [githubLoading, setGitHubLoading] = useState(true);
  const [githubRefreshing, setGitHubRefreshing] = useState(false);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const fetchFleet = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await fetch("/api/get-instances");
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error_message || "Không lấy được danh sách server.");
        }

        setVMs(data.instances || []);
        setLastUpdated(new Date());
      } catch (fetchError) {
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Không kết nối được tới OpenStack API.";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchFleet();
  }, [fetchFleet]);

  const fetchGitHubStatus = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (silent) {
        setGitHubRefreshing(true);
      } else {
        setGitHubLoading(true);
      }

      try {
        const response = await fetch("/api/github/status", {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Không kiểm tra được phiên GitHub.");
        }

        const data = await response.json();
        setGitHubUser(data.user ?? null);
      } catch {
        setGitHubUser(null);
      } finally {
        setGitHubLoading(false);
        setGitHubRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchGitHubStatus();
  }, [fetchGitHubStatus]);

  useEffect(() => {
    setAutoRefresh(readStoredBoolean(AUTO_REFRESH_KEY, true));
    setViewMode(readStoredViewMode());
    setPreferencesHydrated(true);
  }, []);

  useEffect(() => {
    if (!preferencesHydrated || !autoRefresh) {
      return;
    }

    const interval = window.setInterval(() => {
      void fetchFleet({ silent: true });
    }, 15000);

    return () => window.clearInterval(interval);
  }, [autoRefresh, fetchFleet, preferencesHydrated]);

  useEffect(() => {
    if (!preferencesHydrated) {
      return;
    }

    window.localStorage.setItem(AUTO_REFRESH_KEY, String(autoRefresh));
  }, [autoRefresh, preferencesHydrated]);

  useEffect(() => {
    if (!preferencesHydrated) {
      return;
    }

    window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode, preferencesHydrated]);

  let visibleVMs = vms.filter((vm) => {
    if (filter === "ready" && !(vm.status === "ACTIVE" && vm.ip)) {
      return false;
    }

    if (filter === "building" && vm.status !== "BUILD") {
      return false;
    }

    if (
      filter === "attention" &&
      vm.status !== "ERROR" &&
      vm.status !== "SHUTOFF" &&
      !(vm.status === "ACTIVE" && !vm.ip)
    ) {
      return false;
    }

    if (!deferredQuery) {
      return true;
    }

    const haystack = [vm.name, vm.ip, vm.flavor, vm.image, vm.status]
      .join(" ")
      .toLowerCase();

    return haystack.includes(deferredQuery);
  });

  visibleVMs = [...visibleVMs].sort((left, right) => {
    if (sortBy === "name") {
      return left.name.localeCompare(right.name);
    }

    if (sortBy === "ip") {
      return (left.ip || "~").localeCompare(right.ip || "~");
    }

    const byStatus = statusPriority(left.status) - statusPriority(right.status);

    if (byStatus !== 0) {
      return byStatus;
    }

    return left.name.localeCompare(right.name);
  });

  const visibleVmIds = visibleVMs.map((vm) => vm.id).join("|");

  useEffect(() => {
    if (!visibleVMs.length) {
      if (selectedVmId) {
        setSelectedVmId("");
      }
      return;
    }

    if (!visibleVMs.some((vm) => vm.id === selectedVmId)) {
      setSelectedVmId(visibleVMs[0].id);
    }
  }, [selectedVmId, visibleVmIds, visibleVMs]);

  const selectedVm = visibleVMs.find((vm) => vm.id === selectedVmId) ?? null;
  const total = vms.length;
  const readyCount = vms.filter((vm) => vm.status === "ACTIVE" && vm.ip).length;
  const buildingCount = vms.filter((vm) => vm.status === "BUILD").length;
  const attentionCount = vms.filter(
    (vm) =>
      vm.status === "ERROR" ||
      vm.status === "SHUTOFF" ||
      (vm.status === "ACTIVE" && !vm.ip),
  ).length;
  const activeCount = vms.filter((vm) => vm.status === "ACTIVE").length;

  async function handleDelete(name: string) {
    setDeletingName(name);

    try {
      const response = await fetch("/api/delete-vm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_name: name }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error_message || `Không thể xoá ${name}.`);
      }

      toast.success(`Đã gửi lệnh xoá VM "${name}".`);
      void fetchFleet({ silent: true });
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : `Không thể xoá ${name}.`,
      );
    } finally {
      setDeletingName("");
    }
  }

  function openPreset(presetKey: string) {
    setCreatePresetKey(presetKey);
    setShowCreate(true);
  }

  function openGitHub(vmId?: string) {
    setGitHubTargetVmId(vmId ?? selectedVm?.id ?? null);
    setShowGitHub(true);
  }

  function openTerminalLab(target: VM, initialCommand?: string) {
    setSelectedVmId(target.id);
    writeTerminalWorkspace({
      vmId: target.id,
      vmName: target.name,
      host: target.ip,
      username: SSH_USER,
      initialCommand,
    });

    startTransition(() => {
      router.push("/terminal");
    });
  }

  function handleDeployFromGitHub(plan: GitHubDeployPlan) {
    const target = vms.find((vm) => vm.id === plan.vmId);

    if (!target) {
      return;
    }

    setShowGitHub(false);
    setGitHubTargetVmId(null);
    openTerminalLab(target, plan.initialCommand);

    toast.success(`Đã chuẩn bị workflow deploy cho ${plan.repoLabel}.`);
  }

  function handleLogout() {
    window.location.assign("/api/github/logout");
  }

  const headerTitle = loading ? "Đang tải fleet..." : `${total} VM trong hệ thống`;
  const navigationItems: Array<{
    href: string;
    key: ConsoleTab;
    label: string;
  }> = [
    { href: "/", key: "mission", label: "Tổng quan" },
    { href: "/fleet", key: "fleet", label: "Máy ảo" },
    { href: "/launch", key: "launch", label: "Tạo máy" },
    { href: "/inspect", key: "inspect", label: "Theo dõi" },
    { href: "/command", key: "command", label: "Điều phối" },
    { href: "/terminal", key: "terminal", label: "Terminal" },
  ];
  const shellMeta: Record<
    ConsoleTab,
    {
      eyebrow: string;
      title: string;
      description: string;
    }
  > = {
    mission: {
      eyebrow: "Tổng quan",
      title: "Trung tâm điều hành",
      description:
        "Xem nhanh trạng thái OpenStack, GitHub và máy ảo đang được chọn ngay trên màn chính.",
    },
    fleet: {
      eyebrow: "Máy ảo",
      title: "Quản lý toàn bộ máy ảo",
      description:
        "Lọc, sắp xếp và thao tác trực tiếp trên từng VM trong một màn riêng.",
    },
    launch: {
      eyebrow: "Tạo máy",
      title: "Tạo máy ảo bằng mẫu có sẵn",
      description:
        "Chọn preset phù hợp, tạo VM nhanh rồi nối tiếp sang luồng triển khai.",
    },
    inspect: {
      eyebrow: "Theo dõi",
      title: "Theo dõi chi tiết một máy ảo",
      description:
        "Gom IP, flavor, image, SSH và thao tác chính của đúng máy đang chọn.",
    },
    command: {
      eyebrow: "Điều phối",
      title: "Điều phối triển khai và vận hành",
      description:
        "Tập trung các thông tin quan trọng cho deploy repo, terminal và trạng thái hệ thống.",
    },
    terminal: {
      eyebrow: "Terminal",
      title: "Làm việc với SSH",
      description:
        "Kết nối SSH, xem script triển khai và gửi lệnh trong một màn riêng.",
    },
  };
  const currentShell = shellMeta[tab];

  const sessionCard = (
    <GitHubSessionCard
      user={githubUser}
      loading={githubLoading}
      refreshing={githubRefreshing}
      selectedVm={selectedVm}
      onRefresh={() => void fetchGitHubStatus({ silent: true })}
      onDeploy={() => openGitHub(selectedVm?.id)}
      onLogout={handleLogout}
    />
  );

  const controlPlanePanel = (
    <ControlPlaneCard
      total={total}
      visible={visibleVMs.length}
      attentionCount={attentionCount}
      lastUpdated={lastUpdated}
      autoRefresh={autoRefresh}
      selectedVm={selectedVm}
      onRefreshFleet={() => void fetchFleet({ silent: true })}
      onCreate={() => {
        setCreatePresetKey(null);
        setShowCreate(true);
      }}
      onCopySnapshot={() =>
        void tryCopy(
          buildInventoryText(visibleVMs),
          "Đã copy snapshot fleet.",
        )
      }
    />
  );

  const opsRail = (
    <div className="space-y-4">
      <div className="surface-panel rounded-[1.5rem] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Thao tác nhanh
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Dock thao tác nhanh
            </h2>
          </div>
          <Workflow className="h-5 w-5 text-primary" />
        </div>

        <div className="mt-5 grid gap-3">
          <button
            type="button"
            onClick={() => {
              setCreatePresetKey(null);
              setShowCreate(true);
            }}
            className="inline-flex w-full items-center justify-between rounded-[1rem] bg-foreground px-4 py-3.5 text-left text-sm font-semibold text-background transition hover:opacity-90"
          >
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Tạo VM mới
            </span>
            <ArrowUpRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => void fetchFleet({ silent: true })}
            className="inline-flex w-full items-center justify-between rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3.5 text-left text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Đồng bộ fleet
            </span>
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              live
            </span>
          </button>

          <button
            type="button"
            onClick={() => openGitHub(selectedVm?.id)}
            className="inline-flex w-full items-center justify-between rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3.5 text-left text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
          >
            <span className="inline-flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Mở repo pipeline
            </span>
            <ArrowUpRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() =>
              void tryCopy(
                buildInventoryText(visibleVMs),
                "Đã sao chép snapshot máy ảo.",
              )
            }
            className="inline-flex w-full items-center justify-between rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3.5 text-left text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
          >
            <span className="inline-flex items-center gap-2">
              <Copy className="h-4 w-4" />
              Sao chép snapshot
            </span>
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <InfoMiniCard
            icon={Network}
            label="Đích đang chọn"
            value={selectedVm?.ip || "Chưa chọn VM có IP"}
            accent
          />
          <InfoMiniCard
            icon={Cpu}
            label="SSH sẵn sàng"
            value={`${total ? Math.round((readyCount / total) * 100) : 0}% VM có thể mở terminal`}
          />
        </div>
      </div>

      <div className="surface-panel rounded-[1.5rem] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Triển khai repo
        </p>
        <div className="mt-4 space-y-3">
          {[
            "Chọn repo từ GitHub đã liên kết hoặc repo ngoài",
            "Tạo file .env từ biến môi trường ngay trong giao diện",
            "Hỗ trợ lệnh cài đặt và lệnh chạy sau triển khai",
            "Terminal nhận sẵn script để chạy tiếp sau khi kết nối",
          ].map((item) => (
            <div
              key={item}
              className="rounded-[0.95rem] border border-border/70 bg-background/70 px-4 py-3 text-sm text-foreground"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const buildModesPanel = (
    <div className="surface-panel rounded-[1.5rem] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Kiểu triển khai
      </p>
      <div className="mt-4 grid gap-3">
        <InfoMiniCard
          icon={Boxes}
          label="Node / Python / Docker"
          value="Recipe deploy đổi theo stack thay vì chỉ git clone."
        />
        <InfoMiniCard
          icon={Database}
          label="Biến môi trường"
          value="File .env được tạo tự động nếu bạn truyền env trong modal."
        />
        <InfoMiniCard
          icon={GitBranch}
          label="Repo ngoài"
          value="Hỗ trợ URL ngoài hoặc owner/repo để cấy source nhanh."
        />
      </div>
    </div>
  );

  const inspectorPanel = (
    <div className="surface-panel rounded-[1.5rem] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Chi tiết máy ảo
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            {selectedVm ? selectedVm.name : "Chọn một VM"}
          </h2>
        </div>
        {selectedVm && <StatusBadge status={selectedVm.status} />}
      </div>

      {selectedVm ? (
        <>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {getStatusMeta(selectedVm.status).description}
          </p>

          <div className="mt-5 space-y-3">
            <DetailRow label="IP" value={selectedVm.ip || "Chưa cấp IP"} />
            <DetailRow label="Flavor" value={selectedVm.flavor || "Chưa rõ"} />
            <DetailRow label="Image" value={selectedVm.image || "Chưa rõ"} />
            <DetailRow label="SSH user" value={SSH_USER} />
          </div>

          <div className="mt-5 rounded-[1.2rem] border border-border/70 bg-background/75 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Thao tác nhanh
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {selectedVm.ip && (
                <>
                  <CopyChip
                    text={`ssh ${SSH_USER}@${selectedVm.ip}`}
                    label="Copy SSH"
                  />
                  <button
                    type="button"
                    onClick={() => openTerminalLab(selectedVm)}
                    className="inline-flex items-center gap-2 rounded-[0.85rem] border border-border/70 bg-background/70 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    Mở terminal
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => openGitHub(selectedVm.id)}
                className="inline-flex items-center gap-2 rounded-[0.85rem] border border-border/70 bg-background/70 px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
              >
                <GitBranch className="h-3.5 w-3.5" />
                Triển khai repo
              </button>

              <button
                type="button"
                onClick={() => handleDelete(selectedVm.name)}
                disabled={deletingName === selectedVm.name}
                className="inline-flex items-center gap-2 rounded-[0.85rem] border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:border-rose-500/35 hover:bg-rose-500/15 disabled:opacity-50"
              >
                {deletingName === selectedVm.name ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Xóa VM
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-[1.25rem] border border-dashed border-border/70 bg-background/60 p-6 text-sm leading-6 text-muted-foreground">
            Chọn một VM trong danh sách để xem IP, SSH, trạng thái và các nút thao tác
            nhanh của đúng máy đó.
        </div>
      )}
    </div>
  );

  const launchKitsPanel = (
    <div className="surface-panel rounded-[1.5rem] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Mẫu tạo máy
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Chọn mẫu để tạo máy ảo nhanh
          </h2>
        </div>
        <Sparkles className="h-5 w-5 text-primary" />
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
        Chọn thẳng mẫu phù hợp. Mỗi mẫu sẽ mở form tạo VM với cấu hình gợi ý đúng
        theo stack bạn đang cần.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {serverPresets.map((preset) => (
          <PresetCard
            key={preset.key}
            presetKey={preset.key}
            onClick={openPreset}
          />
        ))}
      </div>
    </div>
  );

  const fleetAlert = error ? (
    <div className="rounded-[1.3rem] border border-rose-500/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-200 dark:text-rose-300">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>{error}</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchFleet()}
          className="inline-flex items-center gap-2 rounded-[0.9rem] border border-rose-500/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-200 transition hover:bg-rose-500/10"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Thử lại
        </button>
      </div>
    </div>
  ) : null;

  const fleetCollection = loading ? (
    <FleetSkeleton />
  ) : total === 0 ? (
    <EmptyFleet
      onCreate={() => {
        setCreatePresetKey(null);
        setShowCreate(true);
      }}
      onPreset={openPreset}
    />
  ) : visibleVMs.length === 0 ? (
    <div className="surface-panel rounded-[1.5rem] p-8 text-center">
      <h3 className="text-2xl font-semibold tracking-tight text-foreground">
        Không có VM nào khớp bộ lọc hiện tại
      </h3>
      <p className="mt-3 text-sm text-muted-foreground">
        Thử đổi filter, bỏ từ khóa tìm kiếm hoặc làm mới snapshot fleet.
      </p>
    </div>
  ) : viewMode === "grid" ? (
    <div className="grid gap-4 md:grid-cols-2">
      {visibleVMs.map((vm) => (
        <ServerCard
          key={vm.id}
          vm={vm}
          selected={selectedVmId === vm.id}
          deleting={deletingName === vm.name}
          onSelect={() => setSelectedVmId(vm.id)}
          onDelete={handleDelete}
          onTerminal={(target) => openTerminalLab(target)}
          onGitHub={openGitHub}
        />
      ))}
    </div>
  ) : (
    <div className="space-y-3">
      {visibleVMs.map((vm) => (
        <ServerRow
          key={vm.id}
          vm={vm}
          selected={selectedVmId === vm.id}
          deleting={deletingName === vm.name}
          onSelect={() => setSelectedVmId(vm.id)}
          onDelete={handleDelete}
          onTerminal={(target) => openTerminalLab(target)}
          onGitHub={openGitHub}
        />
      ))}
    </div>
  );

  const fleetMatrixPanel = (
    <div className="surface-panel rounded-[1.7rem] p-5 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1 pr-0 xl:pr-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Danh sách máy ảo
          </p>
          <h2 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-foreground">
            Xem, lọc và thao tác trực tiếp trên toàn bộ máy ảo.
          </h2>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
          <button
            type="button"
            onClick={() =>
              void tryCopy(
                buildInventoryText(visibleVMs),
                "Đã sao chép snapshot máy ảo.",
              )
            }
            className="inline-flex items-center gap-2 rounded-[0.95rem] border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
          >
            <Copy className="h-4 w-4" />
            Sao chép nhanh
          </button>

          <button
            type="button"
            onClick={() => setAutoRefresh((current) => !current)}
            className={`inline-flex items-center gap-2 rounded-[0.95rem] border px-4 py-2.5 text-sm font-semibold transition ${
              autoRefresh
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-border/70 bg-background/75 text-foreground hover:border-primary/35 hover:text-primary"
            }`}
          >
            <RefreshCw className={`h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`} />
            {autoRefresh ? "Tự làm mới đang bật" : "Tự làm mới đang tắt"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="flex items-center gap-3 rounded-[1.15rem] border border-border/70 bg-background/75 px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên, IP, flavor, image..."
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>

        <label className="inline-flex items-center gap-3 rounded-[1.15rem] border border-border/70 bg-background/75 px-4 py-3 text-sm font-medium text-foreground">
          <span>Sắp xếp</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortKey)}
            className="bg-transparent text-sm text-foreground outline-none"
          >
            <option value="status">Theo trạng thái</option>
            <option value="name">Theo tên</option>
            <option value="ip">Theo IP</option>
          </select>
        </label>

        <div className="inline-flex rounded-[1rem] border border-border/70 bg-background/75 p-1">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`rounded-[0.8rem] px-3 py-2 text-sm font-semibold transition ${
              viewMode === "grid"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Grid2X2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded-[0.8rem] px-3 py-2 text-sm font-semibold transition ${
              viewMode === "list"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutList className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all" as const, label: "Tất cả", count: total },
            { key: "ready" as const, label: "Sẵn sàng", count: readyCount },
            { key: "building" as const, label: "Đang tạo", count: buildingCount },
            { key: "attention" as const, label: "Cần chú ý", count: attentionCount },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`inline-flex items-center gap-2 rounded-[0.95rem] border px-4 py-2 text-sm font-semibold transition ${
                filter === item.key
                  ? "border-primary/35 bg-primary/10 text-primary"
                  : "border-border/70 bg-background/75 text-foreground hover:border-primary/25 hover:text-primary"
              }`}
            >
              <span>{item.label}</span>
              <span className="rounded-full bg-background/75 px-2 py-0.5 text-xs text-muted-foreground">
                {item.count}
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-[0.95rem] border border-border/70 bg-background/75 px-4 py-2 text-sm text-muted-foreground">
          Hiển thị {visibleVMs.length} / {total} VM
        </div>
      </div>
    </div>
  );

  const missionPage = (
    <section className="mt-6 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px] xl:items-start">
      <aside>{opsRail}</aside>

      <div className="space-y-4">
        <div className="surface-panel surface-noise overflow-hidden rounded-[1.8rem] p-5 sm:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/72 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <span
              className={`h-2 w-2 rounded-full ${
                error ? "bg-rose-400" : "bg-emerald-400"
              }`}
            />
            {error ? "Hệ thống cần kiểm tra" : "Hệ thống đang hoạt động"}
          </div>

          <h1 className="mt-5 max-w-4xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl xl:text-[3.7rem]">
            Mỗi tab là một màn làm việc riêng cho đúng tác vụ.
          </h1>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
            Màn tổng quan này chỉ giữ lại thứ cần xem nhanh: trạng thái OpenStack,
            nhịp cập nhật, phiên GitHub và máy ảo đang được chọn để thao tác.
          </p>

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            <MetricCard
              icon={Server}
              label="Máy ảo"
              value={total}
              helper={headerTitle}
            />
            <MetricCard
              icon={ShieldCheck}
              label="SSH sẵn sàng"
              value={readyCount}
              helper={`${activeCount} VM đang ACTIVE`}
            />
            <MetricCard
              icon={CircleAlert}
              label="Cần chú ý"
              value={attentionCount}
              helper={error || "Theo dõi máy lỗi, đã tắt hoặc chưa có IP"}
            />
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            <HeroFeatureCard
              icon={RefreshCw}
              label="Đang tạo"
              value={`${buildingCount} máy`}
              helper={`Cập nhật lần cuối ${formatLastUpdated(lastUpdated)}`}
            />
            <HeroFeatureCard
              icon={GitBranch}
              label="GitHub"
              value={githubUser ? `@${githubUser.login}` : "Chưa đăng nhập"}
              helper="Repo đã liên kết và repo ngoài cùng đi qua một luồng triển khai."
            />
            <HeroFeatureCard
              icon={Terminal}
              label="Máy đang chọn"
              value={selectedVm?.name || "Chưa chọn máy"}
              helper="Phần theo dõi và terminal sẽ dùng máy này làm mục tiêu mặc định."
            />
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        {sessionCard}
        {buildModesPanel}
      </aside>
    </section>
  );

  const fleetPage = (
    <section className="mt-6 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px] xl:items-start">
      <aside>{opsRail}</aside>
      <div className="space-y-4">
        {fleetMatrixPanel}
        {fleetAlert}
        {fleetCollection}
      </div>
      <aside className="space-y-4">
        {controlPlanePanel}
        {inspectorPanel}
      </aside>
    </section>
  );

  const launchPage = (
    <section className="mt-6 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px] xl:items-start">
      <aside>{opsRail}</aside>
      <div className="space-y-4">
        {launchKitsPanel}
        <div className="surface-panel rounded-[1.5rem] p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Ghi chú tạo máy
          </p>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <HeroFeatureCard
              icon={Boxes}
              label="Tốc độ"
              value="1 bước"
              helper="Mỗi mẫu mở thẳng form tạo VM với gợi ý đúng theo stack."
            />
            <HeroFeatureCard
              icon={Database}
              label="Biến môi trường"
              value="Đã tích hợp"
              helper="Có thể sinh file .env từ bước deploy sau khi máy khởi tạo xong."
            />
            <HeroFeatureCard
              icon={Terminal}
              label="Sau triển khai"
              value="Hook sẵn"
              helper="Sau khi tạo máy xong có thể mở terminal để cài tiếp ngay."
            />
          </div>
        </div>
      </div>
      <aside className="space-y-4">
        {sessionCard}
        {buildModesPanel}
      </aside>
    </section>
  );

  const inspectPage = (
    <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
      <div className="space-y-4">
        {fleetMatrixPanel}
        {fleetAlert}
        <div className="surface-panel rounded-[1.5rem] p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Chọn máy
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Chọn máy ở đây để xem chi tiết ở cột bên phải
          </h2>
          <div className="mt-5 space-y-3">
            {loading ? (
              <FleetSkeleton />
            ) : visibleVMs.length === 0 ? (
              <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/60 p-6 text-sm text-muted-foreground">
                Không có máy nào phù hợp với bộ lọc hiện tại để theo dõi.
              </div>
            ) : (
              visibleVMs.map((vm) => (
                <ServerRow
                  key={vm.id}
                  vm={vm}
                  selected={selectedVmId === vm.id}
                  deleting={deletingName === vm.name}
                  onSelect={() => setSelectedVmId(vm.id)}
                  onDelete={handleDelete}
                  onTerminal={(target) => openTerminalLab(target)}
                  onGitHub={openGitHub}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        {inspectorPanel}
        {sessionCard}
        {controlPlanePanel}
      </aside>
    </section>
  );

  const commandPage = (
    <section className="mt-6 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px] xl:items-start">
      <aside>{opsRail}</aside>
      <div className="space-y-4">
        <div className="surface-panel surface-noise rounded-[1.5rem] p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Điều phối
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            Trung tâm điều phối deploy, runtime và phiên điều khiển
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            Trang này gom các trạng thái quan trọng nhất để vận hành: session GitHub,
            tốc độ refresh fleet, máy đang focus và mô hình deploy mới hỗ trợ repo
            ngoài, biến môi trường, install command và hook sau triển khai.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <FooterStatus label="Fleet hiển thị" value={`${visibleVMs.length}/${total} VM`} />
            <FooterStatus
              label="Phiên GitHub"
              value={githubUser ? `@${githubUser.login}` : "Chưa đồng bộ"}
            />
            <FooterStatus
              label="Tự làm mới"
              value={autoRefresh ? "Bật mỗi 15 giây" : "Đang tắt"}
            />
            <FooterStatus label="Máy đang chọn" value={selectedVm?.name || "Chưa chọn VM"} />
            <FooterStatus label="SSH user" value={SSH_USER} />
            <FooterStatus
              label="Luồng repo"
              value="Clone, env, cài đặt, sau triển khai"
            />
          </div>
        </div>

        <div className="surface-panel rounded-[1.5rem] p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Ghi chú vận hành
          </p>
          <div className="mt-4 space-y-3">
            <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-3 text-sm text-foreground">
              OpenStack CLI vẫn chạy trên server có openrc, không đổi kiến trúc nền.
            </div>
            <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-3 text-sm text-foreground">
              GitHub login là OAuth callback flow, không còn device code.
            </div>
            <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-3 text-sm text-foreground">
              Deploy repo đã hỗ trợ repo ngoài, biến môi trường và hook sau cài đặt.
            </div>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        {sessionCard}
        {controlPlanePanel}
        {inspectorPanel}
      </aside>
    </section>
  );

  const terminalPage = (
    <TerminalWorkbench
      vms={vms}
      selectedVmId={selectedVmId}
      refreshing={refreshing}
      onSelectVm={setSelectedVmId}
      onRefreshFleet={() => void fetchFleet({ silent: true })}
      onOpenDeploy={openGitHub}
    />
  );

  const pageContent =
    tab === "fleet"
      ? fleetPage
      : tab === "launch"
        ? launchPage
        : tab === "inspect"
          ? inspectPage
          : tab === "command"
            ? commandPage
            : tab === "terminal"
              ? terminalPage
            : missionPage;

  const shellHeader = (
    <header className="surface-panel sticky top-4 z-40 overflow-hidden rounded-[1.6rem] px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Link
              href="/"
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[1rem] bg-foreground text-background shadow-[0_18px_44px_-28px_rgba(15,23,42,0.78)]"
            >
              <Activity className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${error ? "bg-rose-400" : "bg-emerald-400 status-pulse"}`} />
                OrbitStack // Bảng điều khiển
              </div>
              <h1 className="mt-3 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {currentShell.title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {currentShell.description}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-3 xl:min-w-[24rem] xl:items-end">
            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              <div className="inline-flex items-center gap-2 rounded-[1rem] border border-border/70 bg-background/75 px-3 py-2 text-sm text-muted-foreground">
                <span className={`h-2.5 w-2.5 rounded-full ${refreshing ? "bg-amber-400 status-pulse" : error ? "bg-rose-400" : "bg-emerald-400"}`} />
                Sync {formatLastUpdated(lastUpdated)}
              </div>
              <div className="inline-flex items-center gap-2 rounded-[1rem] border border-border/70 bg-background/75 px-3 py-2 text-sm text-muted-foreground">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Trang
                </span>
                <span className="font-semibold text-foreground">
                  {currentShell.eyebrow}
                </span>
              </div>
              <ThemeToggle />
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Link
                href="/dashboard/databases"
                className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
              >
                <Database className="h-4 w-4" />
                Cơ sở dữ liệu
              </Link>
              <button
                type="button"
                onClick={() => {
                  setCreatePresetKey(null);
                  setShowCreate(true);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Tao VM moi
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {navigationItems.map((item) => (
              <NavbarLink
                key={item.key}
                href={item.href}
                label={item.label}
                active={tab === item.key}
              />
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[32rem]">
            <FooterStatus
              label="Máy hiển thị"
              value={`${visibleVMs.length}/${total} VM`}
            />
            <FooterStatus
              label="Máy đang chọn"
              value={selectedVm?.name || "Chưa chọn"}
            />
            <FooterStatus
              label="GitHub"
              value={githubUser ? `@${githubUser.login}` : "Đang khóa"}
            />
          </div>
        </div>
      </div>
    </header>
  );

  const shellFooter = (
    <footer className="surface-panel mt-5 rounded-[1.6rem] px-5 py-5 sm:px-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-[1.2rem] border border-border/70 bg-background/72 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Tóm tắt nhanh
          </p>
          <p className="mt-3 text-lg font-semibold tracking-tight text-foreground">
            Xem nhanh trạng thái hiện tại và đi tới các màn bạn dùng nhiều nhất.
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Dùng các lối tắt bên dưới để chuyển nhanh sang cơ sở dữ liệu, terminal hoặc danh sách máy ảo.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <FooterStatus
            label="Trang hiện tại"
            value={currentShell.eyebrow}
          />
          <FooterStatus
            label="Lần đồng bộ"
            value={formatLastUpdated(lastUpdated)}
          />
          <FooterStatus
            label="SSH sẵn sàng"
            value={`${readyCount}/${total || 0} VM`}
          />
          <FooterStatus
            label="Tự làm mới"
            value={autoRefresh ? "Đang bật" : "Đang tắt"}
          />
        </div>

        <div className="rounded-[1.2rem] border border-border/70 bg-background/72 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Đi nhanh
          </p>
          <div className="mt-4 grid gap-2">
            <Link
              href="/dashboard/databases"
              className="inline-flex items-center justify-between rounded-[0.95rem] border border-border/70 bg-background/75 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
            >
              <span className="inline-flex items-center gap-2">
                <Database className="h-4 w-4" />
                Cơ sở dữ liệu
              </span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              href="/terminal"
              className="inline-flex items-center justify-between rounded-[0.95rem] border border-border/70 bg-background/75 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
            >
              <span className="inline-flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Terminal
              </span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              href="/fleet"
              className="inline-flex items-center justify-between rounded-[0.95rem] border border-border/70 bg-background/75 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
            >
              <span className="inline-flex items-center gap-2">
                <Server className="h-4 w-4" />
                Máy ảo
              </span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-y-0 left-[4%] w-px bg-gradient-to-b from-transparent via-border/60 to-transparent" />
        <div className="absolute inset-y-0 right-[4%] w-px bg-gradient-to-b from-transparent via-border/40 to-transparent" />
        <div className="absolute left-[-12rem] top-[-10rem] h-[26rem] w-[26rem] rounded-full bg-cyan-400/15 blur-3xl dark:bg-cyan-500/18" />
        <div className="absolute right-[-8rem] top-24 h-[22rem] w-[22rem] rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-400/12" />
        <div className="absolute bottom-[-12rem] left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-emerald-300/14 blur-3xl dark:bg-emerald-500/10" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1640px] px-4 pb-8 pt-4 sm:px-6 lg:px-8">
        {shellHeader}

        <nav className="hidden surface-panel sticky top-4 z-40 rounded-[1.4rem] px-4 py-3 sm:px-5">
          <div className="grid gap-3 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-foreground text-background shadow-[0_16px_40px_-26px_rgba(15,23,42,0.7)]">
                <Activity className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  OrbitStack // Bảng điều khiển
                </p>
                <p className="text-sm font-semibold text-foreground">
                  OpenStack control shell cho vận hành thật
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-center">
              {navigationItems.map((item) => (
                <NavbarLink
                  key={item.key}
                  href={item.href}
                  label={item.label}
                  active={tab === item.key}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              <div className="rounded-[0.9rem] border border-border/70 bg-background/75 px-3 py-2 text-sm text-muted-foreground">
                Sync {formatLastUpdated(lastUpdated)}
              </div>
              <ThemeToggle />
            </div>
          </div>
        </nav>

        {pageContent}

        {shellFooter}

        <footer className="hidden mt-4 rounded-[1.2rem] border border-border/70 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <span>Giao diện được tách thành nhiều màn riêng để thao tác nhanh và gọn hơn.</span>
            <span>
              Trang hiện tại: <span className="font-semibold text-foreground">{tab}</span>
            </span>
          </div>
        </footer>
      </div>

      {showCreate && (
        <CreateServerModal
          initialPresetKey={createPresetKey}
          onClose={() => {
            setShowCreate(false);
            setCreatePresetKey(null);
          }}
          onSuccess={(data) => {
            setShowCreate(false);
            setCreatePresetKey(null);
            setVmResult(data);
            void fetchFleet({ silent: true });
          }}
        />
      )}

      {vmResult && (
        <VMSuccessModal
          info={vmResult}
          onOpenTerminal={(host) => {
            openTerminalLab({
              id: vmResult.vm_id,
              name: vmResult.vm_name,
              status: vmResult.status,
              ip: host,
              flavor: vmResult.flavor,
              image: vmResult.os,
            });
          }}
          onClose={() => {
            setVmResult(null);
            void fetchFleet({ silent: true });
          }}
        />
      )}

      {showGitHub && (
        <GitHubDeployModal
          vms={vms}
          githubUser={githubUser}
          initialVmId={githubTargetVmId ?? undefined}
          onDeploy={handleDeployFromGitHub}
          onClose={() => {
            setShowGitHub(false);
            setGitHubTargetVmId(null);
          }}
        />
      )}
    </div>
  );
}
