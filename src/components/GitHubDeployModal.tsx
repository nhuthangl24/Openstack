"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

interface GitHubDeployModalProps {
  vms: VMOption[];
  initialVmId?: string;
  onDeploy: (vmId: string, cloneUrl: string) => void;
  onClose: () => void;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export default function GitHubDeployModal({
  vms,
  initialVmId,
  onDeploy,
  onClose,
}: GitHubDeployModalProps) {
  const [loading, setLoading] = useState(false);
  const [device, setDevice] = useState<DeviceCodeResponse | null>(null);
  const [status, setStatus] = useState("");
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [repoQuery, setRepoQuery] = useState("");
  const [selectedVm, setSelectedVm] = useState(initialVmId ?? "");
  const [error, setError] = useState("");
  const pollRef = useRef<number | null>(null);

  const selectedRepoObj = useMemo(
    () => repos.find((repo) => repo.full_name === selectedRepo) ?? null,
    [repos, selectedRepo],
  );

  const manualCloneUrl = useMemo(() => {
    const raw = repoInput.trim();

    if (!raw) {
      return "";
    }

    if (raw.startsWith("git@") || raw.startsWith("http")) {
      return raw;
    }

    if (raw.includes("github.com")) {
      return raw;
    }

    if (raw.includes("/")) {
      return `https://github.com/${raw}.git`;
    }

    return "";
  }, [repoInput]);

  const filteredRepos = repos.filter((repo) =>
    repo.full_name.toLowerCase().includes(repoQuery.trim().toLowerCase()),
  );

  useEffect(() => {
    setSelectedVm(initialVmId ?? "");
  }, [initialVmId]);

  function stopPolling() {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function fetchRepos() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/github/repos");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Chua ket noi GitHub.");
      }

      setRepos(data.repos || []);

      if (data.repos?.length) {
        setSelectedRepo((current) => current || data.repos[0].full_name);
      }
    } catch (repoError) {
      setRepos([]);
      setError(
        repoError instanceof Error
          ? repoError.message
          : "Khong the tai danh sach repository.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function startDeviceFlow() {
    setLoading(true);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/github/device/start", {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Khong khoi dong duoc device flow.");
      }

      setDevice(data);
      setStatus("Mo GitHub va nhap ma xac thuc ben duoi.");
      startPolling(data.device_code, data.interval || 5);
    } catch (deviceError) {
      setError(
        deviceError instanceof Error
          ? deviceError.message
          : "Khong khoi dong duoc GitHub device flow.",
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_code: deviceCode }),
        });
        const data = await response.json();

        if (data.status === "authorized") {
          stopPolling();
          setStatus("Da ket noi GitHub.");
          await fetchRepos();
          return;
        }

        if (data.status === "denied") {
          stopPolling();
          setError("GitHub tu choi xac thuc.");
          return;
        }

        if (data.status === "expired") {
          stopPolling();
          setError("Ma xac thuc da het han. Hay thu lai.");
          return;
        }

        if (data.status === "slow_down" || data.status === "pending") {
          setStatus("Dang cho GitHub xac nhan...");
        }
      } catch {
        stopPolling();
        setError("Khong the tiep tuc polling voi GitHub.");
      }
    }, Math.max(intervalSec, 5) * 1000);
  }

  useEffect(() => {
    void fetchRepos();
    return () => stopPolling();
  }, []);

  function handleDeploy() {
    const cloneUrl = manualCloneUrl || selectedRepoObj?.clone_url;

    if (!selectedVm || !cloneUrl) {
      return;
    }

    onDeploy(selectedVm, cloneUrl);
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
      <div className="surface-panel relative flex h-[calc(100dvh-1.5rem)] w-full max-w-6xl min-h-0 flex-col overflow-hidden rounded-[2rem] sm:h-[min(54rem,calc(100dvh-3rem))]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="flex items-center justify-between border-b border-border/70 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-foreground text-background shadow-[0_16px_40px_-24px_rgba(15,23,42,0.7)]">
              <GitBranch className="h-5 w-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                GitHub Relay
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                Trien khai repo len VM
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Dan repo public truc tiep hoac ket noi GitHub de chon nhanh tu danh
                sach repository cua ban.
              </p>
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

        <div className="flex-1 overflow-y-auto overscroll-contain lg:overflow-hidden">
          <div className="grid min-h-full gap-0 lg:min-h-0 lg:grid-cols-[0.95fr_1.05fr]">
            <section className="space-y-5 border-b border-border/70 px-5 py-5 pb-8 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-6 lg:overscroll-contain">
              <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      1. Ket noi GitHub
                    </p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                      OAuth Device Flow
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Phu hop khi ban muon chon repo tu tai khoan GitHub da xac thuc.
                    </p>
                  </div>
                  {repos.length > 0 && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Connected
                    </span>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void startDeviceFlow()}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Dang khoi tao...
                      </>
                    ) : (
                      <>
                        <GitBranch className="h-4 w-4" />
                        Ket noi GitHub
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => void fetchRepos()}
                    className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Lam moi repo
                  </button>
                </div>

                {device && (
                  <div className="mt-5 rounded-[1.3rem] border border-border/70 bg-card px-4 py-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          Verification code
                        </p>
                        <p className="mt-2 text-2xl font-semibold tracking-[0.2em] text-foreground">
                          {device.user_code}
                        </p>
                      </div>
                      <a
                        href={device.verification_uri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                      >
                        Mo GitHub
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>

                    {status && (
                      <p className="mt-4 text-sm text-muted-foreground">{status}</p>
                    )}
                  </div>
                )}

                {error && (
                  <div className="mt-5 rounded-[1.3rem] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 dark:text-rose-300">
                    {error}
                  </div>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  2. Repo public truc tiep
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                  Dan URL hoac owner/repo
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Cach nay khong can GitHub OAuth. Vi du: `https://github.com/user/repo`
                  hoac `user/repo`.
                </p>

                <input
                  value={repoInput}
                  onChange={(event) => setRepoInput(event.target.value)}
                  placeholder="https://github.com/user/repo hoac user/repo"
                  className="mt-4 h-12 w-full rounded-[1rem] border border-border/70 bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/35 focus:outline-none"
                />

                {manualCloneUrl && (
                  <div className="mt-4 rounded-[1.2rem] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 dark:text-emerald-300">
                    Clone URL se dung: <span className="font-medium">{manualCloneUrl}</span>
                  </div>
                )}
              </div>

              <div className="rounded-[1.6rem] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200 dark:text-emerald-300">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>
                    Khi bam deploy, giao dien se mo Web SSH cho dung VM va tu chay
                    lenh `git clone` voi repo ban chon.
                  </p>
                </div>
              </div>
            </section>

            <section className="px-5 py-5 pb-6 lg:flex lg:min-h-0 lg:flex-col lg:px-6">
              <div className="space-y-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    3. Chon repository
                  </p>
                  <div className="mt-4 flex items-center gap-3 rounded-[1rem] border border-border/70 bg-card px-4 py-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                      value={repoQuery}
                      onChange={(event) => setRepoQuery(event.target.value)}
                      placeholder="Loc repo theo ten..."
                      className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                  </div>

                  {repos.length > 0 ? (
                    <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
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
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {repo.full_name}
                                </p>
                                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                  default branch: {repo.default_branch}
                                </p>
                              </div>
                              {selected && (
                                <CheckCircle2 className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          </button>
                        );
                      })}

                      {filteredRepos.length === 0 && (
                        <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-card px-4 py-6 text-sm text-muted-foreground">
                          Khong co repo nao khop tu khoa hien tai.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-[1.2rem] border border-dashed border-border/70 bg-card px-4 py-6 text-sm text-muted-foreground">
                      Chua co repo nao tu GitHub OAuth. Ban van co the dan repo public o
                      cot ben trai va deploy truc tiep.
                    </div>
                  )}
                </div>

                <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    4. Chon VM dich
                  </p>

                  <select
                    value={selectedVm}
                    onChange={(event) => setSelectedVm(event.target.value)}
                    className="mt-4 h-12 w-full rounded-[1rem] border border-border/70 bg-card px-4 text-sm text-foreground focus:border-primary/35 focus:outline-none"
                  >
                    <option value="">Chon VM de deploy</option>
                    {vms.map((vm) => (
                      <option key={vm.id} value={vm.id}>
                        {vm.name} {vm.ip ? `(${vm.ip})` : "(chua co IP)"}
                      </option>
                    ))}
                  </select>

                  <div className="mt-4 space-y-3">
                    <SummaryRow
                      label="Repository"
                      value={
                        manualCloneUrl || selectedRepoObj?.full_name || "Chua chon"
                      }
                    />
                    <SummaryRow
                      label="Clone URL"
                      value={manualCloneUrl || selectedRepoObj?.clone_url || "Chua co"}
                    />
                    <SummaryRow
                      label="Target VM"
                      value={vms.find((vm) => vm.id === selectedVm)?.name || "Chua chon"}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 lg:mt-4 lg:border-t lg:border-border/70 lg:pt-5">
                <button
                  type="button"
                  onClick={handleDeploy}
                  disabled={!selectedVm || (!manualCloneUrl && !selectedRepoObj)}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <GitBranch className="h-4 w-4" />
                  Mo Web SSH va clone repo
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-full border border-border/70 bg-background/70 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  Dong panel
                </button>
              </div>
            </section>
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
