"use client";

import Link from "next/link";
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  Database,
  HardDrive,
  RefreshCw,
  Search,
  ShieldCheck,
  Signal,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import GitHubAccessGate from "@/components/GitHubAccessGate";
import ThemeToggle from "@/components/ThemeToggle";
import type {
  AdminDatabaseOverviewPayload,
  AdminDatabasePlanItem,
  AdminDatabaseUserItem,
} from "@/components/database-admin/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserQuotaDraft {
  planCode: string;
  maxDatabases: string;
  maxStorageMb: string;
  maxConnections: string;
}

function buildDraftFromUser(user: AdminDatabaseUserItem): UserQuotaDraft {
  return {
    planCode: user.plan.code,
    maxDatabases: String(user.quota.maxDatabases),
    maxStorageMb: String(user.quota.maxStorageMb),
    maxConnections: String(user.quota.maxConnections),
  };
}

function formatMoney(price: number) {
  if (price <= 0) {
    return "Free";
  }

  return `$${price}/mo`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="surface-panel rounded-[1.3rem] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{helper}</p>
        </div>
        <div className="rounded-[0.9rem] border border-border/70 bg-background/70 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="surface-panel rounded-[1.6rem] p-5">
      <div className="skeleton h-5 w-40" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-16 w-full" />
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="skeleton h-11 w-full" />
        <div className="skeleton h-11 w-full" />
        <div className="skeleton h-11 w-full" />
        <div className="skeleton h-11 w-full" />
      </div>
    </div>
  );
}

function UserCard({
  user,
  plans,
  draft,
  saving,
  onDraftChange,
  onPlanChange,
  onReset,
  onSave,
}: {
  user: AdminDatabaseUserItem;
  plans: AdminDatabasePlanItem[];
  draft: UserQuotaDraft;
  saving: boolean;
  onDraftChange: (patch: Partial<UserQuotaDraft>) => void;
  onPlanChange: (planCode: string) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <article className="surface-panel rounded-[1.6rem] p-5">
      <div className="flex flex-col gap-4 border-b border-border/70 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {user.githubUsername}
            </h2>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              {user.plan.name}
            </span>
            {user.quota.isCustomized && (
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-300">
                Quota override
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {[user.name, user.email].filter(Boolean).join(" // ") || "No profile metadata"}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            created {formatTimestamp(user.createdAt)} | updated {formatTimestamp(user.updatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {user.mysqlAccount ? (
            <>
              <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground">
                mysql {user.mysqlAccount.username}
              </span>
              <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                host {user.mysqlAccount.hostAllow}
              </span>
            </>
          ) : (
            <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              Chua co MySQL account
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Databases
          </p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{user.databaseCount}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {user.usage.totalDatabases} cached in usage stats
          </p>
        </div>
        <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Storage
          </p>
          <p className="mt-3 text-2xl font-semibold text-foreground">
            {user.usage.totalStorageLabel}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            limit {user.quota.maxStorageMb} MB
          </p>
        </div>
        <div className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Connections
          </p>
          <p className="mt-3 text-2xl font-semibold text-foreground">
            {user.usage.activeConnections}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            limit {user.quota.maxConnections}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Hosted databases
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {user.databaseNames.length ? (
            user.databaseNames.map((databaseName) => (
              <span
                key={databaseName}
                className="rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground"
              >
                {databaseName}
              </span>
            ))
          ) : (
            <span className="rounded-full border border-dashed border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              No active databases
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,220px)_repeat(3,minmax(0,1fr))]">
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Plan preset
          </Label>
          <Select value={draft.planCode} onValueChange={(value) => value && onPlanChange(value)}>
            <SelectTrigger className="h-11 w-full bg-background/80">
              <SelectValue placeholder="Chon plan" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((plan) => (
                <SelectItem key={plan.code} value={plan.code}>
                  {plan.name} | {plan.maxDatabases} DB | {plan.maxStorageMb} MB | {plan.maxConnections} conn
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs leading-5 text-muted-foreground">
            Chon plan se nap quota mac dinh cua goi. Mày van co the sua tay truoc khi save.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Max databases
          </Label>
          <Input
            value={draft.maxDatabases}
            inputMode="numeric"
            onChange={(event) => onDraftChange({ maxDatabases: event.target.value })}
            className="h-11 bg-background/80"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Max storage (MB)
          </Label>
          <Input
            value={draft.maxStorageMb}
            inputMode="numeric"
            onChange={(event) => onDraftChange({ maxStorageMb: event.target.value })}
            className="h-11 bg-background/80"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Max connections
          </Label>
          <Input
            value={draft.maxConnections}
            inputMode="numeric"
            onChange={(event) => onDraftChange({ maxConnections: event.target.value })}
            className="h-11 bg-background/80"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Current plan pricing: {formatMoney(user.plan.price)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onReset}
            disabled={saving}
          >
            Khoi phuc
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "Dang luu..." : "Luu plan va quota"}
          </Button>
        </div>
      </div>
    </article>
  );
}

function DatabaseHostingAdminContent() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [overview, setOverview] = useState<AdminDatabaseOverviewPayload | null>(null);
  const [drafts, setDrafts] = useState<Record<number, UserQuotaDraft>>({});
  const deferredSearch = useDeferredValue(search);

  const syncOverview = useCallback((payload: AdminDatabaseOverviewPayload) => {
    startTransition(() => {
      setOverview(payload);
      setDrafts(
        Object.fromEntries(
          payload.users.map((user) => [user.id, buildDraftFromUser(user)]),
        ),
      );
    });
  }, []);

  const fetchOverview = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const response = await fetch("/api/database-admin", {
          credentials: "include",
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error_message || "Khong tai duoc trang quan tri.");
        }

        syncOverview({
          accessMode: data.access_mode,
          allowedAdmins: data.allowed_admins || [],
          plans: data.plans || [],
          users: data.users || [],
        });
      } catch (fetchError) {
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Khong tai duoc du lieu quan tri database hosting.";
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [syncOverview],
  );

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const planLookup = useMemo(
    () =>
      new Map(
        (overview?.plans || []).map((plan) => [plan.code, plan] satisfies [string, AdminDatabasePlanItem]),
      ),
    [overview?.plans],
  );

  const filteredUsers = useMemo(() => {
    const keyword = deferredSearch.trim().toLowerCase();
    const users = overview?.users || [];

    if (!keyword) {
      return users;
    }

    return users.filter((user) =>
      [
        user.githubUsername,
        user.name || "",
        user.email || "",
        user.mysqlAccount?.username || "",
        user.mysqlAccount?.hostAllow || "",
        ...user.databaseNames,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [deferredSearch, overview?.users]);

  const summary = useMemo(() => {
    const users = overview?.users || [];
    const totalUsers = users.length;
    const totalDatabases = users.reduce((sum, user) => sum + user.databaseCount, 0);
    const totalStorageMb = users.reduce((sum, user) => sum + user.usage.totalStorageMb, 0);
    const totalConnections = users.reduce(
      (sum, user) => sum + user.usage.activeConnections,
      0,
    );

    return {
      totalUsers,
      totalDatabases,
      totalStorageMb,
      totalConnections,
      planCount: overview?.plans.length || 0,
    };
  }, [overview]);

  function updateDraft(userId: number, patch: Partial<UserQuotaDraft>) {
    setDrafts((current) => ({
      ...current,
      [userId]: {
        ...current[userId],
        ...patch,
      },
    }));
  }

  function handlePlanChange(userId: number, planCode: string) {
    const plan = planLookup.get(planCode);

    updateDraft(userId, {
      planCode,
      maxDatabases: plan ? String(plan.maxDatabases) : drafts[userId]?.maxDatabases || "",
      maxStorageMb: plan ? String(plan.maxStorageMb) : drafts[userId]?.maxStorageMb || "",
      maxConnections: plan ? String(plan.maxConnections) : drafts[userId]?.maxConnections || "",
    });
  }

  function resetDraft(user: AdminDatabaseUserItem) {
    setDrafts((current) => ({
      ...current,
      [user.id]: buildDraftFromUser(user),
    }));
  }

  async function handleSave(user: AdminDatabaseUserItem) {
    const draft = drafts[user.id];

    if (!draft) {
      return;
    }

    setSavingUserId(user.id);

    try {
      const response = await fetch("/api/database-admin", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: user.id,
          plan_code: draft.planCode,
          max_databases: draft.maxDatabases,
          max_storage_mb: draft.maxStorageMb,
          max_connections: draft.maxConnections,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error_message || "Khong cap nhat duoc plan.");
      }

      const updatedUser = data.user as AdminDatabaseUserItem;

      startTransition(() => {
        setOverview((current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            users: current.users.map((entry) =>
              entry.id === updatedUser.id ? updatedUser : entry,
            ),
          };
        });
        setDrafts((current) => ({
          ...current,
          [updatedUser.id]: buildDraftFromUser(updatedUser),
        }));
      });

      toast.success(`Da cap nhat plan cho ${updatedUser.githubUsername}.`);
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "Khong cap nhat duoc plan.",
      );
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-10rem] top-[-8rem] h-[20rem] w-[20rem] rounded-full bg-cyan-400/10 blur-3xl dark:bg-cyan-500/14" />
        <div className="absolute right-[-12rem] top-16 h-[22rem] w-[22rem] rounded-full bg-emerald-300/12 blur-3xl dark:bg-emerald-500/10" />
        <div className="absolute bottom-[-11rem] left-1/2 h-[24rem] w-[24rem] -translate-x-1/2 rounded-full bg-amber-300/12 blur-3xl dark:bg-amber-500/10" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1580px] px-4 py-5 sm:px-6 lg:px-8">
        <div className="surface-panel flex flex-col gap-4 rounded-[1.5rem] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-foreground text-background">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Database Admin | standalone
              </p>
              <p className="text-sm font-semibold text-foreground">
                Khu rieng de quan ly GitHub user, plan va quota
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Ve trang chinh
            </Link>
            <button
              type="button"
              onClick={() => void fetchOverview({ silent: true })}
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Lam moi
            </button>
            <ThemeToggle />
          </div>
        </div>

        <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <div className="surface-panel surface-noise rounded-[1.8rem] p-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/72 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Admin control plane
              </div>
              <h1 className="mt-5 max-w-5xl text-4xl font-semibold leading-[1.04] tracking-tight text-foreground sm:text-5xl">
                Mot trang de quan ly user, plan va quota thay vi nho SQL tung lan.
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Trang nay doc metadata trong orbitstack_control, hien MySQL account dang gan
                cho tung GitHub user va cho phep cap nhat plan/quota ngay tren giao dien.
              </p>

              <div className="mt-6 grid gap-4 lg:grid-cols-4">
                <MetricCard
                  icon={Users}
                  label="Users"
                  value={String(summary.totalUsers)}
                  helper="GitHub users da bootstrap vao control database"
                />
                <MetricCard
                  icon={Database}
                  label="Databases"
                  value={String(summary.totalDatabases)}
                  helper="Tong so database dang active tren he thong"
                />
                <MetricCard
                  icon={HardDrive}
                  label="Storage"
                  value={`${summary.totalStorageMb.toFixed(0)} MB`}
                  helper="Tong dung luong cache tu usage stats"
                />
                <MetricCard
                  icon={Signal}
                  label="Plans"
                  value={String(summary.planCount)}
                  helper={`${summary.totalConnections} ket noi dang duoc ghi nhan`}
                />
              </div>
            </div>

            <div className="surface-panel rounded-[1.5rem] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Search and filter
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Tim theo GitHub username, email, MySQL username, host allow hoac ten database.
                  </p>
                </div>
                <div className="relative w-full lg:max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="nhuthangl24 / gh_nhuthangl24 / 192.168.10.%"
                    className="h-11 bg-background/80 pl-9"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-[1.2rem] border border-rose-500/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-300">
                {error}
              </div>
            )}

            {loading ? (
              <div className="space-y-4">
                <LoadingCard />
                <LoadingCard />
              </div>
            ) : filteredUsers.length ? (
              <div className="space-y-4">
                {filteredUsers.map((user) => (
                  <UserCard
                    key={user.id}
                    user={user}
                    plans={overview?.plans || []}
                    draft={drafts[user.id] || buildDraftFromUser(user)}
                    saving={savingUserId === user.id}
                    onDraftChange={(patch) => updateDraft(user.id, patch)}
                    onPlanChange={(planCode) => handlePlanChange(user.id, planCode)}
                    onReset={() => resetDraft(user)}
                    onSave={() => void handleSave(user)}
                  />
                ))}
              </div>
            ) : (
              <div className="surface-panel rounded-[1.6rem] p-8 text-sm text-muted-foreground">
                Khong tim thay user nao khop bo loc hien tai.
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="surface-panel rounded-[1.5rem] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Access mode
              </p>
              <div className="mt-4 rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4">
                <p className="text-sm font-semibold text-foreground">
                  {overview?.accessMode === "allowlist"
                    ? "GitHub allowlist"
                    : "Development open mode"}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {overview?.accessMode === "allowlist"
                    ? `Allowed admins: ${(overview.allowedAdmins || []).join(", ")}`
                    : "Khong tim thay DATABASE_HOSTING_ADMIN_GITHUB_USERS nen dev mode dang cho phep moi GitHub session hop le truy cap. Dat env nay truoc khi deploy production."}
                </p>
              </div>
            </div>

            <div className="surface-panel rounded-[1.5rem] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Plan presets
              </p>
              <div className="mt-4 space-y-3">
                {(overview?.plans || []).map((plan) => (
                  <div
                    key={plan.code}
                    className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatMoney(plan.price)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {plan.maxDatabases} DB | {plan.maxStorageMb} MB | {plan.maxConnections} conn
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-panel rounded-[1.5rem] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Notes
              </p>
              <div className="mt-4 space-y-3">
                {[
                  "Cap nhat tren trang nay se doi ca users.plan_id lan quotas de UI va quota thuc te khop nhau.",
                  "Quota override van duoc giu tach biet voi preset plan, nen mày co the tinh chinh tung user.",
                  "Trang nay chi quan ly metadata app. Host allow cua MySQL account hien chi duoc hien thi de de doi soat.",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4 text-sm leading-6 text-foreground"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="surface-panel rounded-[1.5rem] p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Quick flow
              </p>
              <div className="mt-4 grid gap-3">
                {[
                  "1. Tim GitHub user can doi plan hoac quota.",
                  "2. Chon plan preset de nap quota mac dinh.",
                  "3. Neu can, sua tay 3 muc quota truoc khi save.",
                  "4. Luu xong thi user se thay doi ngay tren giao dien databases.",
                ].map((step) => (
                  <div
                    key={step}
                    className="rounded-[1rem] border border-border/70 bg-background/70 px-4 py-4 text-sm leading-6 text-foreground"
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}

export default function DatabaseAdminConsole() {
  return (
    <GitHubAccessGate>
      <DatabaseHostingAdminContent />
    </GitHubAccessGate>
  );
}
