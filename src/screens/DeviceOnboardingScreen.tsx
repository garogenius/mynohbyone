import { useEffect, useState } from "react";
import { CheckCircle2, Cpu, Laptop, Loader2, LogOut, ShieldCheck } from "lucide-react";

import { BrandMark } from "../components/BrandMark";
import { getLocalDeviceIdentity } from "../lib/device";
import { useAppStore } from "../store/useAppStore";
import type { DevicePlatform } from "../types/api";

const ALL_CAPABILITIES = [
  { id: "voice", label: "Voice Capture", desc: "Local microphone & speech interaction" },
  { id: "browser_automation", label: "Browser Automation", desc: "Authorised Playwright web tasks" },
  { id: "file_access", label: "File Intelligence", desc: "Read/summarise permitted local files" },
  { id: "local_agent", label: "Local Task Agent", desc: "Execute approved plans on this machine" },
];

export function DeviceOnboardingScreen() {
  const { user, registerCurrentDevice, logout, busy, error } = useAppStore();

  const [deviceName, setDeviceName] = useState("");
  const [platform, setPlatform] = useState<DevicePlatform>("windows");
  const [capabilities, setCapabilities] = useState<string[]>([
    "voice",
    "browser_automation",
    "file_access",
    "local_agent",
  ]);

  useEffect(() => {
    getLocalDeviceIdentity().then((id) => {
      setDeviceName(id.deviceName);
      setPlatform(id.platform);
      setCapabilities(id.deviceCapabilities);
    });
  }, []);

  const toggleCapability = (cap: string) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await registerCurrentDevice({
        deviceName,
        platform,
        deviceCapabilities: capabilities,
      });
    } catch {
      // Handled in store
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090C12] px-4 py-10">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-800/80 bg-[#0F141F] p-8 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-6">
          <div className="flex items-center gap-3">
            <BrandMark size="md" />
            <div>
              <h1 className="text-base font-semibold text-white">Register This Device</h1>
              <p className="text-xs text-slate-400">
                Signed in as <span className="text-slate-200">{user?.email}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs leading-relaxed text-indigo-200/90">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
            <span>
              Nohby ONE uses a <strong>local-first execution model</strong>. Registering this
              computer binds a unique device identity so you can inspect capabilities and revoke
              access anytime.
            </span>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Device Name
              </label>
              <div className="relative">
                <Laptop className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  required
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="My Windows Workstation"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/80 py-2.5 pr-4 pl-10 text-sm text-slate-100 outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Platform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as DevicePlatform)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
              >
                <option value="windows">Windows</option>
                <option value="macos">macOS</option>
                <option value="linux">Linux</option>
                <option value="web">Web</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-slate-300">
              Declared Local Capabilities
            </label>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {ALL_CAPABILITIES.map((cap) => {
                const selected = capabilities.includes(cap.id);
                return (
                  <button
                    key={cap.id}
                    type="button"
                    onClick={() => toggleCapability(cap.id)}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                      selected
                        ? "border-indigo-500/40 bg-indigo-500/10"
                        : "border-slate-800 bg-slate-950/50 hover:border-slate-700"
                    }`}
                  >
                    <CheckCircle2
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        selected ? "text-indigo-400" : "text-slate-600"
                      }`}
                    />
                    <div>
                      <div className="text-xs font-semibold text-slate-100">{cap.label}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400">{cap.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
            <span>Authorise &amp; Register This Device</span>
          </button>
        </form>
      </div>
    </div>
  );
}
