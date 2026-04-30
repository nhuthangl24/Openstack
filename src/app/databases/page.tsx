import type { Metadata } from "next";
import DatabaseHostingConsole from "@/components/database/DatabaseHostingConsole";

export const metadata: Metadata = {
  title: "OrbitStack Cơ sở dữ liệu",
  description:
    "Module cơ sở dữ liệu dùng chung của OrbitStack: tạo, xóa, đổi mật khẩu và quản lý quota qua giao diện.",
};

export default function DatabasesPage() {
  return <DatabaseHostingConsole />;
}
