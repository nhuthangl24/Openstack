"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2,
  Copy,
  Check,
  X,
  Terminal,
  Wifi,
  KeyRound,
  Server,
  Cpu,
  Monitor,
  Loader2,
  Package,
  ExternalLink,
} from "lucide-react";

interface VMInfo {
  vm_name: string;
  vm_id: string;
  status: string;
  flavor: string;
  os: string;
  password: string;
  environments: string[];
}

interface VMSuccessModalProps {
  info: VMInfo;
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all duration-200"
      title="Copy"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

export default function VMSuccessModal({ info, onClose }: VMSuccessModalProps) {
  const [ip, setIp] = useState<string>("");
  const [ipStatus, setIpStatus] = useState<"polling" | "found" | "timeout">("polling");
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 30; // 30 × 5s = 2.5 phút

  const pollIP = useCallback(async () => {
    if (ipStatus === "found" || ipStatus === "timeout") return;
    try {
      const res = await fetch(`/api/vm-ip?name=${encodeURIComponent(info.vm_name)}`);
      const data = await res.json();
      if (data.ip) {
        setIp(data.ip);
        setIpStatus("found");
      }
    } catch {
      /* ignore */
    }
  }, [info.vm_name, ipStatus]);

  useEffect(() => {
    // Poll ngay lần đầu
    pollIP();
    const interval = setInterval(() => {
      setAttempts((prev) => {
        const next = prev + 1;
        if (next >= MAX_ATTEMPTS) {
          setIpStatus("timeout");
          clearInterval(interval);
        }
        return next;
      });
      pollIP();
    }, 5000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const sshCmd = `ssh ubuntu@${ip || "<IP>"}`;
  const envList = info.environments.length > 0 ? info.environments.join(", ") : "Không có";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in-0 duration-300"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-lg animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        {/* Glow effect */}
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-green-500/40 via-emerald-400/20 to-cyan-500/30 blur-sm" />

        <div className="relative rounded-2xl bg-[#0d1117] border border-white/10 overflow-hidden shadow-2xl">
          {/* Top bar */}
          <div className="h-1 bg-gradient-to-r from-green-400 via-emerald-400 to-cyan-400" />

          {/* Header */}
          <div className="flex items-start justify-between p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Tạo máy ảo thành công!</h2>
                <p className="text-xs text-gray-400">Cloud-init đang cài đặt trong nền</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 pb-6 space-y-3">
            {/* IP — most prominent */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Wifi className="w-3.5 h-3.5" />
                  <span>Địa chỉ IP</span>
                </div>
                {ip && <CopyButton text={ip} />}
              </div>
              {ipStatus === "found" ? (
                <p className="text-2xl font-mono font-bold text-cyan-400">{ip}</p>
              ) : ipStatus === "timeout" ? (
                <p className="text-sm text-gray-500 italic">Chưa lấy được IP — thử lại sau</p>
              ) : (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span className="text-sm text-gray-400">Đang chờ IP...</span>
                  <span className="text-xs text-gray-600">({attempts}/{MAX_ATTEMPTS})</span>
                </div>
              )}
            </div>

            {/* SSH Command */}
            <div className="rounded-xl bg-black/40 border border-white/10 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>SSH Command</span>
                </div>
                <CopyButton text={sshCmd} />
              </div>
              <code className="text-sm font-mono text-green-400">{sshCmd}</code>
            </div>

            {/* Password */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Mật khẩu SSH (ubuntu &amp; root)</span>
                </div>
                <CopyButton text={info.password} />
              </div>
              <code className="text-sm font-mono text-yellow-300">{info.password}</code>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                  <Server className="w-3 h-3" />
                  <span>VM Name</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-mono text-white truncate">{info.vm_name}</p>
                  <CopyButton text={info.vm_name} />
                </div>
              </div>

              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                  <Cpu className="w-3 h-3" />
                  <span>Flavor</span>
                </div>
                <p className="text-sm font-mono text-white">{info.flavor}</p>
              </div>

              <div className="rounded-xl bg-white/5 border border-white/10 p-3 col-span-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                  <Monitor className="w-3 h-3" />
                  <span>OS</span>
                </div>
                <p className="text-sm font-mono text-white">🐧 {info.os}</p>
              </div>
            </div>

            {/* ID */}
            <div className="rounded-xl bg-black/30 border border-white/8 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Instance ID</p>
                  <code className="text-xs font-mono text-gray-400">{info.vm_id}</code>
                </div>
                <CopyButton text={info.vm_id || ""} />
              </div>
            </div>

            {/* Environments */}
            {info.environments.length > 0 && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
                  <Package className="w-3 h-3" />
                  <span>Môi trường cài đặt</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {info.environments.map((env) => (
                    <span
                      key={env}
                      className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-400"
                    >
                      {env}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Note */}
            <div className="flex items-start gap-2 pt-1">
              <ExternalLink className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-500 leading-relaxed">
                Cloud-init đang chạy trong nền. Thử SSH sau ~60 giây khi cloud-init hoàn tất.
                {ipStatus === "polling" && " IP sẽ tự động cập nhật."}
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              className="w-full mt-2 py-2.5 rounded-xl text-sm font-medium
                bg-white/8 hover:bg-white/12 border border-white/10
                text-gray-300 hover:text-white transition-all duration-200"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
