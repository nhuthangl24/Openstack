import type { Metadata } from "next";
import DashboardClientShell from "@/components/DashboardClientShell";

export const metadata: Metadata = {
  title: "OrbitStack Terminal Lab",
  description:
    "Terminal Lab cho OrbitStack: SSH workspace rieng, workflow dock, command composer va transcript control tren mot trang doc lap.",
};

export default function TerminalPage() {
  return <DashboardClientShell tab="terminal" />;
}
