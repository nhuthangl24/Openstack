import DashboardClientShell from "@/components/DashboardClientShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OrbitStack Tổng quan",
  description:
    "Màn tổng quan của OrbitStack: theo dõi OpenStack, GitHub và trạng thái điều hành hiện tại.",
};

export default function Home() {
  return <DashboardClientShell tab="mission" />;
}
