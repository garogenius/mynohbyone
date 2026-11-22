import { LogOut, Mic, Radio, Shield } from "lucide-react";

import type { Device, HealthData, NavRoute, User } from "../types/api";

const ROUTE_TITLES: Record<NavRoute, { title: string; subtitle: string }> = {
  home: { title: "Home", subtitle: "Workspace overview and local assistant readiness" },
  assistant: { title: "Assistant", subtitle: "Natural-language reasoning and task orchestration" },
  tasks: { title: "Task Centre", subtitle: "Execution plans, progress, and approval controls" },
  meetings: { title: "Meetings", subtitle: "Consent-aware meeting intelligence and summaries" },
  integrations: { title: "Integrations", subtitle: "OAuth connections for calendar, email, and social" },
  files: { title: "Files", subtitle: "Authorised local documents and knowledge indexing" },
  memory: { title: "Personal Memory", subtitle: "User-controlled persistent context and preferences" },
  devices: { title: "Devices", subtitle: "Registered desktop agents and session revocation" },
  settings: { title: "Settings", subtitle: "Account profile, privacy, and security controls" },
};

export function Topbar({
  activeRoute,
  user,
  health,
  currentDevice,
  onLogout,
  onOpenDevices,
}: {
  activeRoute: NavRoute;
  user: User;
  health: HealthData | null;
  currentDevice: Device | null;
  onLogout: () => void;
  onOpenDevices: () => void;
}) {
  const meta = ROUTE_TITLES[activeRoute];
  const healthy = health?.status === "healthy";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 bg-[#0B0F17]/90 px-6 backdrop-blur-md">
      <div>
        <h1 className="text-base font-semibold tracking-tight text-slate-100">{meta.title}</h1>
        <p className="text-xs text-slate-400">{meta.subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
            healthy
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/25 bg-amber-500/10 text-amber-300"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              healthy ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-amber-400"
            }`}
          />
          <span>{healthy ? "Backend Connected" : "Degraded"}</span>
        </div>

        <button
          type="button"
          onClick={onOpenDevices}
          className="hidden items-center gap-2 rounded-full border border-slate-800 bg-slate-900/70 px-3 py-1 text-xs text-slate-300 transition hover:border-slate-700 hover:text-white md:flex"
        >
          <Radio className="h-3.5 w-3.5 text-cyan-400" />
          <span className="max-w-[160px] truncate">
            {currentDevice ? currentDevice.deviceName : "Register Device"}
          </span>
        </button>

        <div
          title="Voice interface arrives in Phase 3"
          className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/50 px-2.5 py-1 text-xs text-slate-500"
        >
          <Mic className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Mic Off</span>
        </div>

        <div className="h-5 w-px bg-slate-800" />

        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="hidden text-left lg:block">
            <div className="flex items-center gap-1 text-xs font-medium text-slate-200">
              <span>{user.profile?.displayName || user.name}</span>
              <Shield className="h-3 w-3 text-indigo-400" />
            </div>
            <p className="text-[11px] text-slate-500">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Sign out"
            className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-slate-400 transition hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
