"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

function getGitHubErrorMessage(code: string | null) {
  switch (code) {
    case "missing_oauth_config":
      return "Thiếu GITHUB_CLIENT_ID hoặc GITHUB_CLIENT_SECRET trong .env.local.";
    case "oauth_denied":
      return "GitHub đã hủy hoặc từ chối phiên đăng nhập.";
    case "oauth_state_mismatch":
      return "Phiên xác thực GitHub không hợp lệ. Hãy thử đăng nhập lại.";
    case "oauth_exchange_failed":
      return "Không đổi được mã xác thực GitHub sang access token.";
    case "oauth_user_fetch_failed":
      return "Đăng nhập GitHub thành công nhưng không lấy được thông tin tài khoản.";
    default:
      return "";
  }
}

export default function GitHubAccessGate({
  children,
}: {
  children: ReactNode;
}) {
  const [checking, setChecking] = useState(true);
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/github/status", {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        setConnected(false);
        setUser(null);
        return false;
      }

      const data = await response.json();
      setConnected(true);
      setUser(data.user ?? null);
      setError("");
      return true;
    } catch {
      setConnected(false);
      setUser(null);
      setError("Không kiểm tra được trạng thái GitHub lúc này.");
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAuthError(getGitHubErrorMessage(params.get("github_error")));
  }, []);

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
              OrbitStack giờ dùng GitHub OAuth callback chuẩn. Bạn bấm đăng nhập,
              GitHub xác thực xong sẽ tự quay về app và mở dashboard ngay.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                "Đăng nhập GitHub xong mới mở toàn bộ dashboard",
                "Repository lấy trực tiếp từ tài khoản đã xác thực",
                "Deploy repo sang VM mà không cần nhập mã hay dán URL thủ công",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[1.4rem] border border-border/70 bg-background/70 px-4 py-4 text-sm text-foreground"
                >
                  {item}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[1.5rem] border border-border/70 bg-background/70 px-4 py-4 text-sm leading-6 text-muted-foreground">
              Callback URL cần khai báo trong GitHub OAuth App:
              <div className="mt-2 font-medium text-foreground">
                `/api/github/callback` trên đúng domain/port đang chạy app
              </div>
            </div>
          </div>

          <div className="rounded-[1.8rem] border border-border/70 bg-background/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              1. Đăng nhập GitHub
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Web OAuth Flow
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Nhấn đăng nhập để chuyển sang GitHub. Sau khi xác thực xong, GitHub sẽ tự
              redirect ngược về OrbitStack.
            </p>

            <button
              type="button"
              onClick={() => {
                window.location.href = "/api/github/login";
              }}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[1.15rem] bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90"
            >
              <GitBranch className="h-4 w-4" />
              Đăng nhập GitHub tự động
            </button>

            <button
              type="button"
              onClick={() => void fetchStatus()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[1.15rem] border border-border/70 bg-background/70 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
            >
              <RefreshCw className="h-4 w-4" />
              Kiểm tra lại trạng thái
            </button>

            {(authError || error) && (
              <div className="mt-5 rounded-[1.4rem] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 dark:text-rose-300">
                {authError || error}
              </div>
            )}

            <div className="mt-5 rounded-[1.4rem] border border-border/70 bg-card px-4 py-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <p>
                  Flow mới không còn dùng device code. GitHub sẽ tự redirect về app sau
                  khi bạn bấm authorize.
                </p>
              </div>
            </div>

            {user && (
              <div className="mt-5 rounded-[1.4rem] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 dark:text-emerald-300">
                Đã nhận phiên GitHub cho {user.name || user.login}.
              </div>
            )}

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
