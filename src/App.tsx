import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, RefreshCw, WifiOff } from "lucide-react";

import { AppSidebar } from "./components/AppSidebar";
import { BrandMark } from "./components/BrandMark";
import { JarvisWakeEngine } from "./components/JarvisWakeEngine";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { ToastBanner } from "./components/StateViews";
import { Topbar } from "./components/Topbar";
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

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

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
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          activeRoute={activeRoute}
          user={user}
          health={health}
          currentDevice={currentDevice}
          onLogout={logout}
          onOpenDevices={() => setRoute("devices")}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-3 sm:p-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeRoute}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {(activeRoute === "home" || activeRoute === "assistant") && <HomeScreen />}
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

        <MobileBottomNav activeRoute={activeRoute} onSelect={setRoute} />
      </div>

      <JarvisWakeEngine />
      <ToastBanner toast={toast} onClose={clearToast} />
    </div>
  );
}

export default App;
