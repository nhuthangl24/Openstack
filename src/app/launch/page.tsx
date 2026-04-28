import type { Metadata } from "next";
import DashboardClientShell from "@/components/DashboardClientShell";

export const metadata: Metadata = {
  title: "OrbitStack Launch Kits",
  description:
    "Launch Kits cho OrbitStack: chọn preset, khởi tạo VM nhanh và kết nối sang pipeline deploy.",
};

export default function LaunchPage() {
  return <DashboardClientShell tab="launch" />;
}
