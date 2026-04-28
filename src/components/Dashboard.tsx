"use client";

import Image from "next/image";
import {
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
import ThemeToggle from "@/components/ThemeToggle";
import VMSuccessModal from "@/components/VMSuccessModal";
import WebSSHModal from "@/components/WebSSHModal";
import { copyToClipboard } from "@/lib/clipboard";
import { serverPresets } from "@/lib/presets";

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
        `${index + 1}. ${vm.name} | ${vm.status} | ${vm.ip || "No IP"} | ${vm.flavor || "Unknown flavor"} | ${vm.image || "Unknown image"}`,
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
    <div className="surface-panel surface-noise relative overflow-hidden rounded-[1.6rem] p-5">
      <div className="absolute right-4 top-4 rounded-full border border-border/70 bg-background/70 p-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-6 text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = getStatusMeta(status);

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${meta.tone}`}
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
    <div className="surface-panel surface-noise rounded-[2rem] p-8 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.4rem] border border-border/70 bg-background/75 text-muted-foreground">
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
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Tạo VM mới
        </button>
        {serverPresets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onPreset(preset.key)}
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-3 text-sm font-medium text-foreground transition hover:border-primary/35 hover:text-primary"
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
      className="surface-panel group relative overflow-hidden rounded-[1.6rem] p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/35"
    >
      <div className="absolute right-4 top-4 rounded-full bg-primary/10 p-2 text-primary transition group-hover:scale-105">
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
      className={`surface-panel group relative w-full overflow-hidden rounded-[1.7rem] p-5 text-left transition ${
        selected
          ? "border-primary/45 shadow-[0_35px_80px_-55px_rgba(37,99,235,0.55)]"
          : "hover:-translate-y-0.5 hover:border-primary/25"
      }`}
    >
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
          label="Web SSH"
          icon={Terminal}
          disabled={!vm.ip}
          onClick={(event) => {
            event.stopPropagation();
            onTerminal(vm);
          }}
        />
        <ActionButton
          label="Deploy Repo"
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
      className={`surface-panel flex w-full flex-col gap-4 rounded-[1.5rem] p-4 text-left transition md:flex-row md:items-center ${
        selected
          ? "border-primary/45 shadow-[0_30px_60px_-45px_rgba(37,99,235,0.5)]"
          : "hover:border-primary/25"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] border border-border/70 bg-background/70">
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
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
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
    <div className="rounded-[1.2rem] border border-border/70 bg-background/70 p-3">
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
    <div className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-border/70 bg-background/70 px-4 py-3">
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
    <div className="rounded-[1.5rem] border border-border/70 bg-background/76 p-4">
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
            GitHub Access
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
            {deployReady ? "Sẵn sàng Web SSH" : "Cần VM có IP"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {user?.html_url && (
          <a
            href={user.html_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
          >
            <ExternalLink className="h-4 w-4" />
            Hồ sơ GitHub
          </a>
        )}
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Làm mới phiên
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:border-rose-500/35 hover:bg-rose-500/15"
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </button>
      </div>

      <button
        type="button"
        onClick={onDeploy}
        disabled={!selectedVm}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem] bg-foreground px-4 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
    <div className="surface-panel rounded-[2rem] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Control Plane
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
          className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
        >
          <RefreshCw className="h-4 w-4" />
          Đồng bộ fleet
        </button>
        <button
          type="button"
          onClick={onCopySnapshot}
          className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
        >
          <Copy className="h-4 w-4" />
          Copy snapshot
        </button>
      </div>

      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[1.1rem] border border-border/70 bg-background/70 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
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
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      className="rounded-full border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-border/70 hover:bg-background/70 hover:text-foreground"
    >
      {label}
    </a>
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
    <div className="rounded-[1.35rem] border border-border/70 bg-background/70 p-4">
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
    <div className="rounded-[1.2rem] border border-border/70 bg-background/70 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

export default function Dashboard() {
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
  const [sshSession, setSshSession] = useState<{
    vm: VM;
    command?: string;
  } | null>(null);
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

  function handleDeployFromGitHub(plan: GitHubDeployPlan) {
    const target = vms.find((vm) => vm.id === plan.vmId);

    if (!target) {
      return;
    }

    setShowGitHub(false);
    setGitHubTargetVmId(null);
    setSshSession({
      vm: target,
      command: plan.initialCommand,
    });

    toast.success(`Đã chuẩn bị workflow deploy cho ${plan.repoLabel}.`);
  }

  function handleLogout() {
    window.location.assign("/api/github/logout");
  }

  const headerTitle = loading ? "Đang tải fleet..." : `${total} VM trong hệ thống`;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-12rem] top-[-10rem] h-[26rem] w-[26rem] rounded-full bg-cyan-400/15 blur-3xl dark:bg-cyan-500/18" />
        <div className="absolute right-[-8rem] top-24 h-[22rem] w-[22rem] rounded-full bg-amber-300/20 blur-3xl dark:bg-amber-400/12" />
        <div className="absolute bottom-[-12rem] left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-emerald-300/14 blur-3xl dark:bg-emerald-500/10" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-10 pt-4 sm:px-6 lg:px-8">
        <nav className="surface-panel sticky top-4 z-30 mb-6 rounded-[1.6rem] px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 rounded-full border border-border/70 bg-background/70 px-3 py-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    OrbitStack
                  </p>
                  <p className="text-sm font-semibold text-foreground">OpenStack Control</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <NavbarLink href="#overview" label="Tổng quan" />
                <NavbarLink href="#fleet" label="Fleet" />
                <NavbarLink href="#launch" label="Preset" />
                <NavbarLink href="#focus" label="VM Focus" />
                <NavbarLink href="#footer" label="Footer" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-border/70 bg-background/70 px-4 py-2 text-sm text-muted-foreground">
                Sync {formatLastUpdated(lastUpdated)}
              </div>
              <ThemeToggle />
              <button
                type="button"
                onClick={() => openGitHub()}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
              >
                <GitBranch className="h-4 w-4" />
                GitHub Deploy
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatePresetKey(null);
                  setShowCreate(true);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Tạo server mới
              </button>
            </div>
          </div>
        </nav>

        <header
          id="overview"
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start"
        >
          <div className="surface-panel surface-noise overflow-hidden rounded-[2.2rem] px-5 py-6 sm:px-6 sm:py-7 xl:px-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/72 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span
                className={`h-2 w-2 rounded-full ${
                  error ? "bg-rose-400" : "bg-emerald-400"
                }`}
              />
              {error ? "OpenStack cần kiểm tra" : "OpenStack đang kết nối"}
            </div>

            <h1 className="mt-5 text-3xl font-semibold leading-none tracking-tight text-foreground sm:text-4xl xl:text-[3.2rem]">
              OrbitStack Console
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              Dashboard mới được chia lại theo đúng nhịp vận hành OpenStack: có navbar,
              header, footer, khối fleet rõ ràng và một pipeline deploy repo đủ để đi
              từ source code đến cấu hình môi trường ngay trong Web SSH.
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <HeroFeatureCard
                icon={ShieldCheck}
                label="SSH Ready"
                value={`${readyCount} VM`}
                helper="Máy đã có IP và có thể vào terminal ngay."
              />
              <HeroFeatureCard
                icon={GitBranch}
                label="Repo Relay"
                value={githubUser ? `@${githubUser.login}` : "Chưa đọc phiên"}
                helper="Có thể lấy repo đã liên kết hoặc dán repo ngoài."
              />
              <HeroFeatureCard
                icon={Terminal}
                label="Deploy Flow"
                value={selectedVm ? selectedVm.name : "Chọn một VM"}
                helper="Web SSH sẽ nhận luôn script clone, env và install."
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-2 text-sm text-muted-foreground">
              <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5">
                OpenStack CLI chạy trực tiếp trên server
              </span>
              <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5">
                GitHub OAuth gate đang bật
              </span>
              <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5">
                Repo ngoài + `.env` + install command đã sẵn sàng
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <GitHubSessionCard
              user={githubUser}
              loading={githubLoading}
              refreshing={githubRefreshing}
              selectedVm={selectedVm}
              onRefresh={() => void fetchGitHubStatus({ silent: true })}
              onDeploy={() => openGitHub(selectedVm?.id)}
              onLogout={handleLogout}
            />
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Server}
            label="Toàn fleet"
            value={total}
            helper={headerTitle}
          />
          <MetricCard
            icon={ShieldCheck}
            label="Sẵn sàng SSH"
            value={readyCount}
            helper={`${activeCount} VM đang ACTIVE`}
          />
          <MetricCard
            icon={RefreshCw}
            label="Provisioning"
            value={buildingCount}
            helper={`Làm mới ${formatLastUpdated(lastUpdated)}`}
          />
          <MetricCard
            icon={CircleAlert}
            label="Cần chú ý"
            value={attentionCount}
            helper={error ? error : "Bao gồm VM lỗi, tắt hoặc chưa có IP"}
          />
        </section>

        <section
          id="fleet"
          className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"
        >
          <div className="space-y-6">
            <div className="surface-panel rounded-[2rem] p-5 sm:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1 pr-0 xl:pr-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Fleet Control
                  </p>
                  <h2 className="mt-2 max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-foreground xl:text-[2.15rem]">
                    Tìm nhanh và thao tác trực tiếp trên từng VM
                  </h2>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
                  <button
                    type="button"
                    onClick={() => void tryCopy(buildInventoryText(visibleVMs), "Đã copy snapshot fleet.")}
                    className="inline-flex items-center gap-2 rounded-[1rem] border border-border/70 bg-background/70 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                  >
                    <Copy className="h-4 w-4" />
                    Copy snapshot
                  </button>
                  <button
                    type="button"
                    onClick={() => void fetchFleet({ silent: true })}
                    className="inline-flex items-center gap-2 rounded-[1rem] border border-border/70 bg-background/70 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                    Làm mới
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                <div className="flex items-center gap-3 rounded-[1.3rem] border border-border/70 bg-background/70 px-4 py-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Tìm theo tên, IP, flavor, image..."
                    className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>

                <label className="inline-flex items-center gap-3 rounded-[1.3rem] border border-border/70 bg-background/70 px-4 py-3 text-sm font-medium text-foreground">
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

                <div className="inline-flex rounded-[1.2rem] border border-border/70 bg-background/70 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`rounded-[0.95rem] px-3 py-2 text-sm font-semibold transition ${
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
                    className={`rounded-[0.95rem] px-3 py-2 text-sm font-semibold transition ${
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
                    { key: "building" as const, label: "Provisioning", count: buildingCount },
                    {
                      key: "attention" as const,
                      label: "Cần chú ý",
                      count: attentionCount,
                    },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setFilter(item.key)}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        filter === item.key
                          ? "border-primary/35 bg-primary/10 text-primary"
                          : "border-border/70 bg-background/70 text-foreground hover:border-primary/25 hover:text-primary"
                      }`}
                    >
                      <span>{item.label}</span>
                      <span className="rounded-full bg-background/75 px-2 py-0.5 text-xs text-muted-foreground">
                        {item.count}
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setAutoRefresh((current) => !current)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    autoRefresh
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-border/70 bg-background/70 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <RefreshCw className={`h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`} />
                  {autoRefresh ? "Tự làm mới: bật" : "Tự làm mới: tắt"}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-[1.6rem] border border-rose-500/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-200 dark:text-rose-300">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <p>{error}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void fetchFleet()}
                    className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-200 transition hover:bg-rose-500/10"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Thử lại
                  </button>
                </div>
              </div>
            )}

            {loading ? (
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
              <div className="surface-panel rounded-[1.8rem] p-8 text-center">
                <h3 className="text-2xl font-semibold tracking-tight text-foreground">
                  Không có VM nào khớp bộ lọc hiện tại
                </h3>
                <p className="mt-3 text-sm text-muted-foreground">
                  Thử đổi filter, bỏ từ khoá tìm kiếm hoặc làm mới lại snapshot fleet.
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
                    onTerminal={(target) => setSshSession({ vm: target })}
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
                    onTerminal={(target) => setSshSession({ vm: target })}
                    onGitHub={openGitHub}
                  />
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-6">
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
                void tryCopy(buildInventoryText(visibleVMs), "Đã copy snapshot fleet.")
              }
            />

            <div
              id="launch"
              className="surface-panel rounded-[2rem] p-5 sm:p-6 xl:sticky xl:top-24"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Quick Kits
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    Preset triển khai nhanh
                  </h2>
                </div>
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-5 space-y-3">
                {serverPresets.map((preset) => (
                  <PresetCard
                    key={preset.key}
                    presetKey={preset.key}
                    onClick={openPreset}
                  />
                ))}
              </div>
            </div>

            <div id="focus" className="surface-panel rounded-[2rem] p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    VM Focus
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

                  <div className="mt-5 rounded-[1.5rem] border border-border/70 bg-background/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Hành động nhanh
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
                            onClick={() => setSshSession({ vm: selectedVm })}
                            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                          >
                            <Terminal className="h-3.5 w-3.5" />
                            Mở Web SSH
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => openGitHub(selectedVm.id)}
                        className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                      >
                        <GitBranch className="h-3.5 w-3.5" />
                        Deploy repo
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(selectedVm.name)}
                        disabled={deletingName === selectedVm.name}
                        className="inline-flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:border-rose-500/35 hover:bg-rose-500/15 disabled:opacity-50"
                      >
                        {deletingName === selectedVm.name ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Xoá VM
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-5 rounded-[1.6rem] border border-dashed border-border/70 bg-background/60 p-6 text-sm leading-6 text-muted-foreground">
                  Chọn một VM ở danh sách bên trái để xem chi tiết, copy SSH command
                  hoặc mở Web SSH ngay tại đây.
                </div>
              )}
            </div>
          </aside>
        </section>

        <footer
          id="footer"
          className="surface-panel surface-noise mt-8 rounded-[2rem] px-5 py-5 sm:px-6"
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,0.9fr)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Footer Console
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                Shell giao diện đã được làm lại theo kiểu control app
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                Navbar dùng cho điều hướng và action nhanh, header tập trung vào trạng
                thái hệ thống, footer gom các thông tin vận hành để nhìn phát là hiểu
                app đang chạy trên server nào, GitHub đang ở phiên nào và VM nào đang
                được focus.
              </p>
            </div>

            <div className="grid gap-3">
              <FooterStatus label="Fleet đang hiển thị" value={`${visibleVMs.length}/${total} VM`} />
              <FooterStatus label="GitHub session" value={githubUser ? `@${githubUser.login}` : "Chưa đồng bộ"} />
              <FooterStatus label="Auto refresh" value={autoRefresh ? "Đang bật mỗi 15 giây" : "Đang tắt"} />
            </div>

            <div className="grid gap-3">
              <FooterStatus label="VM focus" value={selectedVm?.name || "Chưa chọn VM"} />
              <FooterStatus label="SSH user mặc định" value={SSH_USER} />
              <FooterStatus label="Bước repo mới" value="Clone, env, install, post deploy" />
            </div>
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
            setSshSession({
              vm: {
                id: vmResult.vm_id,
                name: vmResult.vm_name,
                status: vmResult.status,
                ip: host,
                flavor: vmResult.flavor,
                image: vmResult.os,
              },
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

      {sshSession && (
        <WebSSHModal
          vmName={sshSession.vm.name}
          host={sshSession.vm.ip}
          initialCommand={sshSession.command}
          onClose={() => setSshSession(null)}
        />
      )}
    </div>
  );
}
