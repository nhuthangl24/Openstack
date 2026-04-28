import type { Metadata } from "next";
import DashboardClientShell from "@/components/DashboardClientShell";

export const metadata: Metadata = {
  title: "OrbitStack Fleet Matrix",
  description:
    "Fleet Matrix cho OrbitStack: lọc, sắp xếp, đồng bộ và thao tác trực tiếp trên toàn bộ VM OpenStack.",
};

export default function FleetPage() {
  return <DashboardClientShell tab="fleet" />;
}
