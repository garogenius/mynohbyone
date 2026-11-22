import {
  Brain,
  CalendarClock,
  FolderOpen,
  Home,
  Laptop,
  ListChecks,
  MessageSquareText,
  Plug,
  Settings,
  ShieldCheck,
} from "lucide-react";

import type { NavRoute } from "../types/api";
import { BrandMark } from "./BrandMark";

interface NavItem {
  id: NavRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  phase?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "assistant", label: "Assistant", icon: MessageSquareText, phase: "P2" },
  { id: "tasks", label: "Tasks", icon: ListChecks, phase: "P4" },
  { id: "meetings", label: "Meetings", icon: CalendarClock, phase: "P8" },
  { id: "integrations", label: "Integrations", icon: Plug, phase: "P7" },
  { id: "files", label: "Files", icon: FolderOpen, phase: "P6" },
  { id: "memory", label: "Memory", icon: Brain, phase: "P9" },
  { id: "devices", label: "Devices", icon: Laptop },
  { id: "settings", label: "Settings", icon: Settings },
];

export function AppSidebar({
  activeRoute,
  onSelect,
  activeDeviceName,
}: {
  activeRoute: NavRoute;
  onSelect: (route: NavRoute) => void;
  activeDeviceName: string | null;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800/80 bg-[#0C1018]">
      <div className="flex items-center gap-3 border-b border-slate-800/70 px-5 py-4">
        <BrandMark size="md" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold tracking-tight text-slate-100">
              Nohby ONE
            </span>
            <span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium text-indigo-300 ring-1 ring-indigo-500/30">
              v0.1
            </span>
          </div>
          <p className="truncate text-[11px] text-slate-400">Local-First AI OS</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeRoute === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-500/30"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon
                  className={`h-4 w-4 ${
                    isActive ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"
                  }`}
                />
                {item.label}
              </span>
              {item.phase && (
                <span className="rounded bg-slate-800/90 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                  {item.phase}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-800/70 p-3.5">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>Local Execution Mode</span>
          </div>
          <p className="mt-1 truncate text-[11px] text-slate-400">
            {activeDeviceName ? `Agent: ${activeDeviceName}` : "No device bound"}
          </p>
        </div>
      </div>
    </aside>
  );
}
