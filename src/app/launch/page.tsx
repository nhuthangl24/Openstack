import type { Metadata } from "next";
import DashboardClientShell from "@/components/DashboardClientShell";

export const metadata: Metadata = {
  title: "OrbitStack Tạo máy",
  description:
    "Trang tạo máy của OrbitStack: chọn preset, khởi tạo VM nhanh và nối tiếp sang triển khai.",
};

export default function LaunchPage() {
  return <DashboardClientShell tab="launch" />;
}
