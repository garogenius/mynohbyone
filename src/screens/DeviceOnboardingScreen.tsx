import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Cpu, Loader2, LogOut, ShieldCheck } from "lucide-react";

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
    <div className="flex min-h-screen items-center justify-center bg-[#0B0C0E] px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-2xl rounded-2xl border border-white/[0.08] bg-[#131519] p-6 shadow-2xl sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-5">
          <div className="flex items-center gap-3">
            <BrandMark size="md" />
            <div>
              <h1 className="font-display text-base font-semibold text-[#F4F1EA]">
                Register This Device
              </h1>
              <p className="text-xs text-[#8E9199]">
                Signed in as <span className="text-[#F4F1EA]">{user?.email}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#1A1D23] px-3 py-1.5 text-xs text-[#A1A3AA] transition hover:text-[#F4F1EA]"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>

        <div className="mt-5 rounded-xl border border-[#D6C6A5]/20 bg-[#D6C6A5]/[0.06] p-4 text-xs leading-relaxed text-[#D8D5CE]">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#D6C6A5]" />
            <span>
              Nohby ONE uses a <strong>local-first execution model</strong>. Registering this
              computer binds a revocable device identity so you always control what runs locally.
            </span>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-[#C8C9CE]">
                Device Name
              </label>
              <input
                type="text"
                required
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="My Workstation"
                className="studio-input h-11 w-full rounded-xl px-3.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#C8C9CE]">Platform</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as DevicePlatform)}
                className="studio-input h-11 w-full rounded-xl px-3 text-sm"
              >
                <option value="windows">Windows</option>
                <option value="macos">macOS</option>
                <option value="linux">Linux</option>
                <option value="web">Web</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-[#C8C9CE]">
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
                        ? "border-[#D6C6A5]/45 bg-[#1A1D23]"
                        : "border-white/[0.08] bg-[#101216] hover:border-white/[0.16]"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        selected
                          ? "border-[#F4F1EA] bg-[#F4F1EA] text-[#0B0C0E]"
                          : "border-white/20 text-transparent"
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-[#F4F1EA]">{cap.label}</div>
                      <div className="mt-0.5 text-[11px] text-[#8E9199]">{cap.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="btn-ivory flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cpu className="h-4 w-4" />}
            <span>Authorise &amp; Register This Device</span>
          </button>
        </form>
      </motion.div>
    </div>
  );
}
