"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X, GitBranch, ExternalLink, RefreshCw, CheckCircle2 } from "lucide-react";

interface VMOption {
  id: string;
  name: string;
  ip: string;
}

interface RepoOption {
  id: number;
  name: string;
  full_name: string;
  clone_url: string;
  html_url: string;
  default_branch: string;
}

interface GitHubDeployModalProps {
  vms: VMOption[];
  onDeploy: (vmId: string, cloneUrl: string) => void;
  onClose: () => void;
}

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export default function GitHubDeployModal({
  vms,
  onDeploy,
  onClose,
}: GitHubDeployModalProps) {
  const [loading, setLoading] = useState(false);
  const [device, setDevice] = useState<DeviceCodeResponse | null>(null);
  const [status, setStatus] = useState("");
  const [repos, setRepos] = useState<RepoOption[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [selectedVm, setSelectedVm] = useState("");
  const [error, setError] = useState("");
  const pollRef = useRef<number | null>(null);

  const selectedRepoObj = useMemo(
    () => repos.find((r) => r.full_name === selectedRepo) || null,
    [repos, selectedRepo],
  );

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const fetchRepos = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/github/repos");
      if (!res.ok) throw new Error("Not connected");
      const data = await res.json();
      setRepos(data.repos || []);
      if (data.repos?.length) {
        setSelectedRepo(data.repos[0].full_name);
      }
    } catch {
      setRepos([]);
    } finally {
      setLoading(false);
    }
  };

  const startDeviceFlow = async () => {
    setLoading(true);
    setError("");
    setStatus("");
    try {
      const res = await fetch("/api/github/device/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Device flow failed");
      setDevice(data);
      setStatus("Open GitHub and enter the code");
      startPolling(data.device_code, data.interval || 5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Device flow failed");
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (deviceCode: string, intervalSec: number) => {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch("/api/github/device/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_code: deviceCode }),
        });
        const data = await res.json();
        if (data.status === "authorized") {
          stopPolling();
          setStatus("Connected");
          await fetchRepos();
        } else if (data.status === "denied") {
          stopPolling();
          setError("Authorization denied");
        } else if (data.status === "expired") {
          stopPolling();
          setError("Code expired. Try again.");
        } else if (data.status === "slow_down") {
          setStatus("Waiting for approval...");
        } else if (data.status === "pending") {
          setStatus("Waiting for approval...");
        }
      } catch {
        stopPolling();
        setError("Polling failed");
      }
    }, Math.max(intervalSec, 5) * 1000);
  };

  useEffect(() => {
    fetchRepos();
    return () => stopPolling();
  }, []);

  const handleDeploy = () => {
    if (!selectedRepoObj) return;
    if (!selectedVm) return;
    onDeploy(selectedVm, selectedRepoObj.clone_url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(3,4,6,0.7)", backdropFilter: "blur(8px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl">
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-emerald-400/30 via-sky-400/10 to-cyan-500/20 blur-sm" />
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f1115] shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-emerald-300" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Deploy from GitHub</h3>
                <p className="text-xs text-gray-500">Connect and choose a public repo</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {repos.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-white">Connect GitHub</p>
                    <p className="text-xs text-gray-500">
                      Use Device Flow to authorize this app.
                    </p>
                  </div>
                  <button
                    onClick={startDeviceFlow}
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-emerald-400/90 hover:bg-emerald-300 text-black text-sm font-semibold disabled:opacity-50"
                  >
                    {loading ? "Starting..." : "Connect"}
                  </button>
                </div>

                {device && (
                  <div className="mt-4 rounded-lg border border-white/10 bg-black/60 p-3 text-xs text-gray-400">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-gray-500">Code</div>
                        <div className="text-white text-sm font-semibold tracking-widest">
                          {device.user_code}
                        </div>
                      </div>
                      <a
                        href={device.verification_uri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200"
                      >
                        Open GitHub <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    {status && <div className="mt-2 text-gray-500">{status}</div>}
                  </div>
                )}

                {error && (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                    {error}
                  </div>
                )}
              </div>
            )}

            {repos.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-white">
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" /> Connected
                  </div>
                  <button
                    onClick={fetchRepos}
                    className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-white"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">Repository</label>
                    <select
                      value={selectedRepo}
                      onChange={(e) => setSelectedRepo(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
                    >
                      {repos.map((repo) => (
                        <option key={repo.id} value={repo.full_name}>
                          {repo.full_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400">Target VM</label>
                    <select
                      value={selectedVm}
                      onChange={(e) => setSelectedVm(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
                    >
                      <option value="">Select a VM</option>
                      {vms.map((vm) => (
                        <option key={vm.id} value={vm.id}>
                          {vm.name} {vm.ip ? `(${vm.ip})` : "(no IP)"}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedRepoObj && (
                  <div className="text-xs text-gray-500">
                    Repo: <span className="text-gray-300">{selectedRepoObj.clone_url}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={handleDeploy}
                    disabled={!selectedRepoObj || !selectedVm}
                    className="px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-100 disabled:opacity-50"
                  >
                    Open Web SSH & Clone
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
