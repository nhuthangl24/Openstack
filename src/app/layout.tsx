import type { Metadata } from "next";
import { fontMono, fontSans } from "@/app/fonts";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrbitStack Console",
  description:
    "Bảng điều khiển OpenStack hiện đại để tạo VM, triển khai repo và thao tác hạ tầng nhanh hơn.",
  keywords: ["OpenStack", "VM", "Cloud", "Infrastructure", "DevOps"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${fontSans.variable} ${fontMono.variable} antialiased`}
    >
      <body className="min-h-screen bg-background text-foreground">
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
