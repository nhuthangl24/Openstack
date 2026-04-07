"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal, X, Plug, PlugZap, ShieldCheck, Copy } from "lucide-react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTerm } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

interface WebSSHModalProps {
  vmName: string;
  host: string;
  onClose: () => void;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }

  return copied;
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

export default function WebSSHModal({ vmName, host, onClose }: WebSSHModalProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  const [username, setUsername] = useState("ubuntu");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [copyMsg, setCopyMsg] = useState("");

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
        JSON.stringify({ username, password })
      );
    }

    const term = new XTerm({
      fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      fontSize: 13,
      theme: {
        background: "#0a0b0d",
        foreground: "#d2d6db",
        cursor: "#7dd3fc",
        selectionBackground: "#1f2937",
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
    }

    xtermRef.current = term;
    fitRef.current = fitAddon;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(
        JSON.stringify({
          host,
          username,
          password,
          cols: term.cols,
          rows: term.rows,
        })
      );
      term.focus();
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

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    setCopyMsg(ok ? "Copied" : "Copy failed");
    setTimeout(() => setCopyMsg(""), 1200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(3,4,6,0.85)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-5xl">
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-cyan-500/30 via-sky-500/10 to-emerald-500/20 blur-sm" />

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d10] shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <Terminal className="w-5 h-5 text-cyan-300" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Web SSH</h3>
                <p className="text-xs text-gray-500">{vmName} · {host || "Chưa có IP"}</p>
              </div>
            </div>
            <button
              onClick={() => { handleDisconnect(); onClose(); }}
              className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr]">
            <div className="p-5 border-b lg:border-b-0 lg:border-r border-white/10">
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400">Username</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                    placeholder="ubuntu"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Password</label>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
                    placeholder="••••••••"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="accent-cyan-400"
                  />
                  Lưu tạm trong session của trình duyệt
                </label>

                <div className="flex gap-2">
                  {!connected ? (
                    <button
                      onClick={handleConnect}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400/90 hover:bg-cyan-300 text-black text-sm font-semibold px-3 py-2"
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

                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                    Lưu mật khẩu chỉ trong session, không gửi lên server Next.js.
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-xs text-gray-500 mb-2">Quick deploy snippets</p>
                  <div className="space-y-2">
                    {[
                      "sudo apt-get update -y",
                      "git clone <repo> && cd <repo>",
                      "npm install && npm run build",
                      "pm2 start npm --name app -- start",
                    ].map((cmd) => (
                      <div key={cmd} className="flex items-center justify-between gap-2 rounded-lg bg-black/40 border border-white/10 px-2.5 py-1.5">
                        <code className="text-[11px] text-cyan-200 font-mono truncate">{cmd}</code>
                        <button
                          onClick={() => handleCopy(cmd)}
                          className="p-1 rounded text-gray-400 hover:text-white hover:bg-white/10"
                          title="Copy"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {copyMsg && <div className="text-[11px] text-gray-500">{copyMsg}</div>}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4">
              <div className="rounded-xl border border-white/10 bg-black/50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 text-xs text-gray-500">
                  <span>Terminal</span>
                  <span>{connected ? "Connected" : "Disconnected"}</span>
                </div>
                <div ref={terminalRef} className="h-[420px]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
