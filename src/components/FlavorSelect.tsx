"use client";

import { flavors, formatFlavor } from "@/lib/flavors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Cpu, HardDrive, MemoryStick } from "lucide-react";

interface FlavorSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export default function FlavorSelect({ value, onChange }: FlavorSelectProps) {
  const selectedFlavor = flavors.find((f) => f.name === value);

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-foreground/90 flex items-center gap-2">
        <Cpu className="w-4 h-4 text-chart-1" />
        Cấu hình máy (Flavor)
      </Label>
      <Select value={value} onValueChange={(v) => { if (v) onChange(v); }}>
        <SelectTrigger
          id="flavor-select"
          className="w-full h-11 bg-input/50 border-border/60 hover:border-chart-1/50 transition-colors cursor-pointer"
        >
          <SelectValue placeholder="Chọn cấu hình máy ảo..." />
        </SelectTrigger>
        <SelectContent className="bg-popover border-border/60 max-h-[300px]">
          {flavors.map((flavor) => (
            <SelectItem
              key={flavor.name}
              value={flavor.name}
              className="cursor-pointer hover:bg-accent focus:bg-accent py-2.5"
            >
              <span className="font-mono text-sm">
                {formatFlavor(flavor)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Flavor details card */}
      {selectedFlavor && (
        <div className="grid grid-cols-3 gap-2 mt-3 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <div className="flex items-center gap-2 rounded-lg bg-chart-1/10 border border-chart-1/20 px-3 py-2">
            <Cpu className="w-4 h-4 text-chart-1" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                vCPU
              </p>
              <p className="text-sm font-semibold text-chart-1">
                {selectedFlavor.vcpus}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-chart-2/10 border border-chart-2/20 px-3 py-2">
            <MemoryStick className="w-4 h-4 text-chart-2" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                RAM
              </p>
              <p className="text-sm font-semibold text-chart-2">
                {selectedFlavor.ram}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-chart-3/10 border border-chart-3/20 px-3 py-2">
            <HardDrive className="w-4 h-4 text-chart-3" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Disk
              </p>
              <p className="text-sm font-semibold text-chart-3">
                {selectedFlavor.disk}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
