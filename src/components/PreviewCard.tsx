"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { flavors } from "@/lib/flavors";
import { environments as envList } from "@/lib/environments";
import {
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  Monitor,
  Boxes,
  Rocket,
  CircleDot,
} from "lucide-react";

interface PreviewCardProps {
  instanceName: string;
  flavor: string;
  os: string;
  selectedEnvironments: string[];
}

export default function PreviewCard({
  instanceName,
  flavor,
  os,
  selectedEnvironments,
}: PreviewCardProps) {
  const selectedFlavor = flavors.find((f) => f.name === flavor);
  const envDetails = envList.filter((e) =>
    selectedEnvironments.includes(e.id)
  );

  return (
    <Card className="overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm relative group">
      {/* Gradient top border */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-chart-1 via-chart-2 to-chart-3" />

      {/* Subtle glow effect */}
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-chart-1/5 rounded-full blur-3xl group-hover:bg-chart-1/10 transition-all duration-700" />

      <CardContent className="p-6 space-y-5 relative">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-chart-1/20 to-chart-2/20 border border-chart-1/30 flex items-center justify-center">
              <Server className="w-5 h-5 text-chart-1" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                VM Preview
              </p>
              <h3 className="text-base font-semibold text-foreground truncate max-w-[200px]">
                {instanceName || (
                  <span className="text-muted-foreground/50 italic font-normal">
                    Chưa đặt tên...
                  </span>
                )}
              </h3>
            </div>
          </div>
          <Badge
            variant="outline"
            className="border-chart-2/40 text-chart-2 bg-chart-2/10 text-[11px] px-2.5 py-1 animate-pulse-glow"
          >
            <CircleDot className="w-3 h-3 mr-1" />
            Ready to deploy
          </Badge>
        </div>

        <Separator className="bg-border/40" />

        {/* Flavor info */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">
            <Cpu className="w-3.5 h-3.5" />
            Cấu hình
          </div>
          {selectedFlavor ? (
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-chart-1/8 border border-chart-1/15 p-2.5 text-center">
                <Cpu className="w-4 h-4 text-chart-1 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">vCPU</p>
                <p className="text-sm font-bold text-chart-1">
                  {selectedFlavor.vcpus}
                </p>
              </div>
              <div className="rounded-lg bg-chart-2/8 border border-chart-2/15 p-2.5 text-center">
                <MemoryStick className="w-4 h-4 text-chart-2 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">RAM</p>
                <p className="text-sm font-bold text-chart-2">
                  {selectedFlavor.ram}
                </p>
              </div>
              <div className="rounded-lg bg-chart-3/8 border border-chart-3/15 p-2.5 text-center">
                <HardDrive className="w-4 h-4 text-chart-3 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">Disk</p>
                <p className="text-sm font-bold text-chart-3">
                  {selectedFlavor.disk}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/50 italic pl-1">
              Chưa chọn flavor...
            </p>
          )}
          {selectedFlavor && (
            <p className="text-xs text-muted-foreground font-mono bg-secondary/50 rounded-md px-2.5 py-1.5 inline-block">
              {selectedFlavor.name}
            </p>
          )}
        </div>

        <Separator className="bg-border/40" />

        {/* OS */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">
            <Monitor className="w-3.5 h-3.5" />
            Hệ điều hành
          </div>
          <div className="flex items-center gap-2 pl-1">
            <span className="text-base">🐧</span>
            <span className="text-sm font-medium text-foreground/90">
              {os}
            </span>
          </div>
        </div>

        <Separator className="bg-border/40" />

        {/* Environments */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-medium">
            <Boxes className="w-3.5 h-3.5" />
            Môi trường ({envDetails.length})
          </div>
          {envDetails.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {envDetails.map((env) => (
                <Badge
                  key={env.id}
                  variant="secondary"
                  className="bg-secondary/70 text-secondary-foreground/90 border border-border/30 text-xs px-2.5 py-1 gap-1"
                >
                  <span>{env.icon}</span>
                  {env.label}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/50 italic pl-1">
              Chưa chọn môi trường...
            </p>
          )}
        </div>

        <Separator className="bg-border/40" />

        {/* Deploy readiness */}
        <div className="flex items-center gap-2 bg-chart-2/5 rounded-lg p-3 border border-chart-2/15">
          <Rocket className="w-4 h-4 text-chart-2" />
          <span className="text-sm font-medium text-chart-2">
            Ready to deploy
          </span>
          <div className="ml-auto flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-chart-2 animate-pulse" />
            <div
              className="w-1.5 h-1.5 rounded-full bg-chart-2 animate-pulse"
              style={{ animationDelay: "0.2s" }}
            />
            <div
              className="w-1.5 h-1.5 rounded-full bg-chart-2 animate-pulse"
              style={{ animationDelay: "0.4s" }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
