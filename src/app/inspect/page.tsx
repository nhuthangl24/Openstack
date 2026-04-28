import type { Metadata } from "next";
import DashboardClientShell from "@/components/DashboardClientShell";

export const metadata: Metadata = {
  title: "OrbitStack Inspector",
  description:
    "Inspector cho OrbitStack: khóa một VM, xem chi tiết, mở Web SSH và điều phối repo pipeline.",
};

export default function InspectPage() {
  return <DashboardClientShell tab="inspect" />;
}
