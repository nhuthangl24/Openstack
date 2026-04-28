"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ExternalLink,
  GitBranch,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export default function GitHubAccessGate({
  children,
}: {
  children: ReactNode;
}) {
  const [checking, setChecking] = useState(true);
  const [connected, setConnected] = useState(false);
  const [device, setDevice] = useState<DeviceCodeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const pollRef = useRef<number | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/github/status", {
        credentials: "include",
        cache: "no-store",
      });

      if (response.ok) {
        setConnected(true);
        setError("");
        return true;
      }

      setConnected(false);
      return false;
    } catch {
      setConnected(false);
      setError("Không kiểm tra được trạng thái GitHub lúc này.");
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function startDeviceFlow() {
    setLoading(true);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/github/device/start", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không khởi động được đăng nhập GitHub.");
      }

      setDevice(data);
      setStatus("Mở GitHub, nhập mã xác thực và đợi hệ thống tự mở khóa dashboard.");
      startPolling(data.device_code, data.interval || 5);
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Không bắt đầu được đăng nhập GitHub.",
      );
    } finally {
      setLoading(false);
    }
  }

  function startPolling(deviceCode: string, intervalSec: number) {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch("/api/github/device/poll", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_code: deviceCode }),
        });
        const data = await response.json();

        if (data.status === "authorized") {
          stopPolling();
          setStatus("Đăng nhập thành công. Đang mở dashboard...");
          await fetchStatus();
          return;
        }

        if (data.status === "denied") {
          stopPolling();
          setError("GitHub đã từ chối xác thực.");
          return;
        }

        if (data.status === "expired") {
          stopPolling();
          setError("Mã xác thực đã hết hạn. Hãy đăng nhập lại.");
          return;
        }

        if (data.status === "slow_down" || data.status === "pending") {
          setStatus("Đang chờ GitHub xác nhận...");
        }
      } catch {
        stopPolling();
        setError("Không thể hoàn tất đăng nhập GitHub.");
      }
    }, Math.max(intervalSec, 5) * 1000);
  }

  useEffect(() => {
    void fetchStatus();
    return () => stopPolling();
  }, [fetchStatus]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="surface-panel flex items-center gap-3 rounded-[1.6rem] px-5 py-4 text-sm font-medium text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang kiểm tra phiên GitHub...
        </div>
      </div>
    );
  }

  if (connected) {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10rem] top-[-8rem] h-[24rem] w-[24rem] rounded-full bg-cyan-400/16 blur-3xl dark:bg-cyan-500/18" />
        <div className="absolute right-[-8rem] top-24 h-[20rem] w-[20rem] rounded-full bg-amber-300/18 blur-3xl dark:bg-amber-400/12" />
        <div className="absolute bottom-[-10rem] left-1/2 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full bg-emerald-300/14 blur-3xl dark:bg-emerald-500/10" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10 sm:px-6 lg:px-8">
        <div className="surface-panel surface-noise grid w-full gap-6 overflow-hidden rounded-[2.2rem] p-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:p-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/72 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              GitHub Access
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              Đăng nhập GitHub trước khi tạo VM hay triển khai repo
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              Mình đã chuyển OrbitStack sang flow khóa đầu vào: chỉ khi GitHub xác thực
              xong thì dashboard mới mở, sau đó repo sẽ được liên kết tự động để bạn
              chọn ở bước deploy.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                "Tạo VM mới sau khi GitHub xác thực",
                "Repo lấy trực tiếp từ tài khoản đã đăng nhập",
                "Deploy thẳng sang Web SSH mà không cần dán URL thủ công",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[1.4rem] border border-border/70 bg-background/70 px-4 py-4 text-sm text-foreground"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-border/70 bg-background/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              1. Đăng nhập GitHub
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              OAuth Device Flow
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Nhấn đăng nhập, mở trang GitHub xác thực và nhập mã hiển thị bên dưới.
            </p>

            <button
              type="button"
              onClick={() => void startDeviceFlow()}
              disabled={loading}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[1.15rem] bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang khởi tạo...
                </>
              ) : (
                <>
                  <GitBranch className="h-4 w-4" />
                  Đăng nhập GitHub
                </>
              )}
            </button>

            {device && (
              <div className="mt-5 rounded-[1.5rem] border border-border/70 bg-card px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Mã xác thực
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[0.18em] text-foreground">
                  {device.user_code}
                </p>
                <a
                  href={device.verification_uri}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  Mở GitHub để xác thực
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            )}

            {status && (
              <div className="mt-5 rounded-[1.4rem] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 dark:text-emerald-300">
                {status}
              </div>
            )}

            {error && (
              <div className="mt-5 rounded-[1.4rem] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 dark:text-rose-300">
                {error}
              </div>
            )}

            <div className="mt-5 rounded-[1.4rem] border border-border/70 bg-card px-4 py-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <p>
                  Sau khi đăng nhập xong, dashboard sẽ tự mở và phần deploy repo chỉ còn
                  bước chọn repo đã liên kết cùng VM đích.
                </p>
              </div>
            </div>

            <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Đăng nhập xong là mở toàn bộ control
              <ArrowRight className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
