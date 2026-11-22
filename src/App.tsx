import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, RefreshCw, WifiOff } from "lucide-react";

import { AiCoreOrb } from "./components/AiCoreOrb";
import { AmbientNeuralField } from "./components/AmbientNeuralField";
import { AppSidebar } from "./components/AppSidebar";
import { ToastBanner } from "./components/StateViews";
import { Topbar } from "./components/Topbar";
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

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const currentDevice = devices.find((d) => d.id === currentDeviceId) || null;

  if (phase === "booting") {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#070A10] px-4">
        <AmbientNeuralField intensity="vivid" />
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative z-10 flex flex-col items-center"
        >
          <AiCoreOrb size="lg" state="booting" />
          <h1 className="mt-6 text-xl font-bold tracking-tight text-white">Nohby ONE</h1>
          <div className="mt-3 flex items-center gap-2.5 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
            <span>{bootMessage}</span>
          </div>
        </motion.div>
      </div>
    );
  }

  if (phase === "offline") {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#070A10] px-4 text-center">
        <AmbientNeuralField intensity="subtle" />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 flex flex-col items-center"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
            <WifiOff className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-lg font-semibold text-white">Backend Unavailable</h1>
          <p className="mt-2 max-w-md text-sm text-slate-400">
            {error || "Could not connect to the Nohby ONE backend service. Ensure the API is running."}
          </p>
          <button
            type="button"
            onClick={() => bootstrap()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            <RefreshCw className="h-4 w-4" />
            Retry Connection
          </button>
        </motion.div>
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
    <div className="relative flex h-screen overflow-hidden bg-[#070A10] text-slate-100">
      <AmbientNeuralField intensity="subtle" />

      <div className="relative z-10 flex h-full w-full overflow-hidden">
        <AppSidebar
          activeRoute={activeRoute}
          onSelect={setRoute}
          activeDeviceName={currentDevice?.deviceName || null}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            activeRoute={activeRoute}
            user={user}
            health={health}
            currentDevice={currentDevice}
            onLogout={logout}
            onOpenDevices={() => setRoute("devices")}
          />

          <main className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeRoute}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                {activeRoute === "home" && <HomeScreen />}
                {activeRoute === "devices" && <DevicesScreen />}
                {activeRoute === "settings" && <SettingsScreen />}
                {activeRoute !== "home" &&
                  activeRoute !== "devices" &&
                  activeRoute !== "settings" && <UpcomingModuleScreen route={activeRoute} />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <ToastBanner toast={toast} onClose={clearToast} />
    </div>
  );
}

export default App;
