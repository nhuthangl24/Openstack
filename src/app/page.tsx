import Dashboard from "@/components/Dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CloudDeploy — VM Manager",
  description: "Deploy and manage virtual servers on OpenStack. Configure hardware, OS, and software — deploy instantly.",
};

export default function Home() {
  return <Dashboard />;
}
