import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Laptop,
  ListChecks,
  Loader2,
  MessageSquare,
  Send,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { ApiError, apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { Approval, Conversation, Task } from "../types/api";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function HomeScreen() {
  const { user, devices, currentDeviceId, setRoute, sendHeartbeat, showToast } = useAppStore();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [quickPrompt, setQuickPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentDevice = devices.find((d) => d.id === currentDeviceId) || null;
  const activeDevicesCount = devices.filter((d) => d.status === "active").length;

  useEffect(() => {
    Promise.all([
      apiClient.listTasks({ limit: 6 }).catch(() => null),
      apiClient.listPendingApprovals().catch(() => null),
      apiClient.listConversations({ limit: 5 }).catch(() => null),
    ]).then(([tRes, aRes, cRes]) => {
      if (tRes) setTasks(tRes.data.tasks);
      if (aRes) setApprovals(aRes.data.approvals);
      if (cRes) setConversations(cRes.data.conversations);
    });
  }, []);

  const handleQuickTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = quickPrompt.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    try {
      const res = await apiClient.createTask({
        instruction: text,
        deviceId: currentDeviceId,
        source: "home_quick_command",
      });
      setQuickPrompt("");
      setTasks((prev) => [res.data.task, ...prev.slice(0, 5)]);
      if (res.data.task.approvals.length > 0) {
        setApprovals((prev) => [...res.data.task.approvals, ...prev]);
      }
      showToast(
        "success",
        res.data.task.status === "awaiting_approval"
          ? "Task planned — review approval in Tasks."
          : "Task created and queued."
      );
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Unable to create task.");
    } finally {
      setSubmitting(false);
    }
  };

  const activeTaskCount = tasks.filter((t) =>
    ["queued", "running", "awaiting_approval", "paused"].includes(t.status)
  ).length;
  const completedTaskCount = tasks.filter((t) => t.status === "completed").length;

  return (
    <div className="w-full space-y-4">
      {/* Modern Executive Header Banner */}
      <section className="rounded-xl border border-white/[0.08] bg-[#111318] p-5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h2 className="font-display mt-1 text-xl font-semibold tracking-tight text-white">
              {getGreeting()}, {user?.profile?.displayName || user?.name}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRoute("assistant")}
              className="btn-ivory inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Launch Assistant</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setRoute("tasks")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#171A21] px-3.5 text-xs font-medium text-zinc-200 transition hover:border-white/[0.2]"
            >
              <ListChecks className="h-3.5 w-3.5 text-[#0066FF]" />
              <span>Task Centre</span>
            </button>
          </div>
        </div>

        {/* Inline Task Orchestration Command Input */}
        <form onSubmit={handleQuickTask} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={quickPrompt}
            onChange={(e) => setQuickPrompt(e.target.value)}
            placeholder="Plan a new automated task (e.g. 'Schedule a sync tomorrow' or 'Research cloud providers')..."
            className="studio-input h-9 flex-1 rounded-lg px-3 text-[13px]"
          />
          <button
            type="submit"
            disabled={submitting || !quickPrompt.trim()}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#0066FF]/40 bg-[#0066FF]/10 px-4 text-xs font-semibold text-[#0066FF] transition hover:bg-[#0066FF]/20 disabled:opacity-40"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Plan Task
          </button>
        </form>
      </section>

      {/* Pending Approvals Callout (only shown when action is needed) */}
      {approvals.length > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs font-medium text-white">
              You have <strong>{approvals.length}</strong> sensitive action
              {approvals.length === 1 ? "" : "s"} awaiting your explicit approval.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRoute("tasks")}
            className="btn-ivory inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs"
          >
            Review Now <ArrowRight className="h-3 w-3" />
          </button>
        </section>
      )}

      {/* 4 Modern KPI Stat Cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Active Tasks",
            value: activeTaskCount,
            sub: `${completedTaskCount} completed`,
            icon: ListChecks,
            accent: "text-[#0066FF]",
            route: "tasks" as const,
          },
          {
            label: "Pending Approvals",
            value: approvals.length,
            sub: approvals.length > 0 ? "Action required" : "All clear",
            icon: approvals.length > 0 ? ShieldAlert : ShieldCheck,
            accent: approvals.length > 0 ? "text-amber-500" : "text-emerald-500",
            route: "tasks" as const,
          },
          {
            label: "Assistant Threads",
            value: conversations.length,
            sub: "Standalone chat",
            icon: MessageSquare,
            accent: "text-[#0066FF]",
            route: "assistant" as const,
          },
          {
            label: "Connected Devices",
            value: activeDevicesCount,
            sub: currentDevice ? currentDevice.deviceName : "Not bound",
            icon: Laptop,
            accent: "text-emerald-500",
            route: "devices" as const,
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <button
              key={kpi.label}
              type="button"
              onClick={() => setRoute(kpi.route)}
              className="group rounded-xl border border-white/[0.08] bg-[#111318] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#0066FF]/40"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400">{kpi.label}</span>
                <Icon className={`h-4 w-4 ${kpi.accent}`} />
              </div>
              <p className="font-display mt-2 text-2xl font-semibold tracking-tight text-white">
                {kpi.value}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">{kpi.sub}</p>
            </button>
          );
        })}
      </section>

      {/* Main 2-Column Operations Grid */}
      <section className="grid gap-4 lg:grid-cols-12">
        {/* Left: Task Activity Feed */}
        <div className="rounded-xl border border-white/[0.08] bg-[#111318] p-5 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-white">Task Queue &amp; Activity</h3>
              <p className="text-[11px] text-zinc-500">Latest orchestrated workflows</p>
            </div>
            <button
              type="button"
              onClick={() => setRoute("tasks")}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#0066FF] hover:underline"
            >
              All tasks <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {tasks.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-white/[0.1] px-4 py-10 text-center">
              <CheckCircle2 className="mx-auto h-5 w-5 text-zinc-500" />
              <p className="mt-2 text-xs font-medium text-white">No tasks in your queue</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Type an instruction above or launch the Assistant to start a workflow.
              </p>
            </div>
          ) : (
            <div className="mt-2 divide-y divide-white/[0.06]">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setRoute("tasks")}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left transition hover:opacity-85"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-white">{task.instruction}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatShortTime(task.createdAt)}
                      </span>
                      <span>·</span>
                      <span>{task.steps.length} steps</span>
                      <span>·</span>
                      <span className="font-mono uppercase">{task.riskLevel}</span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium capitalize ${
                      task.status === "awaiting_approval"
                        ? "bg-amber-500/15 text-amber-500"
                        : task.status === "queued" || task.status === "running"
                        ? "bg-blue-500/15 text-blue-500"
                        : task.status === "completed"
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-zinc-500/15 text-zinc-400"
                    }`}
                  >
                    {task.status.replace("_", " ")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Standalone Assistant Threads + Active Local Agent */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-white/[0.08] bg-[#111318] p-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Recent Assistant Chats</h3>
                <p className="text-[11px] text-zinc-500">Opens in standalone Assistant view</p>
              </div>
              <button
                type="button"
                onClick={() => setRoute("assistant")}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0066FF] hover:underline"
              >
                Open <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>

            {conversations.length === 0 ? (
              <div className="mt-4 py-4 text-center">
                <p className="text-xs text-zinc-500">No conversations yet.</p>
                <button
                  type="button"
                  onClick={() => setRoute("assistant")}
                  className="btn-ivory mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Start First Chat
                </button>
              </div>
            ) : (
              <div className="mt-2 divide-y divide-white/[0.06]">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setRoute("assistant")}
                    className="block w-full py-2.5 text-left transition hover:opacity-85"
                  >
                    <p className="truncate text-xs font-medium text-white">{conv.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                      {conv.lastMessagePreview || "Click to continue in Assistant"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {currentDevice && (
            <div className="rounded-xl border border-white/[0.08] bg-[#111318] p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <p className="truncate text-xs font-semibold text-white">
                      {currentDevice.deviceName}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] capitalize text-zinc-500">
                    {currentDevice.platform} · {currentDevice.capabilities.length} active
                    capabilities
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => sendHeartbeat(currentDevice.id)}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#171A21] px-2.5 text-xs font-medium text-zinc-200 transition hover:border-white/[0.2]"
                >
                  <Activity className="h-3.5 w-3.5 text-emerald-500" />
                  Ping
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
