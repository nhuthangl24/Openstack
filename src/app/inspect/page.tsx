import type { Metadata } from "next";
import DashboardClientShell from "@/components/DashboardClientShell";

export const metadata: Metadata = {
  title: "OrbitStack Inspector",
  description:
    "Inspector cho OrbitStack: khoa mot VM, xem chi tiet, mo Terminal Lab va dieu phoi repo pipeline.",
};

export default function InspectPage() {
  return <DashboardClientShell tab="inspect" />;
}
