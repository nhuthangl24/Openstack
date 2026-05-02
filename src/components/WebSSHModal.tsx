"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plug, PlugZap, ShieldCheck, Terminal, Trash2, X } from "lucide-react";
import { useTheme } from "next-themes";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { resolveSshWsUrl } from "@/lib/terminal-workspace";

interface WebSSHModalProps {
  vmName: string;
  host: string;
  initialCommand?: string;
  onClose: () => void;
}

interface SessionSnapshot {
  username: string;
  password: string;
}

function getSessionKey(vmName: string) {
  return `ssh-session:${vmName}`;
}

function readStoredSession(vmName: string): SessionSnapshot {
  if (typeof window === "undefined") {
    return { username: "ubuntu", password: "" };
  }

  const raw = sessionStorage.getItem(getSessionKey(vmName));

  if (!raw) {
    return { username: "ubuntu", password: "" };
  }

  try {
    const data = JSON.parse(raw) as Partial<SessionSnapshot>;
    return {
      username: data.username || "ubuntu",
      password: data.password || "",
    };
  } catch {
    return { username: "ubuntu", password: "" };
  }
}

export default function WebSSHModal({
  vmName,
  host,
  initialCommand,
  onClose,
}: WebSSHModalProps) {
  const { resolvedTheme } = useTheme();
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const commandSentRef = useRef(false);
  const [sessionDefaults] = useState<SessionSnapshot>(() => readStoredSession(vmName));

  const [username, setUsername] = useState(sessionDefaults.username);
  const [password, setPassword] = useState(sessionDefaults.password);
  const [remember, setRemember] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  const wsUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return resolveSshWsUrl();
  }, []);

  useEffect(() => {
    function handleResize() {
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
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  function cleanUp() {
    wsRef.current?.close();
    wsRef.current = null;
    xtermRef.current?.dispose();
    xtermRef.current = null;
    fitRef.current = null;
  }

  useEffect(() => {
    return () => cleanUp();
  }, []);

  function terminalTheme() {
    if (resolvedTheme === "light") {
      return {
        background: "#f8fafc",
        foreground: "#0f172a",
        cursor: "#2563eb",
        selectionBackground: "#cbd5e1",
      };
    }

    return {
      background: "#090f1c",
      foreground: "#e5eefc",
      cursor: "#f8fafc",
      selectionBackground: "#22324d",
    };
  }

  function handleConnect() {
    setError("");

    if (!host) {
      setError("VM chưa có IP nên chưa thể mở SSH.");
      return;
    }

    if (!wsUrl) {
      setError("Chưa cấu hình SSH WebSocket URL.");
      return;
    }

    if (!username || !password) {
      setError("Hãy nhập username và mật khẩu để kết nối.");
      return;
    }

    if (remember && typeof window !== "undefined") {
      sessionStorage.setItem(
        getSessionKey(vmName),
        JSON.stringify({ username, password }),
      );
    }

    const term = new XTerm({
      fontFamily: "var(--font-mono), Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 2500,
      theme: terminalTheme(),
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    if (terminalRef.current) {
      terminalRef.current.innerHTML = "";
      term.open(terminalRef.current);
      fitAddon.fit();
      window.setTimeout(() => fitAddon.fit(), 100);
    }

    xtermRef.current = term;
    fitRef.current = fitAddon;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    commandSentRef.current = false;

    ws.onopen = () => {
      setConnected(true);
      ws.send(
        JSON.stringify({
          host,
          username,
          password,
          cols: term.cols,
          rows: term.rows,
        }),
      );

      term.focus();
      window.setTimeout(() => fitAddon.fit(), 100);

      if (initialCommand && !commandSentRef.current) {
        commandSentRef.current = true;
        window.setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(`${initialCommand}\n`);
          }
        }, 500);
      }
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        term.write(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data));
      } else if (event.data instanceof Blob) {
        void event.data
          .arrayBuffer()
          .then((buffer) => term.write(new Uint8Array(buffer)));
      }
    };

    ws.onerror = () => {
      setError("Kết nối SSH thất bại.");
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  function handleDisconnect() {
    cleanUp();
    setConnected(false);
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
      <div className="surface-panel relative w-full max-w-6xl overflow-hidden rounded-[2rem]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="flex items-center justify-between border-b border-border/70 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-foreground text-background shadow-[0_16px_40px_-24px_rgba(15,23,42,0.7)]">
              <Terminal className="h-5 w-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Terminal
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                Web SSH cho {vmName}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Host: {host || "Chưa có IP"} • Session chỉ lưu ở browser hiện tại nếu
                bạn bật ghi nhớ.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              handleDisconnect();
              onClose();
            }}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-4 border-b border-border/70 bg-background/45 px-5 py-5 lg:border-b-0 lg:border-r lg:px-6">
            <Field
              label="Tài khoản"
              value={username}
              onChange={setUsername}
              placeholder="ubuntu"
            />
            <Field
              label="Mật khẩu"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              type="password"
            />

            <label className="flex items-center gap-3 rounded-[1.2rem] border border-border/70 bg-card px-4 py-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
                className="h-4 w-4 accent-current"
              />
              Ghi nhớ session trong browser này
            </label>

            <div className="flex flex-col gap-3">
              {!connected ? (
                <button
                  type="button"
                  onClick={handleConnect}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90"
                >
                  <PlugZap className="h-4 w-4" />
                  Kết nối SSH
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border/70 bg-card px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  <Plug className="h-4 w-4" />
                  Ngắt kết nối
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    sessionStorage.removeItem(getSessionKey(vmName));
                  }
                  setPassword("");
                }}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm font-semibold text-rose-300 transition hover:border-rose-500/35 hover:bg-rose-500/15"
              >
                <Trash2 className="h-4 w-4" />
                Xóa thông tin đã lưu
              </button>
            </div>

            {error && (
              <div className="rounded-[1.3rem] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 dark:text-rose-300">
                {error}
              </div>
            )}

            <div className="rounded-[1.3rem] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 dark:text-emerald-300">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  Mật khẩu được giữ trong session browser nếu bạn bật ghi nhớ, không
                  được lưu vào server Next.js.
                </p>
              </div>
            </div>
          </aside>

          <section className="px-5 py-5 sm:px-6">
            <div className="rounded-[1.8rem] border border-border/70 bg-card p-3">
              <div className="flex items-center justify-between border-b border-border/70 px-2 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <span>Màn hình lệnh</span>
                <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      connected ? "bg-emerald-400" : "bg-rose-400"
                    }`}
                  />
                  {connected ? "Đã kết nối" : "Chưa kết nối"}
                </span>
              </div>

              {initialCommand && (
                <div className="mt-3 rounded-[1.1rem] border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground">
                    Workflow sẽ chạy sau khi kết nối:
                  </p>
                  <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-[0.9rem] border border-border/70 bg-slate-950 px-3 py-3 text-xs leading-6 text-slate-100">
                    <code>{initialCommand}</code>
                  </pre>
                </div>
              )}

              <div
                ref={terminalRef}
                className="mt-3 h-[56vh] min-h-[420px] w-full overflow-hidden rounded-[1.3rem] border border-border/70"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: "text" | "password";
}) {
  return (
    <div className="rounded-[1.2rem] border border-border/70 bg-card px-4 py-3">
      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        placeholder={placeholder}
        className="mt-2 h-10 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  );
}
