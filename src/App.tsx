import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, RefreshCw, WifiOff } from "lucide-react";

import { AppSidebar } from "./components/AppSidebar";
import { BrandMark } from "./components/BrandMark";
import { MobileBottomNav } from "./components/MobileBottomNav";
import { ToastBanner } from "./components/StateViews";
import { Topbar } from "./components/Topbar";
import { AssistantScreen } from "./screens/AssistantScreen";
import { AuthScreen } from "./screens/AuthScreen";
import { DeviceOnboardingScreen } from "./screens/DeviceOnboardingScreen";
import { DevicesScreen } from "./screens/DevicesScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { UpcomingModuleScreen } from "./screens/UpcomingModuleScreen";
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0B0E] px-4">
        <BrandMark size="lg" />
        <h1 className="mt-5 text-base font-semibold tracking-tight text-white">Nohby ONE</h1>
        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
          <span>{bootMessage}</span>
        </div>
      </div>
    );
  }

  if (phase === "offline") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0A0B0E] px-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-400">
          <WifiOff className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-base font-semibold text-white">Backend Unavailable</h1>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-zinc-400">
          {error || "Could not connect to the Nohby ONE backend service. Ensure the API is running."}
        </p>
        <button
          type="button"
          onClick={() => bootstrap()}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
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

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
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
              {activeRoute === "devices" && <DevicesScreen />}
              {activeRoute === "settings" && <SettingsScreen />}
              {activeRoute !== "home" &&
                activeRoute !== "assistant" &&
                activeRoute !== "devices" &&
                activeRoute !== "settings" && <UpcomingModuleScreen route={activeRoute} />}
            </motion.div>
          </AnimatePresence>
        </main>

        <MobileBottomNav activeRoute={activeRoute} onSelect={setRoute} />
      </div>

      <ToastBanner toast={toast} onClose={clearToast} />
    </div>
  );
}

export default App;
