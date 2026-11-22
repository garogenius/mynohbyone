import { LogOut, Menu, Radio } from "lucide-react";

import type { Device, HealthData, NavRoute, User } from "../types/api";

const ROUTE_TITLES: Record<NavRoute, { title: string; subtitle: string }> = {
  home: { title: "Overview", subtitle: "Workspace health and local agent readiness" },
  assistant: { title: "Assistant", subtitle: "Conversations, reasoning, and execution planning" },
  tasks: { title: "Tasks", subtitle: "Execution plans, progress, and approval controls" },
  meetings: { title: "Meetings", subtitle: "Consent-aware meeting intelligence and summaries" },
  integrations: { title: "Integrations", subtitle: "Connected accounts and API permissions" },
  files: { title: "Files", subtitle: "Authorised local documents and knowledge indexing" },
  memory: { title: "Memory", subtitle: "User-controlled persistent context and preferences" },
  devices: { title: "Devices", subtitle: "Registered desktop agents and session revocation" },
  settings: { title: "Settings", subtitle: "Account profile, privacy, and security" },
};

export function Topbar({
  activeRoute,
  user,
  health,
  currentDevice,
  onLogout,
  onOpenDevices,
  onOpenMobileMenu,
}: {
  activeRoute: NavRoute;
  user: User;
  health: HealthData | null;
  currentDevice: Device | null;
  onLogout: () => void;
  onOpenDevices: () => void;
  onOpenMobileMenu: () => void;
}) {
  const meta = ROUTE_TITLES[activeRoute];
  const healthy = health?.status === "healthy";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#0A0B0E]/90 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-[#111318] text-zinc-300 transition hover:bg-white/[0.06] lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight text-white">
            {meta.title}
          </h1>
          <p className="hidden truncate text-xs text-zinc-500 sm:block">{meta.subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div
          className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#111318] px-2.5 py-1 text-xs text-zinc-300"
          title={healthy ? "Backend API healthy" : "Backend degraded"}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              healthy ? "bg-emerald-400" : "bg-amber-400"
            }`}
          />
          <span className="hidden sm:inline">{healthy ? "Connected" : "Degraded"}</span>
        </div>

        <button
          type="button"
          onClick={onOpenDevices}
          className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-[#111318] px-3 py-1 text-xs text-zinc-300 transition hover:border-white/[0.16] hover:text-white md:flex"
        >
          <Radio className="h-3.5 w-3.5 text-indigo-400" />
          <span className="max-w-[140px] truncate">
            {currentDevice ? currentDevice.deviceName : "Register Device"}
          </span>
        </button>

        <div className="hidden h-4 w-px bg-white/[0.08] sm:block" />

        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.1] bg-[#171A21] text-xs font-semibold text-zinc-200">
            {user.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="hidden text-left xl:block">
            <p className="text-xs font-medium text-zinc-200">
              {user.profile?.displayName || user.name}
            </p>
            <p className="text-[11px] text-zinc-500">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-[#111318] text-zinc-400 transition hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
