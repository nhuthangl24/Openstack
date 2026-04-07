"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Server, KeyRound, Cpu, Monitor, Package, Eye, EyeOff, ChevronRight, Rocket } from "lucide-react";
import { flavors, Flavor } from "@/lib/flavors";
import { environments, Environment } from "@/lib/environments";

interface CreateServerModalProps {
  onClose: () => void;
  onSuccess: (data: {
    vm_name: string; vm_id: string; status: string;
    flavor: string; os: string; password: string; environments: string[];
  }) => void;
}

interface OSImage { id: string; name: string; status: string; }

export default function CreateServerModal({ onClose, onSuccess }: CreateServerModalProps) {
  const [step, setStep] = useState(0); // 0=identity, 1=hardware, 2=os, 3=env, 4=review
  const [name, setName]           = useState("");
  const [password, setPassword]   = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [flavor, setFlavor]       = useState("");
  const [osImages, setOsImages]   = useState<OSImage[]>([]);
  const [osName, setOsName]       = useState("");
  const [envs, setEnvs]           = useState<string[]>([]);
  const [loadingOS, setLoadingOS] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]       = useState<Record<string, string>>({});
  const [nameError, setNameError] = useState("");

  // Fetch OS images on mount
  useEffect(() => {
    setLoadingOS(true);
    fetch("/api/images")
      .then(r => r.json())
      .then((list: any[]) => {
        const imgs = (Array.isArray(list) ? list : []).map(img => ({
          id:     img.ID   || img.id,
          name:   img.Name || img.name || "Unknown",
          status: img.Status || img.status || "",
        }));
        setOsImages(imgs);
        if (imgs.length > 0) setOsName(imgs[0].name);
      })
      .catch(() => {})
      .finally(() => setLoadingOS(false));
  }, []);

  // Escape to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const toggleEnv = (id: string) => {
    setEnvs(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const validateBasic = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Tên máy chủ là bắt buộc";
    else if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) e.name = "Chỉ dùng chữ, số, dấu chấm, gạch ngang";
    if (!password) e.password = "Mật khẩu là bắt buộc";
    else if (password.length < 8) e.password = "Tối thiểu 8 ký tự";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (step === 0 && !validateBasic()) return;
    if (step === 1 && !flavor) { setErrors({ flavor: "Chọn cấu hình máy" }); return; }
    if (step === 2 && !osName) { setErrors({ os: "Chọn hệ điều hành" }); return; }
    setErrors({});
    setStep(s => s + 1);
  };

  const handleDeploy = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/create-vm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      const data = await res.json();
      if (data.success) {
        onSuccess({ vm_name: data.vm_name || name, vm_id: data.vm_id || "", status: data.status, flavor, os: osName, password, environments: envs });
      } else {
        setErrors({ submit: data.error_message || data.error || "Tạo máy thất bại" });
        setStep(0);
      }
    } catch {
      setErrors({ submit: "Lỗi kết nối server" });
    } finally {
      setSubmitting(false);
    }
  };

  const STEPS = ["Identity", "Hardware", "OS", "Software", "Review"];
  const selectedFlavor = flavors.find(f => f.name === flavor);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">New Server</h2>
              <p className="text-xs text-gray-500">OpenStack VM • public network</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/8 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-0 px-6 pt-4 pb-3 border-b border-white/8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-0">
              <button
                onClick={() => { if (i < step) setStep(i); }}
                className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                  i === step ? "text-white" : i < step ? "text-gray-400 cursor-pointer hover:text-white" : "text-gray-600 cursor-default"
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  i < step ? "bg-white text-black" : i === step ? "bg-white/20 text-white border border-white/30" : "bg-white/5 text-gray-600"
                }`}>{i + 1}</span>
                {s}
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className={`w-3 h-3 mx-2 ${i < step ? "text-gray-400" : "text-gray-700"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Error banner */}
          {errors.submit && (
            <div className="px-4 py-3 rounded-lg bg-red-950/40 border border-red-800/40 text-sm text-red-400">
              {errors.submit}
            </div>
          )}

          {/* ─── Step 0: Identity ─── */}
          {step === 0 && (
            <div className="space-y-4">
              <SectionHeader icon={<Server className="w-4 h-4" />} title="Server Identity" desc="Đặt tên và tạo mật khẩu SSH" />

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Server Name</label>
                <input
                  autoFocus
                  value={name}
                  onChange={e => { setName(e.target.value); setErrors({}); }}
                  placeholder="web-server-01"
                  className={`w-full h-10 px-3 rounded-lg bg-white/5 border text-sm text-white placeholder:text-gray-600 outline-none transition-colors focus:border-white/30 ${errors.name ? "border-red-500/50" : "border-white/10"}`}
                />
                {errors.name && <p className="text-xs text-red-400">{errors.name}</p>}
                <p className="text-xs text-gray-600">Chỉ dùng chữ, số, dấu chấm, gạch ngang, gạch dưới</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">SSH Password</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrors({}); }}
                    placeholder="Tối thiểu 8 ký tự"
                    className={`w-full h-10 px-3 pr-10 rounded-lg bg-white/5 border text-sm text-white placeholder:text-gray-600 outline-none transition-colors focus:border-white/30 ${errors.password ? "border-red-500/50" : "border-white/10"}`}
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-red-400">{errors.password}</p>}
                {/* Password strength */}
                {password.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {[1,2,3,4].map(i => (
                        <div key={i} className={`h-1 w-8 rounded-full transition-colors ${
                          password.length >= i * 3 ? (password.length >= 12 ? "bg-green-500" : password.length >= 8 ? "bg-yellow-500" : "bg-red-500") : "bg-white/10"
                        }`} />
                      ))}
                    </div>
                    <span className="text-xs text-gray-500">{password.length >= 12 ? "Strong" : password.length >= 8 ? "Good" : "Weak"}</span>
                  </div>
                )}
                <p className="text-xs text-gray-600">Dùng cho cả ubuntu và root. Thay đổi ngay sau khi deploy.</p>
              </div>
            </div>
          )}

          {/* ─── Step 1: Hardware ─── */}
          {step === 1 && (
            <div className="space-y-4">
              <SectionHeader icon={<Cpu className="w-4 h-4" />} title="Hardware" desc="Chọn cấu hình CPU, RAM và Disk" />
              {errors.flavor && <p className="text-xs text-red-400">{errors.flavor}</p>}
              <div className="space-y-2">
                {flavors.map((f: Flavor) => (
                  <button
                    key={f.name}
                    onClick={() => { setFlavor(f.name); setErrors({}); }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all ${
                      flavor === f.name
                        ? "border-white/40 bg-white/8"
                        : "border-white/8 bg-white/3 hover:border-white/20 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${flavor === f.name ? "border-white" : "border-white/30"}`}>
                        {flavor === f.name && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span className="text-sm font-medium text-white font-mono">{f.name}</span>
                    </div>
                    <div className="flex items-center gap-5 text-xs text-gray-400">
                      <span>{f.vcpus} vCPU</span>
                      <span>{f.ram} RAM</span>
                      <span>{f.disk} Disk</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Step 2: OS ─── */}
          {step === 2 && (
            <div className="space-y-4">
              <SectionHeader icon={<Monitor className="w-4 h-4" />} title="Operating System" desc="Chọn image hệ điều hành" />
              {errors.os && <p className="text-xs text-red-400">{errors.os}</p>}
              {loadingOS ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />Đang tải danh sách OS...
                </div>
              ) : osImages.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">Không tìm thấy image nào trong OpenStack.</p>
              ) : (
                <div className="space-y-2">
                  {osImages.map(img => (
                    <button
                      key={img.id}
                      onClick={() => { setOsName(img.name); setErrors({}); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all ${
                        osName === img.name
                          ? "border-white/40 bg-white/8"
                          : "border-white/8 bg-white/3 hover:border-white/20 hover:bg-white/5"
                      }`}
                    >
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${osName === img.name ? "border-white" : "border-white/30"}`}>
                        {osName === img.name && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span className="text-xl">🐧</span>
                      <div>
                        <p className="text-sm font-medium text-white">{img.name}</p>
                        <p className="text-xs text-gray-500">{img.status}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Step 3: Software/Env ─── */}
          {step === 3 && (
            <div className="space-y-4">
              <SectionHeader icon={<Package className="w-4 h-4" />} title="Preinstall Software" desc="Chọn môi trường cài đặt sẵn (cloud-init)" />
              <div className="flex flex-wrap gap-2">
                {environments.map((env: Environment) => {
                  const selected = envs.includes(env.id);
                  return (
                    <button
                      key={env.id}
                      onClick={() => toggleEnv(env.id)}
                      title={env.description}
                      className={`env-chip px-3 py-1.5 rounded-md text-sm border transition-all ${
                        selected
                          ? "bg-white text-black border-white font-medium"
                          : "bg-transparent text-gray-400 border-white/15 hover:text-white"
                      }`}
                    >
                      {env.label}
                    </button>
                  );
                })}
              </div>
              {envs.length === 0 ? (
                <p className="text-xs text-gray-600">Không chọn nào = chỉ cài base OS + SSH.</p>
              ) : (
                <p className="text-xs text-gray-500">{envs.length} packages sẽ được cài via cloud-init</p>
              )}
            </div>
          )}

          {/* ─── Step 4: Review ─── */}
          {step === 4 && (
            <div className="space-y-4">
              <SectionHeader icon={<Rocket className="w-4 h-4" />} title="Review & Deploy" desc="Kiểm tra lại cấu hình trước khi deploy" />

              <div className="rounded-lg border border-white/10 divide-y divide-white/8">
                <ReviewRow label="Server Name" value={<span className="font-mono">{name}</span>} />
                <ReviewRow label="SSH Password" value={<span className="font-mono blur-sm hover:blur-none transition-all">{password}</span>} />
                <ReviewRow label="Flavor" value={
                  <span>{flavor} {selectedFlavor && <span className="text-gray-500 text-xs">· {selectedFlavor.vcpus} vCPU · {selectedFlavor.ram} · {selectedFlavor.disk}</span>}</span>
                } />
                <ReviewRow label="OS" value={<span>🐧 {osName}</span>} />
                <ReviewRow label="Network" value="public" />
                <ReviewRow label="Preinstall" value={envs.length > 0 ? envs.join(", ") : <span className="text-gray-500">None</span>} />
              </div>

              <div className="px-4 py-3 rounded-lg bg-amber-950/30 border border-amber-800/30 text-xs text-amber-400/80">
                ⚠️ Cloud-init sẽ cài đặt sau khi VM khởi động. SSH sẵn sàng sau ~60 giây.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 flex items-center justify-between">
          <button
            onClick={step === 0 ? onClose : () => setStep(s => s - 1)}
            className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-all"
          >
            {step === 0 ? "Cancel" : "← Back"}
          </button>

          {step < 4 ? (
            <button
              onClick={handleNext}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-white text-black hover:bg-gray-100 transition-all"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleDeploy}
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold bg-white text-black hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Deploying...</>
              ) : (
                <><Rocket className="w-4 h-4" /> Deploy Server</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 pb-1">
      <div className="w-8 h-8 rounded-lg bg-white/8 border border-white/10 flex items-center justify-center text-gray-300 flex-shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}
