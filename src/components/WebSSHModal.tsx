"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal, X, Plug, PlugZap, ShieldCheck } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

interface WebSSHModalProps {
  vmName: string;
  host: string;
  initialCommand?: string;
  onClose: () => void;
}

function getSessionKey(vmName: string) {
  return `ssh-session:${vmName}`;
}

function getDefaultWsUrl() {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  const isSecure = window.location.protocol === "https:";
  return `${isSecure ? "wss" : "ws"}://${host}:3001`;
}

export default function WebSSHModal({
  vmName,
  host,
  initialCommand,
  onClose,
}: WebSSHModalProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const commandSentRef = useRef(false);

  const [username, setUsername] = useState("ubuntu");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  const wsUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return process.env.NEXT_PUBLIC_SSH_WS_URL || getDefaultWsUrl();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(getSessionKey(vmName));
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data?.username) setUsername(String(data.username));
      if (data?.password) setPassword(String(data.password));
    } catch {
      /* ignore */
    }
  }, [vmName]);

  useEffect(() => {
    const onResize = () => {
      if (!fitRef.current || !xtermRef.current) return;
      fitRef.current.fit();
      const cols = xtermRef.current.cols;
      const rows = xtermRef.current.rows;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const cleanUp = () => {
    wsRef.current?.close();
    wsRef.current = null;
    xtermRef.current?.dispose();
    xtermRef.current = null;
    fitRef.current = null;
  };

  useEffect(() => {
    return () => {
      cleanUp();
    };
  }, []);

  const handleConnect = () => {
    setError("");

    if (!host) {
      setError("VM chưa có IP.");
      return;
    }

    if (!wsUrl) {
      setError("Chưa cấu hình SSH WebSocket URL.");
      return;
    }

    if (!username || !password) {
      setError("Thiếu username hoặc mật khẩu.");
      return;
    }

    if (remember && typeof window !== "undefined") {
      sessionStorage.setItem(
        getSessionKey(vmName),
        JSON.stringify({ username, password }),
      );
    }

    const term = new XTerm({
      fontFamily:
        "Consolas, Menlo, Monaco, 'Courier New', monospace",
      fontSize: 15,
      lineHeight: 1.25,
      theme: {
        background: "#0b0f14",
        foreground: "#e6e9ee",
        cursor: "#ffffff",
        selectionBackground: "#222a34",
      },
      cursorBlink: true,
      scrollback: 2000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    if (terminalRef.current) {
      terminalRef.current.innerHTML = "";
      term.open(terminalRef.current);
      fitAddon.fit();
      setTimeout(() => fitAddon.fit(), 80);
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
      setTimeout(() => fitAddon.fit(), 80);

      if (initialCommand && !commandSentRef.current) {
        commandSentRef.current = true;
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(`${initialCommand}\n`);
          }
        }, 500);
      }
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        term.write(ev.data);
      } else if (ev.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(ev.data));
      } else if (ev.data instanceof Blob) {
        ev.data.arrayBuffer().then((buf) => term.write(new Uint8Array(buf)));
      }
    };

    ws.onerror = () => {
      setError("Kết nối thất bại.");
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
  };

  const handleDisconnect = () => {
    cleanUp();
    setConnected(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: "rgba(3,4,6,0.85)",
        backdropFilter: "blur(8px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-[96vw] max-w-5xl">
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-white/5 via-white/0 to-white/5 blur-sm" />

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#101216] shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Terminal className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Web SSH</h3>
                <p className="text-xs text-gray-500">
                  {vmName} · {host || "Chưa có IP"}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                handleDisconnect();
                onClose();
              }}
              className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] min-w-0">
            <div className="p-4 border-b lg:border-b-0 lg:border-r border-white/10 bg-black/20">
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400">Username</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
                    placeholder="ubuntu"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Password</label>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-white/30 focus:outline-none"
                    placeholder="••••••••"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="accent-white"
                  />
                  Lưu tạm trong session của trình duyệt
                </label>

                <div className="flex gap-2">
                  {!connected ? (
                    <button
                      onClick={handleConnect}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-white text-black text-sm font-semibold px-3 py-2 hover:bg-gray-100"
                    >
                      <PlugZap className="w-4 h-4" /> Connect
                    </button>
                  ) : (
                    <button
                      onClick={handleDisconnect}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-semibold px-3 py-2"
                    >
                      <Plug className="w-4 h-4" /> Disconnect
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        sessionStorage.removeItem(getSessionKey(vmName));
                      }
                      setPassword("");
                    }}
                    className="px-3 py-2 rounded-lg border border-white/10 text-xs text-gray-400 hover:text-white hover:border-white/20"
                  >
                    Forget
                  </button>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                    {error}
                  </div>
                )}

                <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                    Lưu mật khẩu chỉ trong session, không gửi lên server Next.js.
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 min-w-0">
              <div className="rounded-xl border border-white/10 bg-[#0b0f14] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 text-xs text-gray-500">
                  <span>Terminal</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
                    {connected ? "Connected" : "Disconnected"}
                  </span>
                </div>
                <div ref={terminalRef} className="h-[520px] w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
