import type { Metadata } from "next";
import DashboardClientShell from "@/components/DashboardClientShell";

export const metadata: Metadata = {
  title: "OrbitStack Theo dõi",
  description:
    "Trang theo dõi của OrbitStack: khóa một VM, xem chi tiết, mở terminal và điều phối triển khai repo.",
};

export default function InspectPage() {
  return <DashboardClientShell tab="inspect" />;
}
