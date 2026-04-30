import type { Metadata } from "next";
import DatabaseHostingConsole from "@/components/database/DatabaseHostingConsole";

export const metadata: Metadata = {
  title: "OrbitStack Database Hosting",
  description:
    "Shared managed MySQL hosting module cho OrbitStack: create/delete/reset password va quota theo plan qua UI.",
};

export default function DatabasesPage() {
  return <DatabaseHostingConsole />;
}
