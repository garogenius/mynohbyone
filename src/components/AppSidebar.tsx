import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  CalendarClock,
  FolderOpen,
  Home,
  Laptop,
  ListChecks,
  MessageSquare,
  Plug,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";

import type { NavRoute } from "../types/api";
import { BrandMark } from "./BrandMark";

interface NavItem {
  id: NavRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Overview", icon: Home },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "meetings", label: "Meetings", icon: CalendarClock },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "devices", label: "Devices", icon: Laptop },
  { id: "settings", label: "Settings", icon: Settings },
];

function SidebarContent({
  activeRoute,
  onSelect,
  activeDeviceName,
  onClose,
}: {
  activeRoute: NavRoute;
  onSelect: (route: NavRoute) => void;
  activeDeviceName: string | null;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full w-60 flex-col border-r border-white/[0.08] bg-[#0D0F13]">
      <div className="flex h-16 items-center justify-between border-b border-white/[0.06] px-4">
        <button
          type="button"
          onClick={() => {
            onSelect("home");
            onClose?.();
          }}
          className="flex items-center focus:outline-none"
          aria-label="NohbyOne Home"
        >
          <BrandMark variant="logo" size="lg" />
        </button>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Standalone Assistant Launcher */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={() => {
            onSelect("assistant");
            onClose?.();
          }}
          className="btn-ivory flex h-9 w-full items-center justify-center gap-2 rounded-lg px-3 text-xs"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Open Assistant</span>
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeRoute === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item.id);
                onClose?.();
              }}
              className={`group flex min-h-[36px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${
                isActive
                  ? "bg-white/[0.08] text-white"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              <Icon
                className={`h-4 w-4 ${
                  isActive ? "text-[#0066FF]" : "text-zinc-500 group-hover:text-zinc-300"
                }`}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className="rounded-xl border border-white/[0.07] bg-[#111318] px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Local Agent Ready</span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">
            {activeDeviceName || "No device bound"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar({
  activeRoute,
  onSelect,
  activeDeviceName,
  mobileOpen,
  onCloseMobile,
}: {
  activeRoute: NavRoute;
  onSelect: (route: NavRoute) => void;
  activeDeviceName: string | null;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  return (
    <>
      <aside className="hidden shrink-0 lg:block">
        <SidebarContent
          activeRoute={activeRoute}
          onSelect={onSelect}
          activeDeviceName={activeDeviceName}
        />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 h-full"
            >
              <SidebarContent
                activeRoute={activeRoute}
                onSelect={onSelect}
                activeDeviceName={activeDeviceName}
                onClose={onCloseMobile}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
