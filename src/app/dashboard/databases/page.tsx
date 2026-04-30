import type { Metadata } from "next";
import DatabaseHostingConsole from "@/components/database/DatabaseHostingConsole";

export const metadata: Metadata = {
  title: "OrbitStack Cơ sở dữ liệu",
  description:
    "Trang cơ sở dữ liệu trong dashboard OrbitStack.",
};

export default function DashboardDatabasesPage() {
  return <DatabaseHostingConsole />;
}
