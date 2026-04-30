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
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="surface-panel mb-5 flex flex-col gap-4 rounded-[1.3rem] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[0.9rem] bg-foreground text-background">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                OrbitStack Access Gate
              </p>
              <p className="text-sm font-semibold text-foreground">
                GitHub xác thực trước khi mở control plane
              </p>
            </div>
          </div>

          <div className="rounded-full border border-border/70 bg-background/70 px-4 py-2 text-sm text-muted-foreground">
            Callback: `/api/github/callback`
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          <aside className="surface-panel rounded-[1.6rem] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Quy tắc truy cập
            </p>
            <div className="mt-5 space-y-3">
              {[
                "Muốn tạo VM hay deploy repo thì phải qua GitHub gate trước.",
                "Repo linked được kéo tự động từ tài khoản đã xác thực.",
                "Repo ngoài vẫn có thể dán thủ công ở bước deploy pipeline.",
                "Terminal sẽ nhận script triển khai sau khi bạn chọn đúng VM đích.",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4 text-sm leading-6 text-foreground"
                >
                  {item}
                </div>
              ))}
            </div>
          </aside>

          <main className="surface-panel surface-noise overflow-hidden rounded-[1.8rem] p-6 sm:p-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/72 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Xác thực
            </div>

            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-[1.04] tracking-tight text-foreground sm:text-5xl">
              Vào GitHub trước, rồi mới bật toàn bộ OpenStack workbench
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              Mình đã bỏ hẳn flow nhập mã. Từ đây bạn chỉ việc bấm đăng nhập, GitHub
              authorize xong sẽ tự quay lại app và mở dashboard mới ngay lập tức.
            </p>

            <div className="mt-8 grid gap-3 md:grid-cols-2">
              <div className="rounded-[1.2rem] border border-border/70 bg-background/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Repo đã liên kết
                </p>
                <p className="mt-3 text-lg font-semibold text-foreground">
                  Đồng bộ repo trực tiếp từ GitHub
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Sau khi xác thực, modal deploy sẽ thấy repository của tài khoản đó
                  ngay, không cần dán URL nữa nếu bạn không muốn.
                </p>
              </div>

              <div className="rounded-[1.2rem] border border-border/70 bg-background/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Luồng triển khai
                </p>
                <p className="mt-3 text-lg font-semibold text-foreground">
                  Clone, env, install và post-deploy command
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Ngay sau khi vào dashboard, bạn có thể build workflow deploy đầy đủ
                  cho từng VM thay vì chỉ có mỗi `git clone`.
                </p>
              </div>
            </div>
          </main>

          <aside className="surface-panel rounded-[1.6rem] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Đăng nhập GitHub
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Luồng callback OAuth
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Nhấn để chuyển sang GitHub. Khi authorize xong, app sẽ quay về bằng
              callback chuẩn và mở toàn bộ control plane.
            </p>

            <button
              type="button"
              onClick={() => {
                window.location.href = "/api/github/login";
              }}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[0.95rem] bg-foreground px-5 py-3.5 text-sm font-semibold text-background transition hover:opacity-90"
            >
              <GitBranch className="h-4 w-4" />
              Đăng nhập GitHub
            </button>

            <button
              type="button"
              onClick={() => void fetchStatus()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[0.95rem] border border-border/70 bg-background/70 px-5 py-3.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
            >
              <RefreshCw className="h-4 w-4" />
              Kiểm tra lại trạng thái
            </button>

            {(authError || error) && (
              <div className="mt-5 rounded-[1rem] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 dark:text-rose-300">
                {authError || error}
              </div>
            )}

            {user && (
              <div className="mt-5 rounded-[1rem] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 dark:text-emerald-300">
                Đã thấy phiên GitHub cho {user.name || user.login}.
              </div>
            )}

            <div className="mt-5 rounded-[1rem] border border-border/70 bg-card px-4 py-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <p>
                  Không còn device code. GitHub sẽ tự redirect về app sau khi bạn bấm
                  authorize ở tab GitHub.
                </p>
              </div>
            </div>

            <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Xác thực xong là mở toàn bộ workbench
              <ArrowRight className="h-4 w-4" />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
