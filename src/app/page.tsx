import Dashboard from "@/components/Dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OrbitStack Console",
  description:
    "Điều phối máy ảo OpenStack, kết nối GitHub và mở Web SSH trong một giao diện mới gọn gàng hơn.",
};

export default function Home() {
  return <Dashboard />;
}
