import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, ExternalLink, Globe, Loader2, Monitor, RefreshCw, WifiOff, X } from "lucide-react";

import { AppSidebar, type SidebarMode } from "./components/AppSidebar";
import { BrandMark } from "./components/BrandMark";
import { JarvisWakeEngine } from "./components/JarvisWakeEngine";
import { ToastBanner } from "./components/StateViews";
import { Topbar } from "./components/Topbar";
import { AssistantScreen } from "./screens/AssistantScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { DeviceOnboardingScreen } from "./screens/DeviceOnboardingScreen";
import { DevicesScreen } from "./screens/DevicesScreen";
import { FilesScreen } from "./screens/FilesScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { IntegrationsScreen } from "./screens/IntegrationsScreen";
import { MeetingsScreen } from "./screens/MeetingsScreen";
import { MemoryScreen } from "./screens/MemoryScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TasksScreen } from "./screens/TasksScreen";
import { useAppStore } from "./store/useAppStore";

function triggerDesktopAppDownload() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
  const platform = ua.includes("win")
    ? "Windows (x64 .msi)"
    : ua.includes("mac")
      ? "macOS (Universal .dmg)"
      : "Desktop Installer";
  const manifest = [
    "NOHBY ONE DESKTOP APPLICATION INSTALLER",
    `Target Platform: ${platform}`,
    "Version: 0.2.0",
    "Repository: https://github.com/garogenius/mynohbyone",
    "",
    "Build or launch the native Tauri 2 desktop application with:",
    "  npm install && npm run tauri build",
  ].join("\n");
  const blob = new Blob([manifest], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Nohby-ONE-Desktop-Installer-Guide.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function App() {
  const {
    phase,
    bootMessage,
    activeRoute,
    health,
    user,
    devices,
    currentDeviceId,
    error,
    toast,
    bootstrap,
    setRoute,
    logout,
    clearToast,
  } = useAppStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("expanded");
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 768;
  });
  const [pendingBrowserAction, setPendingBrowserAction] = useState<{
    url: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    const checkViewport = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };
    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  useEffect(() => {
    const onBrowserAction = (e: Event) => {
      const detail = (e as CustomEvent<{ url?: string; label?: string }>).detail;
      if (detail?.url) {
        setPendingBrowserAction({
          url: detail.url,
          label: detail.label || detail.url,
        });
      }
    };
    window.addEventListener("nohby-browser-action", onBrowserAction);
    return () => window.removeEventListener("nohby-browser-action", onBrowserAction);
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Mobile Device Size Gate: Do not render web dashboard on mobile screens (< 768px)
  if (isMobileViewport) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#090C12] px-6 py-12 text-center text-zinc-100">
        <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-white/[0.08] bg-[#111622] p-8 shadow-2xl">
          <BrandMark size="lg" />
          <div className="mt-5 flex h-11 w-11 items-center justify-center rounded-xl border border-[#00D4FF]/30 bg-[#00D4FF]/10 text-[#00D4FF]">
            <Monitor className="h-5 w-5" />
          </div>
          <h1 className="font-display mt-4 text-lg font-semibold text-white">
            Desktop Application Required
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
            The Nohby ONE web workspace is designed exclusively for desktop screen sizes and does not support mobile device screens. Download the Nohby ONE Application or open this page on a desktop computer to access your personal AI operating assistant.
          </p>
          <button
            type="button"
            onClick={triggerDesktopAppDownload}
            className="btn-ivory mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-5 text-xs font-semibold"
          >
            <Download className="h-4 w-4" />
            Download Nohby ONE Application
          </button>
          <p className="mt-3 text-[11px] text-zinc-500">
            Available for Windows, macOS, and Linux Desktop
          </p>
        </div>
      </div>
    );
  }

  const currentDevice = devices.find((d) => d.id === currentDeviceId) || null;

  if (phase === "booting") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B0C0E] px-4">
        <BrandMark size="lg" />
        <h1 className="font-display mt-5 text-base font-semibold tracking-tight text-[#F4F1EA]">
          Nohby ONE
        </h1>
        <div className="mt-3 flex items-center gap-2 text-xs text-[#8E9199]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D6C6A5]" />
          <span>{bootMessage}</span>
        </div>
      </div>
    );
  }

  if (phase === "offline") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0B0C0E] px-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-400">
          <WifiOff className="h-5 w-5" />
        </div>
        <h1 className="font-display mt-4 text-base font-semibold text-[#F4F1EA]">
          Backend Unavailable
        </h1>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-[#8E9199]">
          {error || "Could not connect to the Nohby ONE backend service. Ensure the API is running."}
        </p>
        <button
          type="button"
          onClick={() => bootstrap()}
          className="btn-ivory mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry Connection
        </button>
      </div>
    );
  }

  if (phase === "unauthenticated" || !user) {
    return (
      <>
        <AuthScreen />
        <ToastBanner toast={toast} onClose={clearToast} />
      </>
    );
  }

  if (phase === "onboarding_device") {
    return (
      <>
        <DeviceOnboardingScreen />
        <ToastBanner toast={toast} onClose={clearToast} />
      </>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0B0E] text-zinc-100">
      <AppSidebar
        activeRoute={activeRoute}
        onSelect={setRoute}
        activeDeviceName={currentDevice?.deviceName || null}
        sidebarMode={sidebarMode}
        onChangeSidebarMode={setSidebarMode}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          activeRoute={activeRoute}
          user={user}
          health={health}
          currentDevice={currentDevice}
          sidebarMode={sidebarMode}
          onToggleSidebar={() =>
            setSidebarMode((cur) => (cur === "expanded" ? "hidden" : "expanded"))
          }
          onLogout={logout}
          onOpenDevices={() => setRoute("devices")}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {/* Instant Voice Browser Command Launcher Bar (shown if browser popup blocker intercepted a voice command) */}
        {pendingBrowserAction && (
          <div className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-xl border border-[#00D4FF]/45 bg-[#101828] px-4 py-2.5 shadow-lg">
            <div className="flex min-w-0 items-center gap-2.5">
              <Globe className="h-4 w-4 shrink-0 text-[#00D4FF]" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">
                  Command Ready: {pendingBrowserAction.label}
                </p>
                <p className="truncate text-[11px] text-zinc-400">{pendingBrowserAction.url}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={pendingBrowserAction.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPendingBrowserAction(null)}
                className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold"
              >
                <span>Open Now</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setPendingBrowserAction(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-3 sm:p-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeRoute}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {activeRoute === "home" && <HomeScreen />}
              {activeRoute === "assistant" && <AssistantScreen />}
              {activeRoute === "tasks" && <TasksScreen />}
              {activeRoute === "meetings" && <MeetingsScreen />}
              {activeRoute === "integrations" && <IntegrationsScreen />}
              {activeRoute === "files" && <FilesScreen />}
              {activeRoute === "memory" && <MemoryScreen />}
              {activeRoute === "devices" && <DevicesScreen />}
              {activeRoute === "settings" && <SettingsScreen />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <JarvisWakeEngine />
      <ToastBanner toast={toast} onClose={clearToast} />
    </div>
  );
}

export default App;
