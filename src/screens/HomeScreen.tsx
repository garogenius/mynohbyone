import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Laptop,
  MessageSquare,
  Server,
} from "lucide-react";

import { useAppStore } from "../store/useAppStore";

const ROADMAP = [
  { phase: "Phase 0 & 1", title: "Foundation, Identity & Device Management", status: "live" },
  { phase: "Phase 2", title: "Conversation Engine, AI Orchestration & WebSocket Streaming", status: "live" },
  { phase: "Phase 3", title: "Voice Interaction, STT/TTS & Wake Word", status: "next" },
  { phase: "Phase 4", title: "Task Orchestration, Permissions & Approvals", status: "planned" },
  { phase: "Phase 5", title: "Local Browser & Desktop Automation", status: "planned" },
];

export function HomeScreen() {
  const { user, devices, currentDeviceId, health, setRoute, sendHeartbeat } = useAppStore();

  const currentDevice = devices.find((d) => d.id === currentDeviceId) || null;
  const activeDevicesCount = devices.filter((d) => d.status === "active").length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="rounded-2xl border border-white/[0.08] bg-[#111318] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
              Workspace Overview
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Welcome, {user?.profile?.displayName || user?.name}
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-400 sm:text-sm">
              Your local desktop agent is authenticated and connected to the Nohby ONE backend.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRoute("assistant")}
              className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Open Assistant
            </button>
            {currentDevice && (
              <button
                type="button"
                onClick={() => sendHeartbeat(currentDevice.id)}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-white/[0.1] bg-[#171A21] px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08]"
              >
                <Activity className="h-3.5 w-3.5 text-emerald-400" />
                Verify Heartbeat
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.08] bg-[#111318] p-5">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
            <span>Backend Service</span>
            <Server className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-lg font-semibold capitalize text-white">
              {health?.status || "Unknown"}
            </span>
            <span className="font-mono text-xs text-zinc-500">v{health?.version || "0.1.0"}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            PostgreSQL: <span className="text-emerald-400">{health?.services.database || "ok"}</span>
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#111318] p-5">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
            <span>Registered Devices</span>
            <Laptop className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-lg font-semibold text-white">{activeDevicesCount} Active</span>
            <span className="text-xs text-zinc-500">/ {devices.length} total</span>
          </div>
          <button
            type="button"
            onClick={() => setRoute("devices")}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300"
          >
            Manage devices <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#111318] p-5 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
            <span>Bound Local Agent</span>
            <Cpu className="h-4 w-4 text-zinc-300" />
          </div>
          <div className="mt-3 truncate text-lg font-semibold text-white">
            {currentDevice ? currentDevice.deviceName : "Not bound"}
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {currentDevice
              ? `${currentDevice.capabilities.length} declared capabilities`
              : "Register this machine to bind"}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#111318] p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-white">Delivery Progress</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          Every phase ships real backend APIs, responsive UI integration, and end-to-end tests.
        </p>

        <div className="mt-4 divide-y divide-white/[0.06]">
          {ROADMAP.map((item) => (
            <div key={item.phase} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <CheckCircle2
                  className={`h-4 w-4 shrink-0 ${
                    item.status === "live"
                      ? "text-emerald-400"
                      : item.status === "next"
                      ? "text-indigo-400"
                      : "text-zinc-600"
                  }`}
                />
                <div className="min-w-0">
                  <span className="font-mono text-[11px] text-zinc-500">{item.phase}</span>
                  <p className="truncate text-sm font-medium text-zinc-200">{item.title}</p>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  item.status === "live"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : item.status === "next"
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "bg-white/[0.05] text-zinc-400"
                }`}
              >
                {item.status === "live" ? "Live" : item.status === "next" ? "Up Next" : "Planned"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
