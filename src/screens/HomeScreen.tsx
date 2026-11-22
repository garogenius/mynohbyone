import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Laptop,
  ListChecks,
  Loader2,
  MessageSquare,
  Send,
  ShieldAlert,
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
      apiClient.listTasks({ limit: 5 }).catch(() => null),
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
      setTasks((prev) => [res.data.task, ...prev.slice(0, 4)]);
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

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Greeting & Quick Command Bar */}
      <section className="rounded-xl border border-white/[0.08] bg-[#111318] p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight text-white">
              {getGreeting()}, {user?.profile?.displayName || user?.name}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Issue a command, review pending approvals, or pick up a recent conversation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRoute("assistant")}
            className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-white/[0.1] bg-[#171A21] px-3 text-xs font-medium text-zinc-200 transition hover:border-white/[0.2] sm:self-auto"
          >
            <MessageSquare className="h-3.5 w-3.5 text-[#0066FF]" />
            Open Assistant
          </button>
        </div>

        <form onSubmit={handleQuickTask} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={quickPrompt}
            onChange={(e) => setQuickPrompt(e.target.value)}
            placeholder="Ask Nohby ONE to plan a task (e.g. 'Find available time tomorrow' or 'Research cloud hosts')..."
            className="studio-input h-9 flex-1 rounded-lg px-3 text-[13px]"
          />
          <button
            type="submit"
            disabled={submitting || !quickPrompt.trim()}
            className="btn-ivory inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-xs"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Run Command
          </button>
        </form>
      </section>

      {/* Production KPI Metrics Row */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => setRoute("tasks")}
          className="rounded-xl border border-white/[0.08] bg-[#111318] p-4 text-left transition hover:border-white/[0.18]"
        >
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Active Tasks</span>
            <ListChecks className="h-4 w-4 text-[#0066FF]" />
          </div>
          <p className="font-display mt-2 text-2xl font-semibold text-white">{activeTaskCount}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">{tasks.length} total recent</p>
        </button>

        <button
          type="button"
          onClick={() => setRoute("tasks")}
          className="rounded-xl border border-white/[0.08] bg-[#111318] p-4 text-left transition hover:border-white/[0.18]"
        >
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Pending Approvals</span>
            <ShieldAlert
              className={`h-4 w-4 ${approvals.length > 0 ? "text-amber-500" : "text-zinc-500"}`}
            />
          </div>
          <p className="font-display mt-2 text-2xl font-semibold text-white">{approvals.length}</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {approvals.length > 0 ? "Requires your review" : "All actions cleared"}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setRoute("assistant")}
          className="rounded-xl border border-white/[0.08] bg-[#111318] p-4 text-left transition hover:border-white/[0.18]"
        >
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Conversations</span>
            <MessageSquare className="h-4 w-4 text-[#0066FF]" />
          </div>
          <p className="font-display mt-2 text-2xl font-semibold text-white">
            {conversations.length}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">Recent assistant threads</p>
        </button>

        <button
          type="button"
          onClick={() => setRoute("devices")}
          className="rounded-xl border border-white/[0.08] bg-[#111318] p-4 text-left transition hover:border-white/[0.18]"
        >
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Active Devices</span>
            <Laptop className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="font-display mt-2 text-2xl font-semibold text-white">
            {activeDevicesCount}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">
            {currentDevice ? currentDevice.deviceName : "No local device bound"}
          </p>
        </button>
      </section>

      {/* Main Production 2-Column Workspace */}
      <section className="grid gap-4 lg:grid-cols-12">
        {/* Left: Recent Tasks & Approvals */}
        <div className="rounded-xl border border-white/[0.08] bg-[#111318] p-5 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Recent Tasks</h3>
            <button
              type="button"
              onClick={() => setRoute("tasks")}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#0066FF] hover:underline"
            >
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {tasks.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-white/[0.1] px-4 py-8 text-center">
              <CheckCircle2 className="mx-auto h-5 w-5 text-zinc-500" />
              <p className="mt-2 text-xs font-medium text-white">No tasks scheduled yet</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Use the command bar above to plan your first automated workflow.
              </p>
            </div>
          ) : (
            <div className="mt-3 divide-y divide-white/[0.06]">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setRoute("tasks")}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition hover:opacity-85"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-white">{task.instruction}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {task.steps.length} steps · {formatShortTime(task.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
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

        {/* Right: Recent Conversations + Local Device Status */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-white/[0.08] bg-[#111318] p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Recent Conversations</h3>
              <button
                type="button"
                onClick={() => setRoute("assistant")}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0066FF] hover:underline"
              >
                Open <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            {conversations.length === 0 ? (
              <p className="mt-4 text-xs text-zinc-500">
                No conversations yet. Start a thread in Assistant.
              </p>
            ) : (
              <div className="mt-3 divide-y divide-white/[0.06]">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => setRoute("assistant")}
                    className="block w-full py-2.5 text-left transition hover:opacity-85"
                  >
                    <p className="truncate text-xs font-medium text-white">{conv.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                      {conv.lastMessagePreview || "Empty conversation"}
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
                  <p className="text-xs font-semibold text-white">{currentDevice.deviceName}</p>
                  <p className="mt-0.5 text-[11px] capitalize text-zinc-500">
                    {currentDevice.platform} · {currentDevice.capabilities.length} capabilities
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
