import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Brain,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Laptop,
  ListChecks,
  MessageSquare,
  Mic,
  PanelLeftClose,
  Plug,
  Settings,
  User as UserIcon,
  X,
} from "lucide-react";

import { useAppStore } from "../store/useAppStore";
import type { NavRoute } from "../types/api";
import { BrandMark } from "./BrandMark";

export type SidebarMode = "expanded" | "collapsed" | "hidden";

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
  collapsed = false,
  onToggleCollapse,
  onHideSidebar,
  onClose,
}: {
  activeRoute: NavRoute;
  onSelect: (route: NavRoute) => void;
  activeDeviceName: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onHideSidebar?: () => void;
  onClose?: () => void;
}) {
  const { user, health } = useAppStore();
  const isOnline = health?.status === "healthy";

  return (
    <div
      className={`flex h-full flex-col border-r border-white/[0.08] bg-[#0B101B] transition-all duration-200 ${
        collapsed ? "w-15" : "w-48"
      }`}
    >
      {/* Compact Logo Header + Collapse / Hide Controls */}
      <div
        className={`flex h-14 items-center border-b border-white/[0.05] ${
          collapsed ? "justify-center px-1.5" : "justify-between px-3"
        }`}
      >
        <button
          type="button"
          onClick={() => {
            if (collapsed && onToggleCollapse) {
              onToggleCollapse();
            } else {
              onSelect("home");
              onClose?.();
            }
          }}
          className="flex min-w-0 items-center focus:outline-none"
          aria-label="NohbyOne Home"
          title={collapsed ? "Expand sidebar" : "NohbyOne"}
        >
          <BrandMark variant={collapsed ? "icon" : "logo"} size={collapsed ? "md" : "lg"} />
        </button>

        {!collapsed && (
          <div className="hidden items-center gap-0.5 lg:flex">
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Collapse sidebar to icons"
                aria-label="Collapse sidebar to icons"
                className="rounded-lg p-1 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
            {onHideSidebar && (
              <button
                type="button"
                onClick={onHideSidebar}
                title="Hide sidebar completely"
                aria-label="Hide sidebar completely"
                className="rounded-lg p-1 text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

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

      {/* Expand / Hide quick bar when in icon-only collapsed mode */}
      {collapsed && (
        <div className="flex flex-col items-center gap-1 border-b border-white/[0.05] py-1.5">
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-[#00D4FF]"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
          {onHideSidebar && (
            <button
              type="button"
              onClick={onHideSidebar}
              title="Hide sidebar"
              aria-label="Hide sidebar"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Slim Compact Navigation */}
      <nav
        className="flex-1 space-y-0.5 overflow-y-auto px-2 py-1.5"
        aria-label="Main navigation"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeRoute === item.id;
          return (
            <div key={item.id} className="relative flex items-center">
              <button
                type="button"
                title={item.label}
                onClick={() => {
                  onSelect(item.id);
                  onClose?.();
                }}
                className={`group flex min-h-[34px] w-full items-center rounded-lg text-[12px] font-medium transition ${
                  collapsed ? "justify-center px-2 py-1.5" : "gap-2.5 px-2.5 py-1.5"
                } ${
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
                {!collapsed && <span className="truncate">{item.label}</span>}
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
      <div className="space-y-2 border-t border-white/[0.06] px-2 py-2.5">
        <button
          type="button"
          title={user?.profile?.displayName || user?.name || "Profile"}
          onClick={() => {
            onSelect("settings");
            onClose?.();
          }}
          className={`flex w-full items-center rounded-lg border border-white/[0.08] bg-[#101624] py-1.5 text-left transition hover:border-[#00D4FF]/40 ${
            collapsed ? "justify-center px-1" : "gap-2 px-2"
          }`}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-[#161E30] text-zinc-300">
            <UserIcon className="h-3 w-3" />
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-white">
                {user?.profile?.displayName || user?.name || "Profile"}
              </p>
              <p className="truncate text-[9px] text-zinc-500">{user?.email || ""}</p>
            </div>
          )}
        </button>

        <div
          className={`flex items-center gap-1.5 px-1 text-[10px] ${
            collapsed ? "justify-center" : ""
          }`}
          title={isOnline ? "System: Online" : "System: Connecting"}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              isOnline
                ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                : "bg-amber-400"
            }`}
          />
          {!collapsed && (
            <>
              <span className="text-zinc-400">System:</span>
              <span
                className={
                  isOnline ? "font-medium text-emerald-400" : "font-medium text-amber-400"
                }
              >
                {isOnline ? "Online" : "Connecting"}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AppSidebar({
  activeRoute,
  onSelect,
  activeDeviceName,
  sidebarMode = "expanded",
  onChangeSidebarMode,
  mobileOpen,
  onCloseMobile,
}: {
  activeRoute: NavRoute;
  onSelect: (route: NavRoute) => void;
  activeDeviceName: string | null;
  sidebarMode?: SidebarMode;
  onChangeSidebarMode?: (mode: SidebarMode) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  return (
    <>
      {sidebarMode !== "hidden" && (
        <aside className="hidden shrink-0 lg:block">
          <SidebarContent
            activeRoute={activeRoute}
            onSelect={onSelect}
            activeDeviceName={activeDeviceName}
            collapsed={sidebarMode === "collapsed"}
            onToggleCollapse={() =>
              onChangeSidebarMode?.(sidebarMode === "collapsed" ? "expanded" : "collapsed")
            }
            onHideSidebar={() => onChangeSidebarMode?.("hidden")}
          />
        </aside>
      )}

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
