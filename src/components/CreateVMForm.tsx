"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import FlavorSelect from "@/components/FlavorSelect";
import EnvironmentCheckboxes from "@/components/EnvironmentCheckboxes";
import PreviewCard from "@/components/PreviewCard";
import { toast } from "sonner";
import {
  Server,
  Eye,
  EyeOff,
  KeyRound,
  Monitor,
  Loader2,
  Rocket,
  Sparkles,
} from "lucide-react";

const DEFAULT_OS = "Ubuntu 24.04 LTS";

export default function CreateVMForm() {
  const [instanceName, setInstanceName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [flavor, setFlavor] = useState("");
  const [selectedEnvs, setSelectedEnvs] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!instanceName.trim()) {
      newErrors.instanceName = "Tên máy là bắt buộc";
    } else {
      const nameRegex = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
      if (!nameRegex.test(instanceName)) {
        newErrors.instanceName =
          "Tên chỉ chứa chữ, số, dấu chấm, gạch nối, gạch dưới";
      }
    }

    if (!password) {
      newErrors.password = "Mật khẩu SSH là bắt buộc";
    } else if (password.length < 8) {
      newErrors.password = "Mật khẩu tối thiểu 8 ký tự";
    }

    if (!flavor) {
      newErrors.flavor = "Vui lòng chọn cấu hình máy";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/create-vm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instance_name: instanceName,
          password,
          flavor,
          os: DEFAULT_OS,
          environments: selectedEnvs,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Máy ảo "${instanceName}" đang được tạo!`, {
          description: `Flavor: ${flavor} | Status: ${data.status}`,
          duration: 5000,
        });
        // Reset form
        setInstanceName("");
        setPassword("");
        setFlavor("");
        setSelectedEnvs([]);
        setErrors({});
      } else {
        toast.error("Không thể tạo máy ảo", {
          description: data.error,
        });
      }
    } catch {
      toast.error("Lỗi kết nối", {
        description: "Không thể kết nối tới server. Vui lòng thử lại.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
      {/* Form Column */}
      <div className="lg:col-span-3">
        <Card className="border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden relative">
          {/* Top gradient line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-chart-1 via-chart-3 to-chart-2" />

          <CardHeader className="pb-2 pt-6 px-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-chart-1/20 to-chart-2/20 border border-chart-1/30 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-chart-1" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Tạo máy ảo mới
                </h2>
                <p className="text-sm text-muted-foreground">
                  Cấu hình và triển khai instance trên OpenStack
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-6 pb-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Instance Name */}
              <div className="space-y-2">
                <Label
                  htmlFor="instance-name"
                  className="text-sm font-medium text-foreground/90 flex items-center gap-2"
                >
                  <Server className="w-4 h-4 text-chart-1" />
                  Tên máy
                </Label>
                <Input
                  id="instance-name"
                  placeholder="vd: web-server-01"
                  value={instanceName}
                  onChange={(e) => {
                    setInstanceName(e.target.value);
                    if (errors.instanceName)
                      setErrors((prev) => ({
                        ...prev,
                        instanceName: "",
                      }));
                  }}
                  className={`h-11 bg-input/50 border-border/60 placeholder:text-muted-foreground/40 focus:border-chart-1/50 focus:ring-chart-1/20 ${
                    errors.instanceName
                      ? "border-destructive/60 focus:border-destructive/60"
                      : ""
                  }`}
                />
                {errors.instanceName && (
                  <p className="text-xs text-destructive mt-1 animate-in fade-in-0 slide-in-from-top-1">
                    {errors.instanceName}
                  </p>
                )}
              </div>

              {/* SSH Password */}
              <div className="space-y-2">
                <Label
                  htmlFor="ssh-password"
                  className="text-sm font-medium text-foreground/90 flex items-center gap-2"
                >
                  <KeyRound className="w-4 h-4 text-chart-4" />
                  Mật khẩu SSH
                </Label>
                <div className="relative">
                  <Input
                    id="ssh-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Tối thiểu 8 ký tự"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password)
                        setErrors((prev) => ({ ...prev, password: "" }));
                    }}
                    className={`h-11 bg-input/50 border-border/60 placeholder:text-muted-foreground/40 pr-11 focus:border-chart-1/50 focus:ring-chart-1/20 ${
                      errors.password
                        ? "border-destructive/60 focus:border-destructive/60"
                        : ""
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={
                      showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive mt-1 animate-in fade-in-0 slide-in-from-top-1">
                    {errors.password}
                  </p>
                )}
                {password.length > 0 && password.length < 8 && !errors.password && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-destructive/70 transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            (password.length / 8) * 100,
                            100
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {password.length}/8
                    </span>
                  </div>
                )}
                {password.length >= 8 && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 rounded-full bg-chart-2" />
                    <span className="text-[10px] text-chart-2">Đủ mạnh</span>
                  </div>
                )}
              </div>

              <Separator className="bg-border/30" />

              {/* Flavor Select */}
              <div>
                <FlavorSelect value={flavor} onChange={(v) => {
                  setFlavor(v);
                  if (errors.flavor) setErrors((prev) => ({ ...prev, flavor: "" }));
                }} />
                {errors.flavor && (
                  <p className="text-xs text-destructive mt-1 animate-in fade-in-0 slide-in-from-top-1">
                    {errors.flavor}
                  </p>
                )}
              </div>

              <Separator className="bg-border/30" />

              {/* OS (readonly) */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground/90 flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-chart-2" />
                  Hệ điều hành
                </Label>
                <div className="flex items-center gap-3 rounded-xl bg-input/30 border border-border/40 px-4 py-3">
                  <span className="text-xl">🐧</span>
                  <div>
                    <p className="text-sm font-medium text-foreground/90">
                      {DEFAULT_OS}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Mặc định • Không thể thay đổi
                    </p>
                  </div>
                </div>
              </div>

              <Separator className="bg-border/30" />

              {/* Environment Checkboxes */}
              <EnvironmentCheckboxes
                selected={selectedEnvs}
                onChange={setSelectedEnvs}
              />

              <Separator className="bg-border/30" />

              {/* Submit */}
              <Button
                id="submit-create-vm"
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-chart-1 to-chart-2 hover:from-chart-1/90 hover:to-chart-2/90 text-white shadow-lg shadow-chart-1/20 hover:shadow-chart-1/30 transition-all duration-300 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Đang tạo máy ảo...
                  </>
                ) : (
                  <>
                    <Rocket className="w-5 h-5 mr-2" />
                    Tạo máy
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Preview Column */}
      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-6 space-y-4">
          <PreviewCard
            instanceName={instanceName}
            flavor={flavor}
            os={DEFAULT_OS}
            selectedEnvironments={selectedEnvs}
          />

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-card/60 border border-border/40 p-4 text-center backdrop-blur-sm">
              <p className="text-2xl font-bold text-chart-1">
                {selectedEnvs.length}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Packages
              </p>
            </div>
            <div className="rounded-xl bg-card/60 border border-border/40 p-4 text-center backdrop-blur-sm">
              <p className="text-2xl font-bold text-chart-2">
                {flavor ? "✓" : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Flavor
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
