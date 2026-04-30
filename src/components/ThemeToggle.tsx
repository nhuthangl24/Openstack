"use client";

import { useSyncExternalStore } from "react";
import { LaptopMinimal, MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const THEMES = [
  {
    value: "light" as const,
    label: "Sáng",
    icon: SunMedium,
  },
  {
    value: "dark" as const,
    label: "Tối",
    icon: MoonStar,
  },
  {
    value: "system" as const,
    label: "Hệ thống",
    icon: LaptopMinimal,
  },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const activeTheme = mounted ? theme ?? "system" : "system";

  return (
    <div className="inline-grid w-full grid-cols-3 gap-1 rounded-[0.9rem] border border-border/80 bg-card/95 p-1 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.42)] sm:w-auto">
      {THEMES.map(({ value, label, icon: Icon }) => {
        const isActive = activeTheme === value;
        const buttonTitle =
          value === "system" && mounted ? "Hệ thống" : label;

        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex min-w-0 items-center justify-center gap-2 rounded-[0.7rem] px-3.5 py-2.5 text-[12px] font-semibold transition-all",
              isActive
                ? "bg-foreground text-background shadow-[0_10px_24px_-18px_rgba(2,6,23,0.9)]"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
            aria-pressed={isActive}
            title={buttonTitle}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
