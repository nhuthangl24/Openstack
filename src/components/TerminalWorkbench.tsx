"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clipboard,
  Eraser,
  GitBranch,
  Play,
  Plug,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Upload,
  Waypoints,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import { toast } from "sonner";
import "@xterm/xterm/css/xterm.css";
import { copyToClipboard } from "@/lib/clipboard";
import {
  TERMINAL_WORKSPACE_EVENT,
  clearStoredSshSession,
  clearTerminalWorkspace,
  getDefaultSshSession,
  getDefaultWsUrl,
  persistStoredSshSession,
  readStoredSshSession,
  readTerminalWorkspace,
  type SessionSnapshot,
  type TerminalWorkspacePayload,
} from "@/lib/terminal-workspace";

interface VMOption {
  id: string;
  name: string;
  status: string;
  ip: string;
  flavor: string;
  image: string;
}

interface QuickCommand {
  key: string;
  label: string;
  command: string;
}

interface TerminalWorkbenchProps {
  vms: VMOption[];
  selectedVmId: string;
  refreshing: boolean;
  onSelectVm: (vmId: string) => void;
  onRefreshFleet: () => void;
  onOpenDeploy: (vmId?: string) => void;
}

const QUICK_COMMANDS: QuickCommand[] = [
  {
    key: "health",
    label: "Kiểm tra hệ thống",
    command: "whoami && hostname && uptime && df -h && free -h",
  },
  {
    key: "docker",
    label: "Kiểm tra Docker",
    command: "docker ps -a && echo '---' && docker compose ls && echo '---' && docker images | head -n 20",
  },
  {
    key: "network",
    label: "Kiểm tra mạng",
    command: "ip addr show && echo '---' && ip route && echo '---' && ss -tulpn | head -n 40",
  },
  {
    key: "logs",
    label: "Nhật ký gần đây",
    command: "journalctl -n 120 --no-pager",
  },
];

function readInitialWorkspace() {
  return readTerminalWorkspace();
}

function readInitialCredentialState() {
  const workspace = readInitialWorkspace();
  const target = workspace?.vmName || workspace?.host || "";
  const stored = target ? readStoredSshSession(target) : getDefaultSshSession();

  return {
    username: workspace?.username || stored.username,
    password: stored.password,
  } satisfies SessionSnapshot;
}

function terminalTheme(mode: string | undefined) {
  if (mode === "light") {
    return {
      background: "#081120",
      foreground: "#f8fafc",
      cursor: "#f8fafc",
      selectionBackground: "#1e3a5f",
    };
  }

  return {
    background: "#081120",
    foreground: "#e5eefc",
    cursor: "#f8fafc",
    selectionBackground: "#22324d",
  };
}

function extractTranscript(term: XTerm) {
  const buffer = term.buffer.active;
  const lines: string[] = [];

  for (let index = 0; index < buffer.length; index += 1) {
    const line = buffer.getLine(index)?.translateToString(true);

    if (line && line.trim()) {
      lines.push(line);
    }
  }

  return lines.join("\n");
}

function resolveCredentialTarget(selectedVm: VMOption | null, host: string) {
  return selectedVm?.name || host.trim();
}

function SectionLabel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function StatChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default function TerminalWorkbench({
  vms,
  selectedVmId,
  refreshing,
  onSelectVm,
  onRefreshFleet,
  onOpenDeploy,
}: TerminalWorkbenchProps) {
  const { resolvedTheme } = useTheme();
  const terminalShellRef = useRef<HTMLDivElement | null>(null);
  const terminalMountRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const runAfterConnectRef = useRef("");

  const selectedVm = useMemo(
    () => vms.find((vm) => vm.id === selectedVmId) ?? null,
    [selectedVmId, vms],
  );

  const [host, setHost] = useState(() => readInitialWorkspace()?.host || "");
  const [username, setUsername] = useState(
    () => readInitialCredentialState().username,
  );
  const [password, setPassword] = useState(
    () => readInitialCredentialState().password,
  );
  const [remember, setRemember] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [commandDraft, setCommandDraft] = useState("");
  const [pendingWorkflow, setPendingWorkflow] = useState(
    () => readInitialWorkspace()?.initialCommand || "",
  );
  const [workspacePayload, setWorkspacePayload] =
    useState<TerminalWorkspacePayload | null>(() => readInitialWorkspace());
  const [workflowArmed, setWorkflowArmed] = useState(false);

  const wsUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return process.env.NEXT_PUBLIC_SSH_WS_URL || getDefaultWsUrl();
  }, []);

  const resolvedHost = host || selectedVm?.ip || "";
  const credentialTarget = resolveCredentialTarget(selectedVm, resolvedHost);
  const activeReadyVm = vms.filter((vm) => vm.ip && vm.status === "ACTIVE");

  const syncTerminalViewport = useCallback(() => {
    if (!fitRef.current || !xtermRef.current) {
      return;
    }

    fitRef.current.fit();

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "resize",
          cols: xtermRef.current.cols,
          rows: xtermRef.current.rows,
        }),
      );
    }
  }, []);

  const scheduleViewportSync = useCallback(() => {
    window.requestAnimationFrame(() => syncTerminalViewport());
    window.setTimeout(() => syncTerminalViewport(), 120);
    window.setTimeout(() => syncTerminalViewport(), 360);
  }, [syncTerminalViewport]);

  useEffect(() => {
    function syncWorkspaceState() {
      const payload = readTerminalWorkspace();
      setWorkspacePayload(payload);

      if (payload?.vmId && payload.vmId !== selectedVmId) {
        onSelectVm(payload.vmId);
      }

      if (payload?.host) {
        setHost(payload.host);
      }

      if (typeof payload?.initialCommand === "string") {
        setPendingWorkflow(payload.initialCommand);
      }

      if (payload) {
        const target = payload.vmName || payload.host || "";
        const stored = target ? readStoredSshSession(target) : getDefaultSshSession();
        setUsername(payload.username || stored.username);
        setPassword(stored.password);
      }
    }

    window.addEventListener(TERMINAL_WORKSPACE_EVENT, syncWorkspaceState);
    return () =>
      window.removeEventListener(TERMINAL_WORKSPACE_EVENT, syncWorkspaceState);
  }, [onSelectVm, selectedVmId]);

  useEffect(() => {
    if (!terminalMountRef.current || xtermRef.current) {
      return;
    }

    const term = new XTerm({
      fontFamily: "var(--font-mono), Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.35,
      cursorBlink: true,
      scrollback: 5000,
      theme: terminalTheme(resolvedTheme),
    });
    const fitAddon = new FitAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(terminalMountRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitRef.current = fitAddon;

    term.writeln("\x1b[36mOrbitStack Terminal\x1b[0m");
    term.writeln("\x1b[90mChon VM, nhap credential va ket noi de bat dau.\x1b[0m");
    term.writeln("");

    scheduleViewportSync();

    term.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    return () => {
      wsRef.current?.close();
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, [resolvedTheme, scheduleViewportSync]);

  useEffect(() => {
    if (!xtermRef.current) {
      return;
    }

    xtermRef.current.options.theme = terminalTheme(resolvedTheme);
    scheduleViewportSync();
  }, [resolvedTheme, scheduleViewportSync]);

  useEffect(() => {
    function handleResize() {
      scheduleViewportSync();
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [scheduleViewportSync]);

  useEffect(() => {
    if (!terminalShellRef.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      scheduleViewportSync();
    });

    observer.observe(terminalShellRef.current);
    return () => observer.disconnect();
  }, [scheduleViewportSync]);

  useEffect(() => {
    if (!connected || !xtermRef.current) {
      return;
    }

    xtermRef.current.writeln(
      `\r\n\x1b[90m# Đã cập nhật đích: ${selectedVm?.name || resolvedHost || "nhập thủ công"}\x1b[0m`,
    );
    scheduleViewportSync();
  }, [connected, resolvedHost, scheduleViewportSync, selectedVm]);

  useEffect(() => {
    scheduleViewportSync();
  }, [pendingWorkflow, scheduleViewportSync]);

  function disconnectSocket() {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }

  function sendCommand(command: string) {
    if (!command.trim()) {
      toast.error("Chua co lenh nao de gui vao terminal.");
      return false;
    }

    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      toast.error("Hay ket noi SSH truoc khi gui lenh.");
      return false;
    }

    wsRef.current.send(command.endsWith("\n") ? command : `${command}\n`);
    return true;
  }

  function handleConnect() {
    setError("");

    if (!resolvedHost.trim()) {
      setError("Hay chon VM co IP hoac nhap host/IP truoc khi mo terminal.");
      return;
    }

    if (!wsUrl) {
      setError("Chua cau hinh SSH WebSocket URL.");
      return;
    }

    if (!username.trim() || !password.trim()) {
      setError("Hay nhap username va mat khau SSH.");
      return;
    }

    if (remember && credentialTarget) {
      persistStoredSshSession(credentialTarget, {
        username,
        password,
      } satisfies SessionSnapshot);
    }

    const term = xtermRef.current;

    if (!term) {
      setError("Terminal chua san sang.");
      return;
    }

    disconnectSocket();

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    term.writeln(`\r\n\x1b[90m# Dang ket noi ${username}@${resolvedHost}...\x1b[0m`);

    ws.onopen = () => {
      setConnected(true);

      ws.send(
        JSON.stringify({
          host: resolvedHost,
          username,
          password,
          cols: term.cols,
          rows: term.rows,
        }),
      );

      term.focus();
      scheduleViewportSync();

      if (runAfterConnectRef.current) {
        const commandToRun = runAfterConnectRef.current;
        runAfterConnectRef.current = "";

        window.setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(`${commandToRun}\n`);
            setWorkflowArmed(false);
            toast.success("Đã nạp script vào terminal.");
          }
        }, 400);
      }
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        term.write(event.data);
        return;
      }

      if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data));
        return;
      }

      if (event.data instanceof Blob) {
        void event.data
          .arrayBuffer()
          .then((buffer) => term.write(new Uint8Array(buffer)));
      }
    };

    ws.onerror = () => {
      setError("Ket noi SSH that bai.");
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
    };
  }

  async function handleCopyTranscript() {
    const term = xtermRef.current;

    if (!term) {
      toast.error("Terminal chua san sang.");
      return;
    }

    const transcript = extractTranscript(term);

    if (!transcript) {
      toast.error("Chua co transcript de sao chep.");
      return;
    }

    const copied = await copyToClipboard(transcript);

    if (!copied) {
      toast.error("Khong the sao chep transcript.");
      return;
    }

    toast.success("Da copy transcript terminal.");
  }

  function handleClearTerminal() {
    const term = xtermRef.current;

    if (!term) {
      return;
    }

    term.clear();
    term.writeln("\x1b[90m# Transcript da duoc lam sach o phia client.\x1b[0m");
  }

  function queueWorkflowForConnect() {
    if (!pendingWorkflow.trim()) {
      toast.error("Chua co workflow nao dang cho.");
      return;
    }

    runAfterConnectRef.current = pendingWorkflow;
    setWorkflowArmed(true);
    toast.success("Script sẽ tự chạy ở lần kết nối tiếp theo.");
  }

  const targetSummary = selectedVm
    ? `${selectedVm.name} • ${selectedVm.ip || "Chưa có IP"}`
    : resolvedHost || "Nhập thủ công";

  return (
    <section className="mt-6 space-y-4 pb-6">
      <div className="surface-panel rounded-[1.6rem] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/72 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <TerminalSquare className="h-3.5 w-3.5" />
              Terminal
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Làm việc với SSH gọn và dễ thao tác hơn.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              Trang này chỉ giữ lại phần cần thiết: kết nối SSH, màn hình lệnh,
              script triển khai và vùng soạn lệnh.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[28rem]">
            <StatChip label="Đích" value={targetSummary} />
            <StatChip
              label="Phiên"
              value={
                connected
                  ? "Đã kết nối"
                  : workflowArmed
                    ? "Chờ chạy sau khi kết nối"
                    : "Chưa kết nối"
              }
            />
            <StatChip
              label="VM sẵn sàng"
              value={`${activeReadyVm.length}/${vms.length} co IP`}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
        <aside className="space-y-4">
          <div className="surface-panel rounded-[1.5rem] p-5">
            <SectionLabel
              title="Kết nối"
              description="Chọn VM, nhập tài khoản rồi mở phiên SSH ngay trên trang này."
            />

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Máy đích
                </span>
                <select
                  value={selectedVmId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    onSelectVm(nextId);
                    const nextVm = vms.find((vm) => vm.id === nextId) ?? null;
                    setHost(nextVm?.ip || "");

                    const nextTarget = nextVm?.name || nextVm?.ip || "";
                    const stored = nextTarget
                      ? readStoredSshSession(nextTarget)
                      : getDefaultSshSession();
                    setUsername(stored.username);
                    setPassword(stored.password);
                  }}
                  className="mt-2 w-full rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/35"
                >
                  <option value="">Chọn VM để điền host</option>
                  {vms.map((vm) => (
                    <option key={vm.id} value={vm.id}>
                      {vm.name} {vm.ip ? `(${vm.ip})` : "(chua co IP)"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Host / IP
                </span>
                <input
                  value={resolvedHost}
                  onChange={(event) => setHost(event.target.value)}
                  placeholder="192.168.x.x hoac host SSH"
                  className="mt-2 w-full rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/35"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Username
                  </span>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="ubuntu"
                    className="mt-2 w-full rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/35"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Mật khẩu
                  </span>
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Nhập mật khẩu SSH"
                    type="password"
                    className="mt-2 w-full rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/35"
                  />
                </label>
              </div>

              <label className="flex items-center gap-3 rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="h-4 w-4 accent-current"
                />
                Ghi nhớ thông tin trong phiên trình duyệt hiện tại
              </label>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <button
                  type="button"
                  onClick={handleConnect}
                  className="inline-flex items-center justify-center gap-2 rounded-[1rem] bg-foreground px-4 py-3 text-sm font-semibold text-background transition hover:opacity-90"
                >
                  <PlugZap className="h-4 w-4" />
                  {connected ? "Kết nối lại" : "Mở phiên SSH"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    disconnectSocket();
                    toast.success("Da dong session SSH.");
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <Plug className="h-4 w-4" />
                  Ngắt phiên
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <button
                  type="button"
                  onClick={onRefreshFleet}
                  className="inline-flex items-center justify-center gap-2 rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Làm mới danh sách máy
                </button>

                <button
                  type="button"
                  onClick={() => onOpenDeploy(selectedVm?.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <GitBranch className="h-4 w-4" />
                  Mở cấu hình deploy
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-[1rem] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
                {error}
              </div>
            )}

            <div className="mt-4 rounded-[1rem] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  Thông tin chỉ được lưu trong trình duyệt nếu bạn bật ghi nhớ,
                  không được gửi lên máy chủ Next.js.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                clearStoredSshSession(credentialTarget);
                const defaults = getDefaultSshSession();
                setUsername(defaults.username);
                setPassword(defaults.password);
                toast.success("Da xoa credential da luu cho target nay.");
              }}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[1rem] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:border-rose-500/35 hover:bg-rose-500/15"
            >
              <Trash2 className="h-4 w-4" />
              Xóa thông tin đã lưu
            </button>
          </div>

          <div className="surface-panel rounded-[1.5rem] p-5">
            <SectionLabel
              title="Kịch bản"
              description="Script triển khai từ phần deploy sẽ hiện ở đây để bạn xem và chạy."
            />

            {pendingWorkflow ? (
              <div className="mt-5 rounded-[1rem] border border-border/70 bg-background/75 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Kịch bản đang chờ
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {workspacePayload?.vmName
                        ? `Nguon moi nhat: ${workspacePayload.vmName}`
                        : "Script này đến từ phần deploy bạn vừa cấu hình."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPendingWorkflow("");
                      setWorkflowArmed(false);
                      runAfterConnectRef.current = "";
                      clearTerminalWorkspace();
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground transition hover:border-primary/35 hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <pre className="mt-4 max-h-[16rem] overflow-auto whitespace-pre-wrap rounded-[1rem] border border-border/70 bg-[#081120] px-4 py-4 text-xs leading-6 text-slate-100">
                  <code>{pendingWorkflow}</code>
                </pre>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (sendCommand(pendingWorkflow)) {
                        setWorkflowArmed(false);
                        runAfterConnectRef.current = "";
                        toast.success("Da day workflow vao terminal.");
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90"
                  >
                    <Play className="h-4 w-4" />
                    Chạy ngay
                  </button>

                  <button
                    type="button"
                    onClick={queueWorkflowForConnect}
                    className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                  >
                    <Waypoints className="h-4 w-4" />
                    Chờ chạy khi kết nối
                  </button>

                  <button
                    type="button"
                    onClick={() => setCommandDraft(pendingWorkflow)}
                    className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                  >
                    <Upload className="h-4 w-4" />
                    Nạp vào ô soạn lệnh
                  </button>
                </div>

                {workflowArmed && (
                  <div className="mt-4 rounded-[1rem] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    Kịch bản đã được chờ sẵn. Lần kết nối SSH tiếp theo sẽ tự nhận script này.
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-5 rounded-[1rem] border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm leading-6 text-muted-foreground">
                Chưa có kịch bản nào đang chờ. Bạn có thể mở phần deploy repo để tạo
                script rồi đẩy sang trang terminal này.
              </div>
            )}
          </div>
        </aside>

        <div className="space-y-4">
          <div className="surface-panel overflow-hidden rounded-[1.6rem]">
            <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Màn hình lệnh
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {selectedVm?.name || resolvedHost || "Nhập thủ công"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resolvedHost
                    ? `Host ${resolvedHost}`
                    : "Chọn VM có IP hoặc nhập host thủ công để bắt đầu."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyTranscript}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <Clipboard className="h-4 w-4" />
                  Sao chép nội dung
                </button>
                <button
                  type="button"
                  onClick={handleClearTerminal}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <Eraser className="h-4 w-4" />
                  Xóa màn hình
                </button>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      connected
                        ? "bg-emerald-400"
                        : workflowArmed
                          ? "bg-amber-400"
                          : "bg-slate-400"
                    }`}
                  />
                  {connected
                    ? "Đã kết nối"
                    : workflowArmed
                      ? "Chờ chạy khi kết nối"
                      : "Chưa kết nối"}
                </div>
              </div>
            </div>

            <div className="bg-[#081120] p-3">
              <div
                ref={terminalShellRef}
                className="terminal-shell h-[clamp(28rem,64vh,50rem)] min-h-[460px] w-full overflow-hidden rounded-[1rem] border border-slate-800/90 bg-[#081120] p-4"
              >
                <div
                  ref={terminalMountRef}
                  className="h-full w-full overflow-hidden rounded-[0.75rem]"
                />
              </div>
            </div>
          </div>

          <div className="surface-panel rounded-[1.6rem] p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <SectionLabel
                title="Soạn lệnh"
                description="Viết lệnh, nạp script có sẵn hoặc dùng mẫu nhanh rồi gửi thẳng vào terminal."
              />

              <button
                type="button"
                onClick={() => {
                  if (sendCommand(commandDraft)) {
                    setCommandDraft("");
                  }
                }}
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90"
              >
                <Play className="h-4 w-4" />
                Gửi vào terminal
              </button>
            </div>

            <textarea
              value={commandDraft}
              onChange={(event) => setCommandDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();

                  if (sendCommand(commandDraft)) {
                    setCommandDraft("");
                  }
                }
              }}
              placeholder="Viết lệnh shell ở đây. Ctrl/Cmd + Enter để gửi ngay."
              className="mt-5 min-h-[9rem] w-full rounded-[1.2rem] border border-border/70 bg-background/75 px-4 py-4 text-sm leading-7 text-foreground outline-none transition focus:border-primary/35"
            />

            <div className="mt-5 flex flex-wrap gap-2">
              {QUICK_COMMANDS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setCommandDraft(item.command)}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
