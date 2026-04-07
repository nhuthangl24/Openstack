import CreateVMForm from "@/components/CreateVMForm";
import { Cloud, ExternalLink } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-chart-1/3 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-chart-3/3 rounded-full blur-[128px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-chart-2/2 rounded-full blur-[180px]" />
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-chart-1 to-chart-2 flex items-center justify-center shadow-lg shadow-chart-1/20">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground tracking-tight">
                OpenStack
              </h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium leading-none">
                VM Manager
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-full px-3 py-1.5 border border-border/30">
              <div className="w-2 h-2 rounded-full bg-chart-2 animate-pulse" />
              <span>Connected</span>
            </div>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="GitHub"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          {/* Page heading */}
          <div className="mb-8 lg:mb-10">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-px flex-1 max-w-8 bg-gradient-to-r from-chart-1 to-transparent" />
              <span className="text-xs text-chart-1 font-medium uppercase tracking-wider">
                Cloud Compute
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Tạo máy ảo
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Cấu hình và triển khai máy ảo mới trên hạ tầng OpenStack. Chọn
              cấu hình phần cứng, hệ điều hành và môi trường phần mềm cần
              thiết.
            </p>
          </div>

          {/* Form + Preview */}
          <CreateVMForm />
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/30 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © 2026 OpenStack VM Manager. Cloud Admin Dashboard.
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-chart-2" />
              All systems operational
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
