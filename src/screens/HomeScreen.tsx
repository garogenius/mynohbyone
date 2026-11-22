import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Laptop,
  Server,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { AiCoreOrb } from "../components/AiCoreOrb";
import { useAppStore } from "../store/useAppStore";

const ROADMAP = [
  { phase: "Phase 0 & 1", title: "Foundation, Identity & Device Management", status: "live" },
  { phase: "Phase 2", title: "Conversation Engine & AI Streaming", status: "next" },
  { phase: "Phase 3", title: "Voice Interaction & Wake Word", status: "planned" },
  { phase: "Phase 4", title: "Task Orchestration, Permissions & Approvals", status: "planned" },
  { phase: "Phase 5", title: "Local Browser & Desktop Automation", status: "planned" },
];

export function HomeScreen() {
  const { user, devices, currentDeviceId, health, setRoute, sendHeartbeat } = useAppStore();

  const currentDevice = devices.find((d) => d.id === currentDeviceId) || null;
  const activeDevicesCount = devices.filter((d) => d.status === "active").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="ai-glass-card relative overflow-hidden rounded-3xl border border-slate-800/80 p-7"
      >
        <div className="ai-shimmer-line absolute inset-x-0 top-0 h-px" />

        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="hidden sm:block">
              <AiCoreOrb size="md" state="active" />
            </div>
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Phase 0 &amp; 1 Foundation Active</span>
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">
                Welcome, {user?.profile?.displayName || user?.name}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                Your Nohby ONE workspace is authenticated and linked to your local desktop agent.
                All actions remain scoped to authorised devices and verified permissions.
              </p>
            </div>
          </div>

          {currentDevice && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => sendHeartbeat(currentDevice.id)}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
            >
              <Activity className="h-4 w-4 text-cyan-400" />
              Verify Device Heartbeat
            </motion.button>
          )}
        </div>
      </motion.section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            label: "Backend Service",
            icon: Server,
            iconColor: "text-emerald-400",
            value: health?.status || "Unknown",
            badge: `v${health?.version || "0.1.0"}`,
            sub: (
              <p className="mt-1 text-xs text-slate-400">
                PostgreSQL:{" "}
                <span className="text-emerald-400">{health?.services.database || "ok"}</span>
              </p>
            ),
          },
          {
            label: "Registered Devices",
            icon: Laptop,
            iconColor: "text-indigo-400",
            value: `${activeDevicesCount} Active`,
            badge: `/ ${devices.length} total`,
            sub: (
              <button
                type="button"
                onClick={() => setRoute("devices")}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
              >
                Manage devices <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ),
          },
          {
            label: "Current Local Agent",
            icon: Cpu,
            iconColor: "text-cyan-400",
            value: currentDevice ? currentDevice.deviceName : "Not bound",
            badge: "",
            sub: (
              <p className="mt-1 text-xs text-slate-400">
                {currentDevice
                  ? `${currentDevice.capabilities.length} declared capabilities`
                  : "Register this machine to bind"}
              </p>
            ),
          },
        ].map((card, idx) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.06 * (idx + 1) }}
              className="ai-glass-card rounded-2xl border border-slate-800/80 p-5 transition hover:border-indigo-500/30"
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-400">
                <span>{card.label}</span>
                <Icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="truncate text-lg font-semibold capitalize text-slate-100">
                  {card.value}
                </span>
                {card.badge && (
                  <span className="font-mono text-xs text-slate-500">{card.badge}</span>
                )}
              </div>
              {card.sub}
            </motion.div>
          );
        })}
      </section>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.24 }}
        className="ai-glass-card rounded-2xl border border-slate-800/80 p-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Implementation Roadmap</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Each phase delivers real backend APIs, desktop integration, and end-to-end tests.
            </p>
          </div>
          <ShieldCheck className="h-5 w-5 text-indigo-400" />
        </div>

        <div className="mt-4 divide-y divide-slate-800/70">
          {ROADMAP.map((item) => (
            <div key={item.phase} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <CheckCircle2
                  className={`h-4 w-4 ${
                    item.status === "live"
                      ? "text-emerald-400"
                      : item.status === "next"
                      ? "text-indigo-400"
                      : "text-slate-600"
                  }`}
                />
                <div>
                  <span className="font-mono text-xs text-slate-500">{item.phase}</span>
                  <p className="text-sm font-medium text-slate-200">{item.title}</p>
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  item.status === "live"
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                    : item.status === "next"
                    ? "bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {item.status === "live" ? "Live" : item.status === "next" ? "Up Next" : "Planned"}
              </span>
            </div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
