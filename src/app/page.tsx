import DashboardClientShell from "@/components/DashboardClientShell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OrbitStack Mission Board",
  description:
    "Mission Board cho OrbitStack: theo dõi toàn cảnh OpenStack, phiên GitHub và nhịp điều khiển hiện tại.",
};

export default function Home() {
  return <DashboardClientShell tab="mission" />;
}
