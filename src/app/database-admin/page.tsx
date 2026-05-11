import type { Metadata } from "next";
import DatabaseAdminConsole from "@/components/database-admin/DatabaseAdminConsole";

export const metadata: Metadata = {
  title: "Database Admin",
  description:
    "Trang rieng de quan tri user, plan va quota cho database hosting.",
};

export default function DatabaseAdminPage() {
  return <DatabaseAdminConsole />;
}
