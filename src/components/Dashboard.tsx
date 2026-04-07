"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, RefreshCw, Terminal, Trash2, Copy, Check,
  Server, AlertCircle, Loader2, TriangleAlert, CloudOff, MoreHorizontal
} from "lucide-react";
import CreateServerModal from "@/components/CreateServerModal";
import VMSuccessModal from "@/components/VMSuccessModal";
import { toast } from "sonner";

interface VM {
  id: string;
  name: string;
  status: string;
  ip: string;
  flavor: string;
  image: string;
}

interface VMResult {
  vm_name: string; vm_id: string; status: string;
  flavor: string; os: string; password: string; environments: string[];
}

// ── Status helpers ──────────────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const color =
    status === "ACTIVE"  ? "bg-green-500" :
    status === "BUILD"   ? "bg-yellow-400 status-pulse" :
    status === "ERROR"   ? "bg-red-500" :
    status === "SHUTOFF" ? "bg-gray-500" : "bg-gray-600";
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "ACTIVE"  ? "text-green-400 bg-green-400/10 border-green-400/20" :
    status === "BUILD"   ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" :
    status === "ERROR"   ? "text-red-400 bg-red-400/10 border-red-400/20" :
    status === "SHUTOFF" ? "text-gray-400 bg-gray-400/10 border-gray-400/20" :
                           "text-gray-500 bg-gray-500/10 border-gray-500/20";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${cls}`}>
      {status || "UNKNOWN"}
    </span>
  );
}

// ── CopyButton ───────────────────────────────────────────────────────────────
async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }

  return copied;
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const ok = await copyToClipboard(text);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={handleCopy} title={`Copy ${label || text}`}
      className="p-1.5 rounded text-gray-600 hover:text-gray-300 hover:bg-white/6 transition-all">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── VM Row ───────────────────────────────────────────────────────────────────
function VMRow({ vm, onDelete, deleting }: { vm: VM; onDelete: (name: string) => void; deleting: boolean }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const sshCmd = `ssh ubuntu@${vm.ip || "<IP>"}`;

  return (
    <div className={`vm-row flex items-center gap-4 px-6 py-4 border-b border-white/6 group ${confirmDel ? "bg-red-950/20" : ""}`}>

      {/* Status + Name */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <StatusDot status={vm.status} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{vm.name}</p>
          <p className="text-xs text-gray-600 truncate">{vm.flavor || "—"}</p>
        </div>
      </div>

      {/* IP */}
      <div className="hidden sm:flex items-center gap-1 min-w-[140px]">
        {vm.ip ? (
          <>
            <code className="text-[13px] font-mono text-cyan-400">{vm.ip}</code>
            <CopyBtn text={vm.ip} label="IP" />
          </>
        ) : (
          <span className="text-xs text-gray-600 italic">
            {vm.status === "BUILD" ? "Waiting…" : "No IP"}
          </span>
        )}
      </div>

      {/* Status badge */}
      <div className="hidden md:block min-w-[80px]">
        <StatusBadge status={vm.status} />
      </div>

      {/* OS */}
      <div className="hidden lg:block min-w-[140px]">
        <span className="text-xs text-gray-500 truncate">{vm.image || "—"}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto flex-shrink-0">
        {!confirmDel ? (
          <>
            {vm.ip && (
              <CopyBtn text={sshCmd} label="SSH command" />
            )}
            <button
              onClick={() => setConfirmDel(true)}
              className="p-1.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-400/8 transition-all"
              title="Delete server"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400">Delete?</span>
            <button
              onClick={() => { onDelete(vm.name); setConfirmDel(false); }}
              disabled={deleting}
              className="px-2.5 py-1 rounded text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-all disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              className="px-2.5 py-1 rounded text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/20 transition-all"
            >
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-6 py-4 border-b border-white/6">
      <div className="skeleton w-2 h-2 rounded-full" />
      <div className="skeleton h-4 w-36 rounded" />
      <div className="skeleton h-4 w-28 rounded ml-auto hidden sm:block" />
      <div className="skeleton h-5 w-14 rounded hidden md:block" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
        <CloudOff className="w-6 h-6 text-gray-500" />
      </div>
      <h3 className="text-base font-semibold text-white mb-1">No servers yet</h3>
      <p className="text-sm text-gray-500 mb-6 max-w-xs">
        Deploy your first virtual server to get started. Choose your hardware, OS and software stack.
      </p>
      <button
        onClick={onNew}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-100 transition-all"
      >
        <Plus className="w-4 h-4" /> New Server
      </button>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [vms, setVMs]               = useState<VM[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]         = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [vmResult, setVmResult]     = useState<VMResult | null>(null);
  const [deletingName, setDeletingName] = useState("");

  const fetchVMs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const res = await fetch("/api/get-instances");
      const data = await res.json();
      if (data.success) setVMs(data.instances || []);
      else setError(data.error_message || "Không lấy được danh sách server");
    } catch {
      setError("Không kết nối được tới OpenStack API");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchVMs();
    const interval = setInterval(() => fetchVMs(true), 15000);
    return () => clearInterval(interval);
  }, [fetchVMs]);

  const handleDelete = async (name: string) => {
    setDeletingName(name);
    try {
      await fetch("/api/delete-vm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server_name: name }),
      });
      toast.success(`Server "${name}" deleted`);
      fetchVMs(true);
    } catch {
      toast.error(`Failed to delete "${name}"`);
    } finally {
      setDeletingName("");
    }
  };

  // Filtered VMs
  const filteredVMs = vms.filter(vm => {
    if (filter === "active")   return vm.status === "ACTIVE";
    if (filter === "building") return vm.status === "BUILD";
    if (filter === "error")    return vm.status === "ERROR" || vm.status === "SHUTOFF";
    return true;
  });

  const counts = {
    all:      vms.length,
    active:   vms.filter(v => v.status === "ACTIVE").length,
    building: vms.filter(v => v.status === "BUILD").length,
    error:    vms.filter(v => v.status === "ERROR" || v.status === "SHUTOFF").length,
  };

  const FILTERS = [
    { key: "all",      label: "All",      count: counts.all },
    { key: "active",   label: "Active",   count: counts.active },
    { key: "building", label: "Building", count: counts.building },
    { key: "error",    label: "Error",    count: counts.error },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/8 bg-black/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-black">
                <path d="M12 2L22 19.7H2L12 2Z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-white">CloudDeploy</span>
            <span className="hidden sm:inline text-gray-700 text-sm">/</span>
            <span className="hidden sm:inline text-sm text-gray-400">Servers</span>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-500 bg-white/5 border border-white/8 rounded-full px-3 py-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${error ? "bg-red-500" : "bg-green-500"}`} />
              {error ? "Disconnected" : "Connected"}
            </div>
            <button
              onClick={() => fetchVMs(true)}
              disabled={refreshing}
              className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/6 transition-all"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-100 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>New Server</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8">

        {/* Page title + stats */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Servers</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {loading ? "Loading..." : `${vms.length} server${vms.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          {!loading && vms.length > 0 && (
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{counts.active} active</span>
              {counts.building > 0 && <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />{counts.building} building</span>}
              {counts.error > 0 && <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{counts.error} error</span>}
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 mb-5 rounded-lg bg-red-950/40 border border-red-800/40">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
            <button onClick={() => fetchVMs()} className="ml-auto text-xs text-red-400 hover:text-red-300 underline">Retry</button>
          </div>
        )}

        {/* Main card */}
        <div className="rounded-xl border border-white/8 bg-[#0a0a0a] overflow-hidden">

          {/* Filter tabs + table header */}
          {(!loading && vms.length > 0) && (
            <div className="flex items-center justify-between border-b border-white/8">
              {/* Tabs */}
              <div className="flex">
                {FILTERS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`relative px-4 py-3 text-xs font-medium transition-colors ${
                      filter === f.key ? "text-white" : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {filter === f.key && (
                      <span className="absolute bottom-0 left-0 right-0 h-px bg-white" />
                    )}
                    {f.label}
                    {f.count > 0 && (
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${
                        filter === f.key ? "bg-white/15 text-white" : "bg-white/8 text-gray-500"
                      }`}>{f.count}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Table header labels */}
              <div className="hidden lg:flex items-center gap-4 px-6 text-[10px] font-medium text-gray-600 uppercase tracking-wider">
                <span className="w-36 text-right">IP</span>
                <span className="w-20 text-right">Status</span>
                <span className="w-36 text-right">Image</span>
              </div>
            </div>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div>
              {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && vms.length === 0 && (
            <EmptyState onNew={() => setShowCreate(true)} />
          )}

          {/* VM list */}
          {!loading && filteredVMs.map(vm => (
            <VMRow
              key={vm.id}
              vm={vm}
              onDelete={handleDelete}
              deleting={deletingName === vm.name}
            />
          ))}

          {/* Filter empty */}
          {!loading && vms.length > 0 && filteredVMs.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-500">
              No servers match filter "{filter}"
            </div>
          )}
        </div>

        {/* Footer note */}
        {!loading && vms.length > 0 && (
          <p className="text-xs text-gray-700 text-center mt-4">
            Auto-refreshes every 15 seconds · Hover a row for actions
          </p>
        )}
      </main>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showCreate && (
        <CreateServerModal
          onClose={() => setShowCreate(false)}
          onSuccess={data => {
            setShowCreate(false);
            setVmResult(data);
            fetchVMs(true);
          }}
        />
      )}

      {vmResult && (
        <VMSuccessModal
          info={vmResult}
          onClose={() => { setVmResult(null); fetchVMs(true); }}
        />
      )}
    </div>
  );
}
