import type { Metadata } from "next";
import DashboardClientShell from "@/components/DashboardClientShell";

export const metadata: Metadata = {
  title: "OrbitStack Terminal",
  description:
    "Trang terminal của OrbitStack: kết nối SSH, xem kịch bản triển khai và gửi lệnh trên một màn riêng.",
};

export default function TerminalPage() {
  return <DashboardClientShell tab="terminal" />;
}
