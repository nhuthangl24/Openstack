"use client";

import { environments } from "@/lib/environments";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Boxes } from "lucide-react";

interface EnvironmentCheckboxesProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function EnvironmentCheckboxes({
  selected,
  onChange,
}: EnvironmentCheckboxesProps) {
  const toggleEnvironment = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-foreground/90 flex items-center gap-2">
        <Boxes className="w-4 h-4 text-chart-3" />
        Môi trường cài sẵn
      </Label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {environments.map((env) => {
          const isChecked = selected.includes(env.id);
          return (
            <label
              key={env.id}
              htmlFor={`env-${env.id}`}
              className={`
                flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer
                transition-all duration-200 border
                ${
                  isChecked
                    ? "bg-chart-1/10 border-chart-1/40 shadow-[0_0_12px_oklch(0.65_0.18_240_/_0.1)]"
                    : "bg-input/30 border-border/40 hover:border-border/70 hover:bg-input/50"
                }
              `}
            >
              <Checkbox
                id={`env-${env.id}`}
                checked={isChecked}
                onCheckedChange={() => toggleEnvironment(env.id)}
                className="data-[state=checked]:bg-chart-1 data-[state=checked]:border-chart-1"
              />
              <span className="text-lg" role="img" aria-label={env.label}>
                {env.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    isChecked ? "text-foreground" : "text-foreground/80"
                  }`}
                >
                  {env.label}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {env.description}
                </p>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
