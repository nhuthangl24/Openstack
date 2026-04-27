"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { environments, type Environment } from "@/lib/environments";
import { flavors } from "@/lib/flavors";
import { serverPresets } from "@/lib/presets";

interface CreateServerModalProps {
  initialPresetKey?: string | null;
  onClose: () => void;
  onSuccess: (data: {
    vm_name: string;
    vm_id: string;
    status: string;
    flavor: string;
    os: string;
    password: string;
    environments: string[];
  }) => void;
}

interface OSImage {
  id: string;
  name: string;
  status: string;
}

function buildSuggestedName(prefix: string) {
  const stamp = new Date().toISOString().slice(5, 10).replace("-", "");
  const suffix = Math.floor(Math.random() * 90 + 10);
  return `${prefix}-${stamp}-${suffix}`;
}

function generateStrongPassword() {
  const charset =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?";

  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const values = new Uint32Array(16);
    window.crypto.getRandomValues(values);
    return Array.from(values, (value) => charset[value % charset.length]).join("");
  }

  return `Open${Math.random().toString(36).slice(2, 10)}#${Math.floor(
    100 + Math.random() * 900,
  )}`;
}

export default function CreateServerModal({
  initialPresetKey,
  onClose,
  onSuccess,
}: CreateServerModalProps) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [flavor, setFlavor] = useState("");
  const [osImages, setOsImages] = useState<OSImage[]>([]);
  const [osName, setOsName] = useState("");
  const [selectedPresetKey, setSelectedPresetKey] = useState(
    initialPresetKey ?? "",
  );
  const [envs, setEnvs] = useState<string[]>([]);
  const [loadingOS, setLoadingOS] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const activePreset = serverPresets.find((item) => item.key === selectedPresetKey);

  useEffect(() => {
    setLoadingOS(true);

    fetch("/api/images")
      .then((response) => response.json())
      .then((items: Array<Record<string, string>> | { error?: string }) => {
        if (!Array.isArray(items)) {
          return;
        }

        const normalized = items.map((item) => ({
          id: item.ID || item.id,
          name: item.Name || item.name || "Unknown image",
          status: item.Status || item.status || "Unknown",
        }));

        setOsImages(normalized);

        if (normalized.length > 0) {
          setOsName((current) => current || normalized[0].name);
        }
      })
      .catch(() => {
        setErrors((current) => ({
          ...current,
          os: "Khong tai duoc danh sach image tu OpenStack.",
        }));
      })
      .finally(() => setLoadingOS(false));
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (!initialPresetKey) {
      return;
    }

    const preset = serverPresets.find((item) => item.key === initialPresetKey);

    if (!preset) {
      return;
    }

    setSelectedPresetKey(preset.key);
    setFlavor(preset.flavor);
    setEnvs(preset.environments);
    setName((current) => current || buildSuggestedName(preset.namePrefix));
    setPassword((current) => current || generateStrongPassword());
  }, [initialPresetKey]);

  function toggleEnv(id: string) {
    setEnvs((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function applyPreset(presetKey: string) {
    const preset = serverPresets.find((item) => item.key === presetKey);

    if (!preset) {
      return;
    }

    setSelectedPresetKey(preset.key);
    setFlavor(preset.flavor);
    setEnvs(preset.environments);
    setName(buildSuggestedName(preset.namePrefix));

    if (!password) {
      setPassword(generateStrongPassword());
    }
  }

  function validate() {
    const nextErrors: Record<string, string> = {};

    if (!name.trim()) {
      nextErrors.name = "Ten may la bat buoc.";
    } else if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
      nextErrors.name =
        "Ten may chi duoc dung chu, so, dau cham, gach ngang va gach duoi.";
    }

    if (!password.trim()) {
      nextErrors.password = "Mat khau SSH la bat buoc.";
    } else if (password.length < 8) {
      nextErrors.password = "Mat khau can it nhat 8 ky tu.";
    }

    if (!flavor) {
      nextErrors.flavor = "Hay chon mot flavor cho VM.";
    }

    if (!osName) {
      nextErrors.os = "Hay chon mot image he dieu hanh.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleDeploy() {
    if (!validate()) {
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/create-vm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instance_name: name,
          hostname: name,
          password,
          flavor,
          os: osName,
          network: "public",
          environments: envs,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error_message || data.error || "Tao may that bai.");
      }

      onSuccess({
        vm_name: data.vm_name || name,
        vm_id: data.vm_id || "",
        status: data.status || "BUILD",
        flavor,
        os: osName,
        password,
        environments: envs,
      });
    } catch (submitError) {
      setErrors({
        submit:
          submitError instanceof Error
            ? submitError.message
            : "Khong the tao VM o thoi diem hien tai.",
      });
    } finally {
      setSubmitting(false);
    }
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
      <div className="surface-panel relative flex h-[calc(100dvh-1.5rem)] w-full max-w-6xl min-h-0 flex-col overflow-hidden rounded-[2rem] sm:h-[min(56rem,calc(100dvh-3rem))]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-foreground text-background shadow-[0_16px_40px_-24px_rgba(15,23,42,0.7)]">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Launch Control
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                Tao VM moi theo giao dien moi
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Chon preset, tinh chinh hardware, chon image va software can cai.
                Moi thu duoc review ngay o cot ben phai truoc khi deploy.
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

        <div className="flex-1 overflow-y-auto overscroll-contain xl:overflow-hidden">
          <div className="grid min-h-full gap-0 xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="px-5 py-5 pb-8 sm:px-6 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain">
              {errors.submit && (
                <div className="mb-5 rounded-[1.4rem] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 dark:text-rose-300">
                  {errors.submit}
                </div>
              )}

              <section className="space-y-4">
                <SectionHeading
                  kicker="1. Preset"
                  title="Khoi tao nhanh bang template"
                  description="Preset se dien san flavor va software stack de ban khong phai cau hinh lai tu dau."
                />
                <div className="grid gap-3 lg:grid-cols-3">
                  {serverPresets.map((preset) => {
                    const selected = preset.key === selectedPresetKey;

                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => applyPreset(preset.key)}
                        className={`rounded-[1.5rem] border p-4 text-left transition ${
                          selected
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border/70 bg-background/65 text-foreground hover:border-primary/25"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-base font-semibold tracking-tight">
                            {preset.label}
                          </p>
                          {selected && <Check className="h-4 w-4" />}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {preset.description}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {preset.highlights.map((item) => (
                            <span
                              key={item}
                              className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="mt-8 space-y-4">
                <SectionHeading
                  kicker="2. Identity"
                  title="Ten may va credential SSH"
                  description="Ban co the dung nut generate de lay ten may goi y va mat khau manh ngay lap tuc."
                />

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[1.5rem] border border-border/70 bg-background/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Ten may
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setName(
                            buildSuggestedName(activePreset?.namePrefix ?? "vm"),
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Goi y ten
                      </button>
                    </div>
                    <input
                      autoFocus
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        setErrors((current) => ({ ...current, name: "" }));
                      }}
                      placeholder="api-0427-21"
                      className={`mt-3 h-12 w-full rounded-[1rem] border bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none ${
                        errors.name
                          ? "border-rose-500/40"
                          : "border-border/70 focus:border-primary/35"
                      }`}
                    />
                    {errors.name ? (
                      <p className="mt-2 text-xs text-rose-300">{errors.name}</p>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Dung chu, so, dau cham, gach ngang va gach duoi.
                      </p>
                    )}
                  </div>

                  <div className="rounded-[1.5rem] border border-border/70 bg-background/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Mat khau SSH
                      </label>
                      <button
                        type="button"
                        onClick={() => setPassword(generateStrongPassword())}
                        className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        Tao manh
                      </button>
                    </div>

                    <div className="relative mt-3">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setErrors((current) => ({ ...current, password: "" }));
                        }}
                        placeholder="It nhat 8 ky tu"
                        className={`h-12 w-full rounded-[1rem] border bg-card px-4 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none ${
                          errors.password
                            ? "border-rose-500/40"
                            : "border-border/70 focus:border-primary/35"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {errors.password ? (
                      <p className="mt-2 text-xs text-rose-300">{errors.password}</p>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Mat khau se ap dung cho ca tai khoan ubuntu va root.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className="mt-8 space-y-4">
                <SectionHeading
                  kicker="3. Hardware"
                  title="Chon flavor cho workload"
                  description="Can bang CPU, RAM va dung luong phu hop de do phai resize lai sau nay."
                />

                {errors.flavor && (
                  <p className="text-sm text-rose-300">{errors.flavor}</p>
                )}

                <div className="grid gap-3 lg:grid-cols-2">
                  {flavors.map((item) => {
                    const selected = item.name === flavor;

                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => {
                          setFlavor(item.name);
                          setErrors((current) => ({ ...current, flavor: "" }));
                        }}
                        className={`rounded-[1.4rem] border p-4 text-left transition ${
                          selected
                            ? "border-primary/40 bg-primary/10"
                            : "border-border/70 bg-background/65 hover:border-primary/25"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-base font-semibold text-foreground">
                              {item.name}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {item.vcpus} vCPU • {item.ram} RAM • {item.disk} Disk
                            </p>
                          </div>
                          {selected && (
                            <span className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">
                              Active
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="mt-8 space-y-4">
                <SectionHeading
                  kicker="4. Image"
                  title="Chon he dieu hanh"
                  description="Danh sach image duoc lay truc tiep tu OpenStack nen se bam dung moi truong hien tai."
                />

                {errors.os && <p className="text-sm text-rose-300">{errors.os}</p>}

                <div className="rounded-[1.6rem] border border-border/70 bg-background/70 p-4">
                  {loadingOS ? (
                    <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Dang tai danh sach image...
                    </div>
                  ) : osImages.length === 0 ? (
                    <div className="py-8 text-sm text-muted-foreground">
                      Khong tim thay image nao tu OpenStack.
                    </div>
                  ) : (
                    <div className="grid max-h-72 gap-3 overflow-y-auto pr-1">
                      {osImages.map((image) => {
                        const selected = image.name === osName;

                        return (
                          <button
                            key={image.id}
                            type="button"
                            onClick={() => {
                              setOsName(image.name);
                              setErrors((current) => ({ ...current, os: "" }));
                            }}
                            className={`rounded-[1.2rem] border p-4 text-left transition ${
                              selected
                                ? "border-primary/40 bg-primary/10"
                                : "border-border/70 bg-card hover:border-primary/25"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  {image.name}
                                </p>
                                <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                  {image.status}
                                </p>
                              </div>
                              {selected && <Check className="h-4 w-4 text-primary" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>

              <section className="mt-8 space-y-4">
                <SectionHeading
                  kicker="5. Software"
                  title="Chon stack cai san"
                  description="Cac package nay se duoc cai qua cloud-init sau khi VM khoi dong."
                />

                <div className="grid gap-3 lg:auto-rows-fr lg:grid-cols-2">
                  {environments.map((env) => (
                    <EnvironmentCard
                      key={env.id}
                      env={env}
                      selected={envs.includes(env.id)}
                      onToggle={() => toggleEnv(env.id)}
                    />
                  ))}
                </div>
              </section>
            </div>

            <aside className="border-t border-border/70 bg-background/45 px-5 py-5 pb-6 xl:flex xl:min-h-0 xl:flex-col xl:border-l xl:border-t-0 xl:px-6">
              <div className="space-y-4 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
                <div className="rounded-[1.6rem] border border-border/70 bg-card/85 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Review
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    {name || "Ten VM se hien o day"}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {activePreset
                      ? `Preset dang dung: ${activePreset.label}.`
                      : "Ban dang custom mot cau hinh hoan toan moi."}
                  </p>

                  <div className="mt-5 space-y-3">
                    <SummaryRow label="Network" value="public" />
                    <SummaryRow label="Flavor" value={flavor || "Chua chon"} />
                    <SummaryRow label="Image" value={osName || "Chua chon"} />
                    <SummaryRow
                      label="Package"
                      value={envs.length ? `${envs.length} lua chon` : "Khong cai san"}
                    />
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-border/70 bg-card/85 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                    Checklist
                  </p>
                  <div className="mt-4 space-y-3">
                    <ChecklistItem done={Boolean(name)} label="Da co ten may" />
                    <ChecklistItem done={password.length >= 8} label="Mat khau du manh" />
                    <ChecklistItem done={Boolean(flavor)} label="Flavor da chon" />
                    <ChecklistItem done={Boolean(osName)} label="Image da chon" />
                  </div>
                </div>

                <div className="rounded-[1.6rem] border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200 dark:text-emerald-300">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <p>
                      Cloud-init se tu cai package sau khi VM boot. Thuong can khoang
                      30 den 60 giay truoc khi SSH san sang hoan toan.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 xl:mt-4 xl:border-t xl:border-border/70 xl:pt-5">
                <button
                  type="button"
                  onClick={handleDeploy}
                  disabled={submitting}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Dang deploy...
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4" />
                      Deploy VM ngay
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center justify-center rounded-full border border-border/70 bg-background/70 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-primary/35 hover:text-primary"
                >
                  Dong panel
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        {kicker}
      </p>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function EnvironmentCard({
  env,
  selected,
  onToggle,
}: {
  env: Environment;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`env-chip h-full rounded-[1.4rem] border p-4 text-left ${
        selected
          ? "border-primary/40 bg-primary/10"
          : "border-border/70 bg-background/65 hover:border-primary/25"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{env.label}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {env.description}
          </p>
        </div>
        {selected && (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background">
            <Check className="h-4 w-4" />
          </span>
        )}
      </div>
    </button>
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
    <div className="flex items-center justify-between gap-3 rounded-[1.15rem] border border-border/70 bg-background/70 px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <span className="max-w-[62%] truncate text-sm font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}

function ChecklistItem({
  done,
  label,
}: {
  done: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[1.1rem] border border-border/70 bg-background/70 px-4 py-3">
      <span
        className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
          done ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
        }`}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  );
}
