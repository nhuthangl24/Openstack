"use client";

import { LaptopMinimal, MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const THEMES = [
  {
    value: "light" as const,
    label: "Light",
    icon: SunMedium,
  },
  {
    value: "dark" as const,
    label: "Dark",
    icon: MoonStar,
  },
  {
    value: "system" as const,
    label: "System",
    icon: LaptopMinimal,
  },
];

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const activeTheme = theme ?? "system";

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card/85 p-1 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.55)] backdrop-blur">
      {THEMES.map(({ value, label, icon: Icon }) => {
        const isActive = activeTheme === value;
        const isResolved =
          value !== "system" && resolvedTheme === value && theme === "system";

        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-all",
              isActive
                ? "bg-foreground text-background shadow-[0_12px_30px_-20px_rgba(2,6,23,0.9)]"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-pressed={isActive}
            title={value === "system" && resolvedTheme ? `System (${resolvedTheme})` : label}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
            {isResolved && (
              <span className="rounded-full bg-background/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em]">
                Live
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
