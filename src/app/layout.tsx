import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "CloudDeploy — VM Manager",
  description: "Deploy and manage virtual servers on OpenStack. Configure hardware, choose your OS, and deploy instantly.",
  keywords: ["OpenStack", "Virtual Machine", "Cloud", "Server", "Deploy"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-black text-white">
        {children}
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{
            style: { background: "#111", border: "1px solid #222", color: "#fff" },
          }}
        />
      </body>
    </html>
  );
}
