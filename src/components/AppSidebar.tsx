import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Brain,
  EyeOff,
  Laptop,
  ListChecks,
  MessageSquare,
  Mic,
  Plug,
  Settings,
  User as UserIcon,
  X,
} from "lucide-react";

import { useAppStore } from "../store/useAppStore";
import type { NavRoute } from "../types/api";
import { BrandMark } from "./BrandMark";

interface NavItem {
  id: NavRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Assistant", icon: Mic },
  { id: "assistant", label: "Chat Room", icon: MessageSquare },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "meetings", label: "Meetings", icon: EyeOff },
  { id: "integrations", label: "Plugins", icon: Plug },
  { id: "files", label: "Library", icon: BookOpen },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "devices", label: "Devices", icon: Laptop },
  { id: "settings", label: "Settings", icon: Settings },
];

function SidebarContent({
  activeRoute,
  onSelect,
  onClose,
}: {
  activeRoute: NavRoute;
  onSelect: (route: NavRoute) => void;
  activeDeviceName: string | null;
  onClose?: () => void;
}) {
  const { user, health } = useAppStore();
  const isOnline = health?.status === "healthy";

  return (
    <div className="flex h-full w-48 flex-col border-r border-white/[0.08] bg-[#0B101B]">
      {/* Compact Logo Header */}
      <div className="flex h-14 items-center justify-between px-3">
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
            className="rounded-lg p-1 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Slim Compact Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1.5" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeRoute === item.id;
          return (
            <div key={item.id} className="relative flex items-center">
              <button
                type="button"
                onClick={() => {
                  onSelect(item.id);
                  onClose?.();
                }}
                className={`group flex min-h-[32px] w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
                  isActive
                    ? "nohby-nav-active text-white"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                }`}
              >
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${
                    isActive ? "text-[#00D4FF]" : "text-zinc-500 group-hover:text-zinc-300"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute -right-2 h-5 w-1 rounded-l-full bg-[#00D4FF] shadow-[0_0_10px_#00D4FF]"
                />
              )}
            </div>
          );
        })}
      </nav>

      {/* Compact User Profile + Online Dot */}
      <div className="space-y-2 border-t border-white/[0.06] px-2.5 py-2.5">
        <button
          type="button"
          onClick={() => {
            onSelect("settings");
            onClose?.();
          }}
          className="flex w-full items-center gap-2 rounded-lg border border-white/[0.08] bg-[#101624] px-2 py-1.5 text-left transition hover:border-[#00D4FF]/40"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-[#161E30] text-zinc-300">
            <UserIcon className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium text-white">
              {user?.profile?.displayName || user?.name || "Profile"}
            </p>
            <p className="truncate text-[9px] text-zinc-500">{user?.email || ""}</p>
          </div>
        </button>

        <div className="flex items-center gap-1.5 px-1 text-[10px]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isOnline
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                : "bg-amber-400"
            }`}
          />
          <span className="text-zinc-400">System:</span>
          <span className={isOnline ? "font-medium text-emerald-400" : "font-medium text-amber-400"}>
            {isOnline ? "Online" : "Connecting"}
          </span>
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
              initial={{ x: -220 }}
              animate={{ x: 0 }}
              exit={{ x: -220 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
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
