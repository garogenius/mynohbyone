import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Laptop, LogOut, Menu, Settings, ShieldAlert } from "lucide-react";

import { apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { Approval, Device, HealthData, NavRoute, User } from "../types/api";
import { ThemeToggle } from "./ThemeToggle";

const ROUTE_TITLES: Record<NavRoute, string> = {
  home: "Active Session",
  assistant: "Chat Room",
  tasks: "Tasks",
  meetings: "Meetings",
  integrations: "Integrations",
  files: "Files",
  memory: "Memory",
  devices: "Devices",
  settings: "Settings",
};

export function Topbar({
  activeRoute,
  user,
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
  const { setRoute } = useAppStore();

  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pendingApprovals, setPendingApprovals] = useState<Approval[]>([]);

  const notifRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiClient
      .listPendingApprovals()
      .then((res) => setPendingApprovals(res.data.approvals))
      .catch(() => {});
  }, [activeRoute]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const initials = (user.profile?.displayName || user.name)
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#0A0B0E] px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-[#111318] text-zinc-300 transition hover:bg-white/[0.06] lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        <h1 className="font-display truncate text-sm font-semibold tracking-tight text-white">
          {ROUTE_TITLES[activeRoute]}
        </h1>
      </div>

      {/* Clean, focused header: Theme Switch + Notifications Dropdown + Profile Dropdown ONLY */}
      <div className="flex items-center gap-2">
        <ThemeToggle compact />

        {/* Notifications dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => {
              setNotifOpen((v) => !v);
              setProfileOpen(false);
            }}
            aria-label="Notifications"
            className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.1] bg-[#131519] text-zinc-300 transition hover:border-white/[0.22]"
          >
            <Bell className="h-3.5 w-3.5" />
            {pendingApprovals.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#0066FF] px-1 text-[10px] font-semibold text-white">
                {pendingApprovals.length}
              </span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                className="dropdown-surface absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl"
              >
                <div className="flex items-center justify-between border-b border-white/[0.07] px-3.5 py-2.5">
                  <span className="text-xs font-semibold text-white">Notifications</span>
                  {pendingApprovals.length > 0 && (
                    <span className="text-[11px] text-zinc-400">
                      {pendingApprovals.length} pending
                    </span>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto p-1.5">
                  {pendingApprovals.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-zinc-500">
                      You&apos;re all caught up. No pending alerts.
                    </div>
                  ) : (
                    pendingApprovals.map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          setRoute("tasks");
                        }}
                        className="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition hover:bg-white/[0.05]"
                      >
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-white">
                            Approval required: {String(app.actionDetails.tool || "Action")}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-400">
                            {String(app.actionDetails.instruction || app.actionDetails.description || "")}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => {
              setProfileOpen((v) => !v);
              setNotifOpen(false);
            }}
            aria-label="Account menu"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.12] bg-[#0066FF] text-xs font-semibold text-white transition hover:opacity-90"
          >
            {initials}
          </button>

          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                className="dropdown-surface absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl"
              >
                <div className="border-b border-white/[0.07] px-3.5 py-3">
                  <p className="truncate text-xs font-semibold text-white">
                    {user.profile?.displayName || user.name}
                  </p>
                  <p className="truncate text-[11px] text-zinc-500">{user.email}</p>
                  {currentDevice && (
                    <p className="mt-1.5 truncate text-[10px] text-emerald-500">
                      ● {currentDevice.deviceName}
                    </p>
                  )}
                </div>

                <div className="p-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onOpenDevices();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-zinc-300 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    <Laptop className="h-3.5 w-3.5 text-zinc-400" />
                    Registered Devices
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setRoute("settings");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-zinc-300 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    <Settings className="h-3.5 w-3.5 text-zinc-400" />
                    Settings &amp; Preferences
                  </button>
                  <div className="my-1 h-px bg-white/[0.07]" />
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-rose-500 transition hover:bg-rose-500/10"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
