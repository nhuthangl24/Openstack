import type { Metadata } from "next";
import DatabaseHostingConsole from "@/components/database/DatabaseHostingConsole";

export const metadata: Metadata = {
  title: "OrbitStack Dashboard Databases",
  description:
    "Route dashboard/databases cho module shared managed MySQL hosting tren OrbitStack.",
};

export default function DashboardDatabasesPage() {
  return <DatabaseHostingConsole />;
}
