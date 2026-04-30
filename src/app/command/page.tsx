import type { Metadata } from "next";
import DashboardClientShell from "@/components/DashboardClientShell";

export const metadata: Metadata = {
  title: "OrbitStack Điều phối",
  description:
    "Trang điều phối của OrbitStack: xem trạng thái runtime, phiên GitHub, kịch bản triển khai và thông tin vận hành.",
};

export default function CommandPage() {
  return <DashboardClientShell tab="command" />;
}
