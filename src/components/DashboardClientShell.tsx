"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const Dashboard = dynamic(() => import("@/components/Dashboard"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="surface-panel flex items-center gap-3 rounded-[1.6rem] px-5 py-4 text-sm font-medium text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải giao diện điều khiển...
      </div>
    </div>
  ),
});

export default function DashboardClientShell() {
  return <Dashboard />;
}
