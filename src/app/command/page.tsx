import type { Metadata } from "next";
import DashboardClientShell from "@/components/DashboardClientShell";

export const metadata: Metadata = {
  title: "OrbitStack Command Deck",
  description:
    "Command Deck cho OrbitStack: xem trạng thái runtime, GitHub session, deploy workflow và command summary.",
};

export default function CommandPage() {
  return <DashboardClientShell tab="command" />;
}
