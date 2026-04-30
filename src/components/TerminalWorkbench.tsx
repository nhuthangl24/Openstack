"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Clipboard,
  Command,
  Eraser,
  ExternalLink,
  GitBranch,
  Play,
  Plug,
  PlugZap,
  RefreshCw,
  Save,
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

interface SavedSnippet {
  id: string;
  title: string;
  command: string;
}

interface ActivityEntry {
  id: string;
  label: string;
  detail: string;
}

interface QuickCommand {
  key: string;
  label: string;
  description: string;
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

const STASH_KEY = "orbitstack:terminal-stash";

const QUICK_COMMANDS: QuickCommand[] = [
  {
    key: "health",
    label: "System health",
    description: "Nhanh để xem uptime, RAM, disk và user hiện tại.",
    command: "whoami && hostname && uptime && df -h && free -h",
  },
  {
    key: "docker",
    label: "Docker stack",
    description: "Kiểm tra container, compose và image đang có.",
    command: "docker ps -a && echo '---' && docker compose ls && echo '---' && docker images | head -n 20",
  },
  {
    key: "network",
    label: "Network check",
    description: "Xem IP, route và cổng đang lắng nghe.",
    command: "ip addr show && echo '---' && ip route && echo '---' && ss -tulpn | head -n 40",
  },
  {
    key: "logs",
    label: "Recent logs",
    description: "Lấy nhanh nhật ký hệ thống gần nhất.",
    command: "journalctl -n 120 --no-pager",
  },
  {
    key: "repos",
    label: "OrbitStack apps",
    description: "Liệt kê các repo đã được đồng bộ trên VM.",
    command: "cd ~/orbitstack-apps 2>/dev/null && pwd && find . -maxdepth 2 -type d -name .git || echo 'No orbitstack-apps workspace yet'",
  },
  {
    key: "python",
    label: "Python env",
    description: "Xem nhanh Python, pip và virtualenv nếu có.",
    command: "python3 --version && pip --version && ls -la .venv 2>/dev/null || echo '.venv not found'",
  },
];

function readSavedSnippets() {
  if (typeof window === "undefined") {
    return [] as SavedSnippet[];
  }

  const raw = window.localStorage.getItem(STASH_KEY);

  if (!raw) {
    return [] as SavedSnippet[];
  }

  try {
    return JSON.parse(raw) as SavedSnippet[];
  } catch {
    return [] as SavedSnippet[];
  }
}

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
      background: "#f8fafc",
      foreground: "#0f172a",
      cursor: "#2563eb",
      selectionBackground: "#cbd5e1",
    };
  }

  return {
    background: "#07111f",
    foreground: "#e5eefc",
    cursor: "#f8fafc",
    selectionBackground: "#22324d",
  };
}

function buildActivity(label: string, detail: string) {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label,
    detail,
  } satisfies ActivityEntry;
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
  const terminalRef = useRef<HTMLDivElement | null>(null);
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
  const [savedSnippets, setSavedSnippets] = useState<SavedSnippet[]>(() =>
    readSavedSnippets(),
  );
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);
  const [pendingWorkflow, setPendingWorkflow] = useState(
    () => readInitialWorkspace()?.initialCommand || "",
  );
  const [workspacePayload, setWorkspacePayload] = useState<TerminalWorkspacePayload | null>(
    () => readInitialWorkspace(),
  );
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STASH_KEY, JSON.stringify(savedSnippets));
  }, [savedSnippets]);

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
    if (!terminalRef.current || xtermRef.current) {
      return;
    }

    const term = new XTerm({
      fontFamily: "var(--font-mono), Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.3,
      cursorBlink: true,
      scrollback: 4000,
      theme: terminalTheme(resolvedTheme),
    });
    const fitAddon = new FitAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitRef.current = fitAddon;

    term.writeln("\x1b[36mOrbitStack Terminal Lab\x1b[0m");
    term.writeln("\x1b[90mChon VM, nhap credential va ket noi de bat dau.\x1b[0m");
    term.writeln("");

    window.requestAnimationFrame(() => syncTerminalViewport());
    window.setTimeout(() => syncTerminalViewport(), 160);
    window.setTimeout(() => syncTerminalViewport(), 420);

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
  }, [resolvedTheme, syncTerminalViewport]);

  useEffect(() => {
    if (!xtermRef.current) {
      return;
    }

    xtermRef.current.options.theme = terminalTheme(resolvedTheme);
    window.requestAnimationFrame(() => syncTerminalViewport());
  }, [resolvedTheme, syncTerminalViewport]);

  useEffect(() => {
    function handleResize() {
      syncTerminalViewport();
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [syncTerminalViewport]);

  useEffect(() => {
    if (!terminalRef.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(() => syncTerminalViewport());
    });

    observer.observe(terminalRef.current);
    return () => observer.disconnect();
  }, [syncTerminalViewport]);

  useEffect(() => {
    if (!connected || !xtermRef.current) {
      return;
    }

    xtermRef.current.writeln(
      `\r\n\x1b[90m# Target refreshed: ${selectedVm?.name || resolvedHost || "manual host"}\x1b[0m`,
    );
    window.requestAnimationFrame(() => syncTerminalViewport());
  }, [connected, resolvedHost, selectedVm, syncTerminalViewport]);

  useEffect(() => {
    window.requestAnimationFrame(() => syncTerminalViewport());
  }, [pendingWorkflow, commandDraft, syncTerminalViewport]);

  function addActivity(label: string, detail: string) {
    setActivityFeed((current) =>
      [buildActivity(label, detail), ...current].slice(0, 8),
    );
  }

  function disconnectSocket() {
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }

  function sendCommand(command: string, label: string) {
    if (!command.trim()) {
      toast.error("Chua co lenh nao de gui vao terminal.");
      return false;
    }

    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      toast.error("Hay ket noi SSH truoc khi gui lenh.");
      return false;
    }

    wsRef.current.send(command.endsWith("\n") ? command : `${command}\n`);
    addActivity(label, "Da day lenh vao terminal.");
    return true;
  }

  function handleConnect() {
    setError("");

    if (!resolvedHost.trim()) {
      setError("Hay chon VM co IP hoac nhap host/IP de mo Terminal Lab.");
      return;
    }

    if (!wsUrl) {
      setError("Chua cau hinh SSH WebSocket URL.");
      return;
    }

    if (!username.trim() || !password.trim()) {
      setError("Hay nhap username va mat khau truoc khi ket noi.");
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
      addActivity("Ket noi da mo", `${username}@${resolvedHost}`);

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
      window.setTimeout(() => fitRef.current?.fit(), 100);

      if (runAfterConnectRef.current) {
        const commandToRun = runAfterConnectRef.current;
        runAfterConnectRef.current = "";
        window.setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(`${commandToRun}\n`);
            addActivity("Workflow da chay", "Script cho repo pipeline da duoc thuc thi.");
            setWorkflowArmed(false);
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
      addActivity("Ket noi that bai", "WebSocket khong mo duoc session SSH.");
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
      addActivity("Session da dong", "Terminal da ngat ket noi.");
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
    addActivity("Da clear transcript", "Khung terminal da duoc don dep.");
  }

  function queueWorkflowForConnect() {
    if (!pendingWorkflow.trim()) {
      toast.error("Chua co workflow nao dang cho.");
      return;
    }

    runAfterConnectRef.current = pendingWorkflow;
    setWorkflowArmed(true);
    addActivity("Workflow dang armed", "Se tu chay sau khi SSH ket noi.");
    toast.success("Workflow se tu chay o lan ket noi tiep theo.");
  }

  function saveDraftAsSnippet() {
    const command = commandDraft.trim();

    if (!command) {
      toast.error("Hay nhap command truoc khi luu.");
      return;
    }

    const title = command.split("\n")[0].slice(0, 44) || "Snippet moi";
    setSavedSnippets((current) => [
      {
        id: `${Date.now()}`,
        title,
        command,
      },
      ...current,
    ]);
    addActivity("Da luu snippet", title);
    toast.success("Da luu command vao command stash.");
  }

  const targetSummary = selectedVm
    ? `${selectedVm.name} • ${selectedVm.ip || "No IP"}`
    : resolvedHost || "Manual target";

  return (
    <section className="mt-6 space-y-4 pb-4">
      <div className="surface-panel surface-noise overflow-hidden rounded-[1.8rem] p-5 sm:p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/72 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <TerminalSquare className="h-3.5 w-3.5" />
              Terminal Lab
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl xl:text-[3.4rem]">
              SSH da duoc tach thanh workspace rieng, khong con la modal cham chat nua.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              Chon VM, giu credential tren browser, dieu khien terminal, day workflow
              deploy, luu snippet va copy transcript ngay tren mot mat phang lam viec
              rieng.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[28rem]">
            <StatChip
              label="Target"
              value={targetSummary}
            />
            <StatChip
              label="Session"
              value={connected ? "Connected" : workflowArmed ? "Armed for connect" : "Idle"}
            />
            <StatChip
              label="Ready VM"
              value={`${activeReadyVm.length}/${vms.length} co IP`}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_340px] xl:items-start">
        <aside className="space-y-4">
          <div className="surface-panel rounded-[1.5rem] p-5">
            <SectionLabel
              title="Connection Dock"
              description="Giu host, credential va session theo tung VM de vao terminal nhanh hon."
            />

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  VM target
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
                  <option value="">Chon VM de bind host</option>
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
                    Password
                  </span>
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Nhap mat khau SSH"
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
                Ghi nho credential trong session browser hien tai
              </label>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <button
                  type="button"
                  onClick={handleConnect}
                  className="inline-flex items-center justify-center gap-2 rounded-[1rem] bg-foreground px-4 py-3 text-sm font-semibold text-background transition hover:opacity-90"
                >
                  <PlugZap className="h-4 w-4" />
                  {connected ? "Ket noi lai" : "Mo session SSH"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    disconnectSocket();
                    addActivity("Da ngat ket noi", "Session SSH da duoc dong thu cong.");
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <Plug className="h-4 w-4" />
                  Ngat session
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <button
                  type="button"
                  onClick={() => onOpenDeploy(selectedVm?.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <GitBranch className="h-4 w-4" />
                  Mo repo pipeline
                </button>

                <button
                  type="button"
                  onClick={onRefreshFleet}
                  className="inline-flex items-center justify-center gap-2 rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  Lam moi fleet
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
                  Credential chi duoc luu o session browser neu ban bat ghi nho, khong
                  duoc dua vao Next.js server.
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
              Xoa credential da luu
            </button>
          </div>

          <div className="surface-panel rounded-[1.5rem] p-5">
            <SectionLabel
              title="Command Stash"
              description="Luu nhanh nhung lenh hay dung de bat lai sau."
            />

            <div className="mt-5 space-y-3">
              {savedSnippets.length === 0 ? (
                <div className="rounded-[1rem] border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm leading-6 text-muted-foreground">
                  Chua co snippet nao. Ban co the viet lenh o command composer roi luu lai.
                </div>
              ) : (
                savedSnippets.map((snippet) => (
                  <div
                    key={snippet.id}
                    className="rounded-[1rem] border border-border/70 bg-background/75 p-4"
                  >
                    <p className="text-sm font-semibold text-foreground">{snippet.title}</p>
                    <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                      <code>{snippet.command}</code>
                    </pre>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setCommandDraft(snippet.command)}
                        className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Nap vao composer
                      </button>
                      <button
                        type="button"
                        onClick={() => void sendCommand(snippet.command, snippet.title)}
                        className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Chay
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setSavedSnippets((current) =>
                            current.filter((item) => item.id !== snippet.id),
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:border-rose-500/35 hover:bg-rose-500/15"
                      >
                        <X className="h-3.5 w-3.5" />
                        Bo
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="surface-panel overflow-hidden rounded-[1.6rem]">
            <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Live Terminal
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {selectedVm?.name || resolvedHost || "Manual target"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {resolvedHost
                    ? `Host ${resolvedHost}`
                    : "Chon VM co IP hoac nhap host thu cong de bat dau."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyTranscript}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <Clipboard className="h-4 w-4" />
                  Copy transcript
                </button>
                <button
                  type="button"
                  onClick={handleClearTerminal}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <Eraser className="h-4 w-4" />
                  Clear view
                </button>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      connected ? "bg-emerald-400" : workflowArmed ? "bg-amber-400" : "bg-slate-400"
                    }`}
                  />
                  {connected ? "Connected" : workflowArmed ? "Armed on connect" : "Disconnected"}
                </div>
              </div>
            </div>

            <div className="bg-[#07111f] p-3">
              <div
                ref={terminalRef}
                className="terminal-shell h-[clamp(24rem,58vh,44rem)] min-h-[420px] w-full overflow-hidden rounded-[1rem] border border-slate-800/90 bg-[#07111f]"
              />
            </div>
          </div>

          <div className="surface-panel rounded-[1.6rem] p-5 sm:p-6 xl:pb-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <SectionLabel
                title="Command Composer"
                description="Viet lenh thu cong, nap snippet, hoac nhan nhanh mot quick action roi day vao terminal."
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (sendCommand(commandDraft, "Composer command")) {
                      setCommandDraft("");
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90"
                >
                  <Play className="h-4 w-4" />
                  Gui vao terminal
                </button>
                <button
                  type="button"
                  onClick={saveDraftAsSnippet}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <Save className="h-4 w-4" />
                  Luu snippet
                </button>
              </div>
            </div>

            <textarea
              value={commandDraft}
              onChange={(event) => setCommandDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();

                  if (sendCommand(commandDraft, "Composer command")) {
                    setCommandDraft("");
                  }
                }
              }}
              placeholder="Viet script hoac lenh shell tai day. Ctrl/Cmd + Enter de gui ngay."
              className="mt-5 min-h-[10rem] w-full rounded-[1.2rem] border border-border/70 bg-background/75 px-4 py-4 text-sm leading-7 text-foreground outline-none transition focus:border-primary/35"
            />

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {QUICK_COMMANDS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setCommandDraft(item.command)}
                  className="rounded-[1.1rem] border border-border/70 bg-background/75 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/35"
                >
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    Nap vao composer
                    <Upload className="h-3.5 w-3.5" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="surface-panel rounded-[1.5rem] p-5">
            <SectionLabel
              title="Workflow Dock"
              description="Nhan script tu repo pipeline, review lai, roi tu quyet dinh khi nao cho chay."
            />

            {pendingWorkflow ? (
              <>
                <div className="mt-5 rounded-[1rem] border border-border/70 bg-background/75 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Workflow dang cho
                      </p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {workspacePayload?.vmName
                          ? `Nguon moi nhat: ${workspacePayload.vmName}`
                          : "Script nay den tu repo pipeline vua cau hinh."}
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

                  <pre className="mt-4 max-h-[18rem] overflow-auto whitespace-pre-wrap rounded-[1rem] border border-border/70 bg-[#07111f] px-4 py-4 text-xs leading-6 text-slate-100">
                    <code>{pendingWorkflow}</code>
                  </pre>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (sendCommand(pendingWorkflow, "Deploy workflow")) {
                          setWorkflowArmed(false);
                          runAfterConnectRef.current = "";
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90"
                    >
                      <Play className="h-4 w-4" />
                      Chay ngay
                    </button>
                    <button
                      type="button"
                      onClick={queueWorkflowForConnect}
                      className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                    >
                      <Waypoints className="h-4 w-4" />
                      Arm on connect
                    </button>
                    <button
                      type="button"
                      onClick={() => setCommandDraft(pendingWorkflow)}
                      className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                    >
                      <Upload className="h-4 w-4" />
                      Nap vao composer
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyToClipboard(pendingWorkflow);

                        if (!ok) {
                          toast.error("Khong the sao chep workflow.");
                          return;
                        }

                        toast.success("Da copy workflow deploy.");
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/75 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                    >
                      <Clipboard className="h-4 w-4" />
                      Copy script
                    </button>
                  </div>
                </div>

                {workflowArmed && (
                  <div className="mt-4 rounded-[1rem] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    Workflow da duoc arm. Ngay khi session SSH mo, script se duoc day vao terminal.
                  </div>
                )}
              </>
            ) : (
              <div className="mt-5 rounded-[1rem] border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm leading-6 text-muted-foreground">
                Chua co workflow nao dang cho. Ban co the mo repo pipeline tu day de tao
                script deploy moi, hoac dung Terminal Lab nhu mot SSH workspace thuan.
              </div>
            )}
          </div>

          <div className="surface-panel rounded-[1.5rem] p-5">
            <SectionLabel
              title="Web Controls"
              description="Mot vai nut thao tac them de terminal page thuc su la mot workspace."
            />

            <div className="mt-5 grid gap-3">
              <button
                type="button"
                onClick={() => onOpenDeploy(selectedVm?.id)}
                className="inline-flex items-center justify-between rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3.5 text-left text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
              >
                <span className="inline-flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Tao repo workflow moi
                </span>
                <ExternalLink className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setCommandDraft(QUICK_COMMANDS[0].command)}
                className="inline-flex items-center justify-between rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3.5 text-left text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
              >
                <span className="inline-flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Nap runbook system health
                </span>
                <Upload className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setPendingWorkflow("");
                  clearTerminalWorkspace();
                  toast.success("Da clear workflow dang cho.");
                }}
                className="inline-flex items-center justify-between rounded-[1rem] border border-border/70 bg-background/75 px-4 py-3.5 text-left text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
              >
                <span className="inline-flex items-center gap-2">
                  <Command className="h-4 w-4" />
                  Reset workflow dock
                </span>
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <StatChip
                label="SSH user"
                value={username || "ubuntu"}
              />
              <StatChip
                label="Focus VM"
                value={selectedVm?.name || "Manual host"}
              />
              <StatChip
                label="Flavor"
                value={selectedVm?.flavor || "N/A"}
              />
              <StatChip
                label="Image"
                value={selectedVm?.image || "N/A"}
              />
            </div>
          </div>

          <div className="surface-panel rounded-[1.5rem] p-5">
            <SectionLabel
              title="Activity Feed"
              description="Theo doi mot vai su kien chinh cua workspace ma khong can mo console browser."
            />

            <div className="mt-5 space-y-3">
              {activityFeed.length === 0 ? (
                <div className="rounded-[1rem] border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm leading-6 text-muted-foreground">
                  Chua co su kien nao. Sau khi ket noi, gui lenh hoac arm workflow thi feed se bat dau chay.
                </div>
              ) : (
                activityFeed.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[1rem] border border-border/70 bg-background/75 px-4 py-4"
                  >
                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
