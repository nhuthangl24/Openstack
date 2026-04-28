"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

interface VMOption {
  id: string;
  name: string;
  ip: string;
}

interface RepoOption {
  id: number;
  name: string;
  full_name: string;
  clone_url: string;
  html_url: string;
  default_branch: string;
}

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

interface GitHubDeployModalProps {
  vms: VMOption[];
  githubUser?: GitHubUser | null;
  initialVmId?: string;
  onDeploy: (vmId: string, cloneUrl: string) => void;
  onClose: () => void;
}

function normalizeGitHubError(message: string) {
  if (message === "Not connected") {
    return "Phiên GitHub chưa sẵn sàng. Hãy tải lại trang và đăng nhập lại.";
  }

  return message;
}

export default function GitHubDeployModal({
  vms,
  githubUser,
  initialVmId,
  onDeploy,
  onClose,
}: GitHubDeployModalProps) {
  const [loading, setLoading] = useState(true);
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [repoQuery, setRepoQuery] = useState("");
  const [selectedVm, setSelectedVm] = useState(initialVmId ?? "");
  const [error, setError] = useState("");

  const selectedRepoObj = useMemo(
    () => repos.find((repo) => repo.full_name === selectedRepo) ?? null,
    [repos, selectedRepo],
  );

  const selectedVmObj = useMemo(
    () => vms.find((vm) => vm.id === selectedVm) ?? null,
    [selectedVm, vms],
  );

  const filteredRepos = repos.filter((repo) =>
    repo.full_name.toLowerCase().includes(repoQuery.trim().toLowerCase()),
  );

  useEffect(() => {
    setSelectedVm(initialVmId ?? "");
  }, [initialVmId]);

  async function fetchRepos() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/github/repos", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không tải được repository GitHub.");
      }

      setRepos(data.repos || []);

      if (data.repos?.length) {
        setSelectedRepo((current) => current || data.repos[0].full_name);
      }
    } catch (repoError) {
      setRepos([]);
      setError(
        repoError instanceof Error
          ? normalizeGitHubError(repoError.message)
          : "Không tải được repository GitHub.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchRepos();
  }, []);

  function handleDeploy() {
    if (!selectedVm || !selectedRepoObj?.clone_url) {
      return;
    }

    onDeploy(selectedVm, selectedRepoObj.clone_url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-950/55 p-3 backdrop-blur-md sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="surface-panel relative flex h-[calc(100dvh-1.5rem)] max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl min-h-0 flex-col overflow-hidden rounded-[2rem] sm:h-[min(54rem,calc(100dvh-3rem))] sm:max-h-[min(54rem,calc(100dvh-3rem))]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="shrink-0 border-b border-border/70 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-foreground text-background shadow-[0_16px_40px_-24px_rgba(15,23,42,0.7)]">
                <GitBranch className="h-5 w-5" />
              </div>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  GitHub Relay
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                  Chọn repo đã liên kết
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  GitHub đã đăng nhập sẵn, giờ bạn chỉ cần chọn repository muốn clone và
                  VM đích để mở Web SSH.
                </p>

                {githubUser && (
                  <div className="mt-4 inline-flex items-center gap-3 rounded-full border border-border/70 bg-background/70 px-3.5 py-2 text-sm text-foreground">
                    <Image
                      src={githubUser.avatar_url}
                      alt={githubUser.login}
                      width={28}
                      height={28}
                      className="h-7 w-7 rounded-full border border-border/70 object-cover"
                    />
                    <span className="truncate font-medium">
                      Repo đang sync từ @{githubUser.login}
                    </span>
                    <a
                      href={githubUser.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary transition hover:opacity-80"
                    >
                      Hồ sơ
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain lg:overflow-hidden">
          <div className="flex min-h-full flex-col lg:grid lg:h-full lg:min-h-0 lg:grid-cols-[1.08fr_0.92fr]">
            <section className="border-b border-border/70 px-5 py-5 pb-8 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-6 lg:overscroll-contain">
              <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      1. Repository GitHub
                    </p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                      Repo đã đồng bộ từ tài khoản của bạn
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Danh sách này lấy trực tiếp từ GitHub sau khi bạn đăng nhập vào
                      hệ thống.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void fetchRepos()}
                    className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Làm mới repo
                  </button>
                </div>

                <div className="mt-5 flex items-center gap-3 rounded-[1rem] border border-border/70 bg-card px-4 py-3">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    value={repoQuery}
                    onChange={(event) => setRepoQuery(event.target.value)}
                    placeholder="Lọc repo theo tên hoặc owner..."
                    className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>

                {error ? (
                  <div className="mt-4 rounded-[1.3rem] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 dark:text-rose-300">
                    {error}
                  </div>
                ) : loading ? (
                  <div className="mt-4 flex items-center gap-3 rounded-[1.3rem] border border-border/70 bg-card px-4 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tải repository từ GitHub...
                  </div>
                ) : repos.length === 0 ? (
                  <div className="mt-4 rounded-[1.3rem] border border-dashed border-border/70 bg-card px-4 py-6 text-sm text-muted-foreground">
                    Tài khoản GitHub này chưa có repository khả dụng để chọn.
                  </div>
                ) : (
                  <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                    {filteredRepos.map((repo) => {
                      const selected = repo.full_name === selectedRepo;

                      return (
                        <button
                          key={repo.id}
                          type="button"
                          onClick={() => setSelectedRepo(repo.full_name)}
                          className={`w-full rounded-[1.2rem] border p-4 text-left transition ${
                            selected
                              ? "border-primary/40 bg-primary/10"
                              : "border-border/70 bg-card hover:border-primary/25"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground">
                                {repo.full_name}
                              </p>
                              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                Nhánh mặc định: {repo.default_branch}
                              </p>
                            </div>
                            {selected && (
                              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />
                            )}
                          </div>
                        </button>
                      );
                    })}

                    {filteredRepos.length === 0 && (
                      <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-card px-4 py-6 text-sm text-muted-foreground">
                        Không có repo nào khớp bộ lọc hiện tại.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-5 rounded-[1.6rem] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200 dark:text-emerald-300">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>
                    Sau khi bấm deploy, hệ thống sẽ mở Web SSH đúng VM và tự điền lệnh
                    `git clone` với repository bạn vừa chọn.
                  </p>
                </div>
              </div>
            </section>

            <section className="px-5 py-5 pb-6 lg:flex lg:min-h-0 lg:flex-col lg:px-6">
              <div className="space-y-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    2. Chọn VM đích
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                    Gắn repo vào máy đang cần thao tác
                  </h3>

                  <select
                    value={selectedVm}
                    onChange={(event) => setSelectedVm(event.target.value)}
                    className="mt-4 h-12 w-full rounded-[1rem] border border-border/70 bg-card px-4 text-sm text-foreground focus:border-primary/35 focus:outline-none"
                  >
                    <option value="">Chọn VM để deploy</option>
                    {vms.map((vm) => (
                      <option key={vm.id} value={vm.id}>
                        {vm.name} {vm.ip ? `(${vm.ip})` : "(chưa có IP)"}
                      </option>
                    ))}
                  </select>

                  <div className="mt-4 space-y-3">
                    <SummaryRow
                      label="Repository"
                      value={selectedRepoObj?.full_name || "Chưa chọn"}
                    />
                    <SummaryRow
                      label="Branch"
                      value={selectedRepoObj?.default_branch || "Chưa có"}
                    />
                    <SummaryRow
                      label="Clone URL"
                      value={selectedRepoObj?.clone_url || "Chưa có"}
                    />
                    <SummaryRow
                      label="Target VM"
                      value={selectedVmObj?.name || "Chưa chọn"}
                    />
                  </div>

                  {selectedRepoObj?.html_url && (
                    <a
                      href={selectedRepoObj.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Mở repository trên GitHub
                    </a>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="shrink-0 border-t border-border/70 bg-background/92 px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Sẵn sàng triển khai
              </p>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {selectedVmObj?.name || "Chưa chọn VM"} •{" "}
                {selectedRepoObj?.full_name || "Chưa chọn repo"}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-full border border-border/70 bg-background/70 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
              >
                Đóng panel
              </button>
              <button
                type="button"
                onClick={handleDeploy}
                disabled={!selectedVm || !selectedRepoObj}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <GitBranch className="h-4 w-4" />
                Mở Web SSH và clone repo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-border/70 bg-card px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span className="max-w-[64%] truncate text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}
