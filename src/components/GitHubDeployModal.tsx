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
  Settings2,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import {
  buildDeployCommand,
  deployRecipes,
  deriveRepoDirectory,
  normalizeExternalRepoInput,
  type DeployRecipe,
} from "@/lib/deploy-recipes";

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

export interface GitHubDeployPlan {
  vmId: string;
  cloneUrl: string;
  repoLabel: string;
  initialCommand: string;
}

interface GitHubDeployModalProps {
  vms: VMOption[];
  githubUser?: GitHubUser | null;
  initialVmId?: string;
  onDeploy: (plan: GitHubDeployPlan) => void;
  onClose: () => void;
}

type RepoSource = "linked" | "external";

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
  const [repoSource, setRepoSource] = useState<RepoSource>("linked");
  const [externalRepo, setExternalRepo] = useState("");
  const [deployRecipeKey, setDeployRecipeKey] =
    useState<DeployRecipe["key"]>("clone-only");
  const [branchName, setBranchName] = useState("");
  const [repoDirectory, setRepoDirectory] = useState("");
  const [envFileName, setEnvFileName] = useState(".env");
  const [envText, setEnvText] = useState("");
  const [installCommand, setInstallCommand] = useState("");
  const [postDeployCommand, setPostDeployCommand] = useState("");
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");

  const selectedRepoObj = useMemo(
    () => repos.find((repo) => repo.full_name === selectedRepo) ?? null,
    [repos, selectedRepo],
  );

  const selectedVmObj = useMemo(
    () => vms.find((vm) => vm.id === selectedVm) ?? null,
    [selectedVm, vms],
  );

  const activeRecipe = useMemo(
    () => deployRecipes.find((item) => item.key === deployRecipeKey) ?? deployRecipes[0],
    [deployRecipeKey],
  );

  const filteredRepos = repos.filter((repo) =>
    repo.full_name.toLowerCase().includes(repoQuery.trim().toLowerCase()),
  );

  const externalRepoConfig = useMemo(
    () => normalizeExternalRepoInput(externalRepo),
    [externalRepo],
  );

  const activeRepo = useMemo(() => {
    if (repoSource === "linked") {
      if (!selectedRepoObj) {
        return null;
      }

      return {
        cloneUrl: selectedRepoObj.clone_url,
        label: selectedRepoObj.full_name,
        branch: selectedRepoObj.default_branch,
        htmlUrl: selectedRepoObj.html_url,
      };
    }

    if (!externalRepoConfig) {
      return null;
    }

    return {
      cloneUrl: externalRepoConfig.cloneUrl,
      label: externalRepoConfig.label,
      branch: "",
      htmlUrl: "",
    };
  }, [externalRepoConfig, repoSource, selectedRepoObj]);

  const envCount = useMemo(
    () =>
      envText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#")).length,
    [envText],
  );

  const commandPreview = useMemo(() => {
    if (!activeRepo) {
      return "";
    }

    return buildDeployCommand({
      cloneUrl: activeRepo.cloneUrl,
      repoDirectory: repoDirectory || deriveRepoDirectory(activeRepo.cloneUrl),
      envFileName,
      envText,
      installCommand,
      postDeployCommand,
      branchName,
    });
  }, [
    activeRepo,
    branchName,
    envFileName,
    envText,
    installCommand,
    postDeployCommand,
    repoDirectory,
  ]);

  useEffect(() => {
    setSelectedVm(initialVmId ?? "");
  }, [initialVmId]);

  useEffect(() => {
    if (repoSource === "linked" && selectedRepoObj?.default_branch) {
      setBranchName(selectedRepoObj.default_branch);
    }
  }, [repoSource, selectedRepoObj]);

  useEffect(() => {
    if (!activeRepo) {
      return;
    }

    setRepoDirectory(deriveRepoDirectory(activeRepo.cloneUrl));
  }, [activeRepo]);

  function applyRecipe(recipe: DeployRecipe) {
    setDeployRecipeKey(recipe.key);
    setInstallCommand(recipe.installCommand);
    setPostDeployCommand(recipe.postDeployCommand);
  }

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
    setValidationError("");

    if (!selectedVm) {
      setValidationError("Hãy chọn VM đích trước khi mở terminal.");
      return;
    }

    if (!activeRepo) {
      setValidationError("Hãy chọn repository hoặc dán repo ngoài hợp lệ.");
      return;
    }

    onDeploy({
      vmId: selectedVm,
      cloneUrl: activeRepo.cloneUrl,
      repoLabel: activeRepo.label,
      initialCommand: commandPreview,
    });
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
      <div className="surface-panel relative flex h-[calc(100dvh-1.5rem)] max-h-[calc(100dvh-1.5rem)] w-full max-w-7xl min-h-0 flex-col overflow-hidden rounded-[2rem] sm:h-[min(56rem,calc(100dvh-3rem))] sm:max-h-[min(56rem,calc(100dvh-3rem))]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="shrink-0 border-b border-border/70 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-foreground text-background shadow-[0_16px_40px_-24px_rgba(15,23,42,0.7)]">
                <GitBranch className="h-5 w-5" />
              </div>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Triển khai repo
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                  Deploy repo theo workflow của bạn
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Chọn repo từ GitHub đã liên kết hoặc dán repo ngoài, thêm file môi
                  trường, lệnh cài đặt và bước sau deploy để terminal mở ra là có thể
                  chạy tiếp ngay.
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
                      Tài khoản GitHub hiện tại: @{githubUser.login}
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
                <div className="flex flex-wrap gap-3">
                  {[
                    {
                      key: "linked" as const,
                      label: "GitHub đã liên kết",
                      description: "Lấy repo trực tiếp từ tài khoản GitHub đang đăng nhập.",
                    },
                    {
                      key: "external" as const,
                      label: "Repo ngoài",
                      description: "Dán HTTPS URL, SSH URL hoặc owner/repo để clone thủ công.",
                    },
                  ].map((source) => {
                    const active = repoSource === source.key;

                    return (
                      <button
                        key={source.key}
                        type="button"
                        onClick={() => {
                          setRepoSource(source.key);
                          setValidationError("");
                        }}
                        className={`min-w-[14rem] rounded-[1.3rem] border px-4 py-4 text-left transition ${
                          active
                            ? "border-primary/40 bg-primary/10"
                            : "border-border/70 bg-card hover:border-primary/25"
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">{source.label}</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {source.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {repoSource === "linked" ? (
                  <div className="mt-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          1. Repository GitHub
                        </p>
                        <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                          Repo đồng bộ từ tài khoản của bạn
                        </h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          Chọn repo đã liên kết sẵn, phù hợp khi bạn đang làm việc trực
                          tiếp với source trên GitHub.
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
                      <div className="mt-4 max-h-[22rem] space-y-3 overflow-y-auto pr-1">
                        {filteredRepos.map((repo) => {
                          const selected = repo.full_name === selectedRepo;

                          return (
                            <button
                              key={repo.id}
                              type="button"
                              onClick={() => {
                                setSelectedRepo(repo.full_name);
                                setValidationError("");
                              }}
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
                ) : (
                  <div className="mt-6 rounded-[1.5rem] border border-border/70 bg-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      1. Repo ngoài GitHub
                    </p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                      Thêm repository từ bên ngoài
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Chấp nhận HTTPS URL, SSH URL hoặc shorthand kiểu `owner/repo`.
                    </p>

                    <div className="mt-4 rounded-[1.1rem] border border-border/70 bg-background/70 px-4 py-3">
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Clone URL hoặc owner/repo
                      </label>
                      <input
                        value={externalRepo}
                        onChange={(event) => {
                          setExternalRepo(event.target.value);
                          setValidationError("");
                        }}
                        placeholder="https://github.com/user/repo.git hoặc user/repo"
                        className="mt-2 h-10 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                      />
                    </div>

                    <div className="mt-4 rounded-[1.2rem] border border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
                      {externalRepoConfig ? (
                        <>
                          <p className="font-semibold text-foreground">
                            Sẽ clone từ {externalRepoConfig.cloneUrl}
                          </p>
                          <p className="mt-1">
                            Thư mục gợi ý: `{externalRepoConfig.directory}`
                          </p>
                        </>
                      ) : (
                        <p>
                          Ví dụ hợp lệ: `https://gitlab.com/team/project.git`,
                          `git@github.com:user/repo.git`, `owner/repo`.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-6 rounded-[1.6rem] border border-border/70 bg-card p-5">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      2. Recipe triển khai
                    </p>
                  </div>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                    Chọn stack đã có hoặc workflow custom
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Mình sẽ dùng recipe này để prefill lệnh cài đặt và bước sau deploy.
                    Bạn vẫn có thể sửa lại theo repo thật tế.
                  </p>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {deployRecipes.map((recipe) => {
                      const selected = recipe.key === deployRecipeKey;

                      return (
                        <button
                          key={recipe.key}
                          type="button"
                          onClick={() => applyRecipe(recipe)}
                          className={`rounded-[1.2rem] border p-4 text-left transition ${
                            selected
                              ? "border-primary/40 bg-primary/10"
                              : "border-border/70 bg-background/70 hover:border-primary/25"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground">
                              {recipe.label}
                            </p>
                            {selected && (
                              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />
                            )}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {recipe.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-6 rounded-[1.6rem] border border-border/70 bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    3. Môi trường & cài đặt
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                    Tạo `.env` và lệnh setup ngay trong session
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Nếu VM đã có sẵn stack từ preset hoặc cloud-init, bạn có thể chạy
                    luôn các bước cài đặt/tích hợp ở đây thay vì chỉ dừng ở clone.
                  </p>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <Field
                      label="Branch"
                      value={branchName}
                      onChange={setBranchName}
                      placeholder="main"
                    />
                    <Field
                      label="Thư mục deploy"
                      value={repoDirectory}
                      onChange={setRepoDirectory}
                      placeholder="my-app"
                    />
                    <Field
                      label="Tên file env"
                      value={envFileName}
                      onChange={setEnvFileName}
                      placeholder=".env"
                    />
                    <Field
                      label="Install command"
                      value={installCommand}
                      onChange={setInstallCommand}
                      placeholder={activeRecipe.installCommand || "npm install"}
                    />
                  </div>

                  <div className="mt-4 grid gap-4">
                    <Field
                      label="After deploy command"
                      value={postDeployCommand}
                      onChange={setPostDeployCommand}
                      placeholder={activeRecipe.postDeployCommand || "docker compose up -d --build"}
                    />

                    <div className="rounded-[1.2rem] border border-border/70 bg-background/70 px-4 py-3">
                      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Biến môi trường
                      </label>
                      <textarea
                        value={envText}
                        onChange={(event) => setEnvText(event.target.value)}
                        placeholder={"APP_ENV=production\nPORT=3000\nDATABASE_URL=postgres://..."}
                        className="mt-2 min-h-36 w-full resize-y bg-transparent text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-[1.6rem] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200 dark:text-emerald-300">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <p>
                      Terminal sẽ mở vào đúng VM, sau đó tự chạy workflow bạn vừa cấu hình:
                      clone hoặc pull source, ghi file môi trường, rồi chạy lệnh cài và
                      lệnh sau deploy nếu có.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="px-5 py-5 pb-6 lg:flex lg:min-h-0 lg:flex-col lg:px-6">
              <div className="space-y-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    4. VM đích & preview
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                    Chốt target và xem trước workflow
                  </h3>

                  <select
                    value={selectedVm}
                    onChange={(event) => {
                      setSelectedVm(event.target.value);
                      setValidationError("");
                    }}
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
                    <SummaryRow label="Nguồn repo" value={repoSource === "linked" ? "GitHub đã liên kết" : "Repo ngoài"} />
                    <SummaryRow label="Repository" value={activeRepo?.label || "Chưa chọn"} />
                    <SummaryRow label="Clone URL" value={activeRepo?.cloneUrl || "Chưa có"} />
                    <SummaryRow label="VM đích" value={selectedVmObj?.name || "Chưa chọn"} />
                    <SummaryRow label="Nhánh" value={branchName || "Mặc định của repo"} />
                    <SummaryRow label="Cách triển khai" value={activeRecipe.label} />
                    <SummaryRow label="Biến môi trường" value={envCount ? `${envCount} biến` : "Không tạo file env"} />
                  </div>

                  {activeRepo?.htmlUrl && (
                    <a
                      href={activeRepo.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Mở repo trên GitHub
                    </a>
                  )}
                </div>

                <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-5">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      5. Xem trước script
                    </p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Đây là script sẽ được nạp sẵn vào terminal ngay sau khi SSH kết nối.
                  </p>

                  <pre className="mt-4 max-h-[20rem] overflow-auto rounded-[1.2rem] border border-border/70 bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">
                    <code>{commandPreview || "Chọn repo để xem trước script triển khai."}</code>
                  </pre>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="shrink-0 border-t border-border/70 bg-background/92 px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Sẵn sàng mở pipeline deploy
              </p>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {selectedVmObj?.name || "Chưa chọn VM"} • {activeRepo?.label || "Chưa chọn repo"}
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
                disabled={!selectedVm || !activeRepo}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <GitBranch className="h-4 w-4" />
                Mở terminal và chạy script
              </button>
            </div>
          </div>

          {validationError && (
            <div className="mt-4 rounded-[1.2rem] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 dark:text-rose-300">
              {validationError}
            </div>
          )}
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="rounded-[1.2rem] border border-border/70 bg-background/70 px-4 py-3">
      <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-10 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
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
      <span className="max-w-[64%] truncate text-right text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}
