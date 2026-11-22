import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Cpu,
  ListFilter,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { ApiError, apiClient } from "../lib/api";
import { executeTaskLocally } from "../lib/localAgent";
import { useAppStore } from "../store/useAppStore";
import type { Approval, Task, TaskEvent } from "../types/api";

interface TaskPreset {
  id: string;
  emoji: string;
  title: string;
  description: string;
  scheduleLabel: string;
  instruction: string;
}

const SCHEDULE_PRESETS: TaskPreset[] = [
  {
    id: "find-job",
    emoji: "💼",
    title: "Find a job",
    description: "Send me new job matches every Monday and Thursday.",
    scheduleLabel: "Mon & Thu · 9:00 AM",
    instruction: "Search for new software engineering and AI job matches every Monday and Thursday.",
  },
  {
    id: "remember-birthdays",
    emoji: "🎂",
    title: "Remember birthdays",
    description: "Remind me before birthdays so I have time to find a gift and make plans.",
    scheduleLabel: "Weekly · Mondays at 8:00 AM",
    instruction: "Check my calendar for upcoming birthdays and remind me 7 days in advance with gift ideas.",
  },
  {
    id: "track-industry-news",
    emoji: "📈",
    title: "Track industry news",
    description: "Explain what's changing in my industry every week.",
    scheduleLabel: "Weekly · Mondays at 10:00 AM",
    instruction: "Research and summarize what is changing in the AI and technology industry every week.",
  },
  {
    id: "declutter-email",
    emoji: "📩",
    title: "Declutter email",
    description: "Archive unwanted emails each week and keep the ones that matter.",
    scheduleLabel: "Weekly · Fridays at 4:00 PM",
    instruction: "Review inbox newsletters, archive unwanted promotional emails each week, and highlight priority threads.",
  },
  {
    id: "what-to-watch",
    emoji: "🎬",
    title: "What to watch",
    description: "Pick three movies or shows for me every Friday night.",
    scheduleLabel: "Fridays · 7:00 PM",
    instruction: "Pick three top-rated movies or sci-fi shows for me every Friday night.",
  },
  {
    id: "recommend-book",
    emoji: "📘",
    title: "Recommend a book",
    description: "Pick three books for me each month, based on my tastes.",
    scheduleLabel: "Monthly · 1st at 9:00 AM",
    instruction: "Pick three high-impact technology, biography, or strategy books for me each month.",
  },
];

const SCHEDULE_CADENCE_OPTIONS = [
  "Tuesdays at 2:00 PM",
  "Every Monday & Thursday at 9:00 AM",
  "Daily at 9:00 AM",
  "Fridays at 7:00 PM",
  "Monthly on the 1st",
  "Run immediately",
];

const SCHEDULE_META_KEY = "nohbyone.tasks.scheduleLabels";

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  running: "bg-[#00D4FF]/15 text-[#00D4FF] border-[#00D4FF]/35",
  awaiting_approval: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  paused: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  failed: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

function formatShortDate(iso: string | null): string {
  if (!iso) return "Nov 24";
  try {
    return new Date(iso).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Nov 24";
  }
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function TasksScreen() {
  const { currentDeviceId, showToast } = useAppStore();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<TaskEvent[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  // Schedule view vs Task detail view (defaults to Schedule a task matching Screenshot 3)
  const [showComposerModal, setShowComposerModal] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [cadence, setCadence] = useState(SCHEDULE_CADENCE_OPTIONS[0]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCompleted, setFilterCompleted] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);

  const [scheduleLabels, setScheduleLabels] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(SCHEDULE_META_KEY) || "{}");
    } catch {
      return {};
    }
  });

  const saveScheduleLabel = (taskId: string, label: string) => {
    setScheduleLabels((prev) => {
      const next = { ...prev, [taskId]: label };
      localStorage.setItem(SCHEDULE_META_KEY, JSON.stringify(next));
      return next;
    });
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, appRes] = await Promise.all([
        apiClient.listTasks({ limit: 50 }),
        apiClient.listPendingApprovals(),
      ]);
      setTasks(tasksRes.data.tasks);
      setApprovals(appRes.data.approvals);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to load scheduled tasks.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const selectTask = async (taskId: string) => {
    try {
      const detail = await apiClient.getTask(taskId);
      setSelectedTask(detail.data.task);
      setSelectedEvents(detail.data.events);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Unable to load task details.");
    }
  };

  const scheduleNewTask = async (textInstruction: string, scheduleText: string) => {
    const text = textInstruction.trim();
    if (!text || creating) return;

    setCreating(true);
    try {
      const res = await apiClient.createTask({
        instruction: text,
        deviceId: currentDeviceId,
        source: "desktop_task_centre",
      });
      saveScheduleLabel(res.data.task.id, scheduleText);
      setInstruction("");
      setShowComposerModal(false);
      showToast(
        "success",
        `Scheduled: "${text.slice(0, 42)}${text.length > 42 ? "..." : ""}" (${scheduleText})`
      );
      await loadAll();
      await selectTask(res.data.task.id);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to schedule task.");
    } finally {
      setCreating(false);
    }
  };

  const handleTaskAction = async (taskId: string, action: "pause" | "resume" | "cancel") => {
    setActingId(taskId);
    try {
      if (action === "pause") await apiClient.pauseTask(taskId);
      if (action === "resume") await apiClient.resumeTask(taskId);
      if (action === "cancel") await apiClient.cancelTask(taskId);
      showToast("info", `Task ${action}d.`);
      await loadAll();
      await selectTask(taskId);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : `Failed to ${action} task.`);
    } finally {
      setActingId(null);
    }
  };

  const handleApprovalDecision = async (approval: Approval, decision: "approve" | "reject") => {
    setActingId(approval.id);
    try {
      if (decision === "approve") {
        await apiClient.approveAction(approval.id, approval.actionFingerprint);
        showToast("success", "Task approved for execution.");
      } else {
        await apiClient.rejectAction(approval.id, "Rejected in Scheduled Tasks");
        showToast("info", "Task rejected.");
      }
      await loadAll();
      if (selectedTask) await selectTask(selectedTask.id);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Approval action failed.");
    } finally {
      setActingId(null);
    }
  };

  const handleExecuteLocally = async (task: Task) => {
    setActingId(task.id);
    try {
      await executeTaskLocally(task, currentDeviceId || "");
      showToast("success", "Task executed and verified on this device.");
      await loadAll();
      await selectTask(task.id);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Local execution failed.");
      await loadAll();
      await selectTask(task.id);
    } finally {
      setActingId(null);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filterCompleted && t.status !== "completed") return false;
    if (
      searchQuery.trim() &&
      !t.instruction.toLowerCase().includes(searchQuery.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const pendingTaskApproval = selectedTask
    ? approvals.find((a) => a.taskId === selectedTask.id && a.status === "pending")
    : null;

  return (
    <div className="flex min-h-[calc(100vh-5.5rem)] w-full flex-col gap-4 lg:h-[calc(100vh-5.25rem)] lg:flex-row lg:overflow-hidden">
      {/* ============================================================
          LEFT SIDEBAR: Scheduled + New task + Active list
          Collapsible & Hideable
          ============================================================ */}
      {leftSidebarOpen && (
        <aside className="flex w-full shrink-0 flex-col border-b border-white/[0.08] pb-4 lg:h-full lg:w-64 lg:border-b-0 lg:border-r lg:pr-4 lg:pb-0">
          {/* Top Row: Scheduled | Filter | Search | Hide */}
          <div className="flex items-center justify-between px-2 py-1.5">
            <h2 className="font-display text-sm font-semibold text-white">Scheduled</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilterCompleted((v) => !v)}
                title={filterCompleted ? "Showing completed only" : "Filter tasks"}
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                  filterCompleted
                    ? "bg-[#00D4FF]/15 text-[#00D4FF]"
                    : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <ListFilter className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSearchOpen((v) => !v)}
                title="Search scheduled tasks"
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition ${
                  searchOpen
                    ? "bg-[#00D4FF]/15 text-[#00D4FF]"
                    : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <Search className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setLeftSidebarOpen(false)}
                title="Hide Scheduled sidebar"
                aria-label="Hide Scheduled sidebar"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {searchOpen && (
            <div className="mt-1 px-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                autoFocus
                className="studio-input h-7 w-full rounded-lg px-2.5 text-xs"
              />
            </div>
          )}

          {/* + New task button */}
          <button
            type="button"
            onClick={() => {
              setSelectedTask(null);
              setShowComposerModal(true);
            }}
            className="mt-2 flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-white transition hover:bg-white/[0.06]"
          >
            <Plus className="h-4 w-4 text-zinc-300" />
            <span>New task</span>
          </button>

          {/* Active Section */}
          <div className="mt-4 flex-1 overflow-y-auto px-1">
            <p className="px-1.5 text-[11px] font-medium text-zinc-400">
              {filterCompleted ? "Completed" : "Active"}
            </p>

            <div className="mt-2 space-y-1">
              {loading ? (
                <div className="flex items-center gap-2 px-2 py-4 text-xs text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#00D4FF]" />
                  Loading...
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="rounded-xl px-2 py-3 text-left">
                  <p className="truncate text-xs font-medium text-zinc-300">
                    No scheduled tasks yet
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Pick a template or click + New task
                  </p>
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const isSelected = selectedTask?.id === task.id;
                  const sched =
                    scheduleLabels[task.id] ||
                    `${formatShortDate(task.createdAt)} · Tuesdays at 2:00 PM`;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => selectTask(task.id)}
                      className={`w-full rounded-xl px-2.5 py-2 text-left transition ${
                        isSelected
                          ? "bg-[#00D4FF]/12 text-white ring-1 ring-[#00D4FF]/40"
                          : "hover:bg-white/[0.05]"
                      }`}
                    >
                      <p className="truncate text-xs font-medium text-white">
                        {task.instruction}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-zinc-400">{sched}</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      )}

      {/* ============================================================
          RIGHT MAIN STAGE: "Schedule a task" 6-card gallery OR Selected Task Detail
          ============================================================ */}
      <section className="flex flex-1 flex-col overflow-y-auto px-2 py-4 sm:px-6">
        {!leftSidebarOpen && (
          <div className="mb-2 flex items-center">
            <button
              type="button"
              onClick={() => setLeftSidebarOpen(true)}
              title="Show Scheduled sidebar"
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#141B2D]/80 px-2.5 text-[11px] font-medium text-zinc-300 transition hover:border-[#00D4FF]/50 hover:text-white"
            >
              <PanelLeftOpen className="h-3.5 w-3.5 text-[#00D4FF]" />
              <span>Show Scheduled</span>
            </button>
          </div>
        )}
        {!selectedTask ? (
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center py-4">
            {/* Top Calendar Check Icon & Title matching Screenshot 3 */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-zinc-400">
                <CalendarCheck className="h-9 w-9 stroke-[1.6]" />
              </div>
              <h1 className="font-display mt-2 text-lg font-semibold text-white">
                Schedule a task
              </h1>
              <p className="mt-1 text-xs text-zinc-400">
                NohbyAI can take care of ongoing tasks so you don&apos;t have to.
              </p>
            </div>

            {/* 2-Column Grid of 6 Preset Cards (Exact Screenshot 3 Match) */}
            <div className="mt-8 grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2">
              {SCHEDULE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={creating}
                  onClick={() => scheduleNewTask(preset.instruction, preset.scheduleLabel)}
                  className="group flex items-start gap-3.5 rounded-2xl border border-white/[0.08] bg-[#101624] p-4 text-left shadow-xs transition hover:border-[#00D4FF]/45 hover:bg-[#141B2D]"
                >
                  <span className="mt-0.5 text-xl leading-none" aria-hidden="true">
                    {preset.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-white group-hover:text-[#00D4FF]">
                      {preset.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                      {preset.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Selected Task Detail & Local Execution View */
          <div className="mx-auto w-full max-w-3xl space-y-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Schedule a task
              </button>

              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${
                  STATUS_BADGE[selectedTask.status] || "bg-zinc-500/15 text-zinc-400"
                }`}
              >
                {selectedTask.status.replace("_", " ")}
              </span>
            </div>

            <div className="nohby-frame space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold text-white">
                    {selectedTask.instruction}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                    <Clock className="h-3.5 w-3.5 text-[#00D4FF]" />
                    <span>
                      {scheduleLabels[selectedTask.id] ||
                        `${formatShortDate(selectedTask.createdAt)} · Tuesdays at 2:00 PM`}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(selectedTask.status === "queued" || selectedTask.status === "running") && (
                    <button
                      type="button"
                      disabled={actingId === selectedTask.id}
                      onClick={() => handleExecuteLocally(selectedTask)}
                      className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs"
                    >
                      {actingId === selectedTask.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Cpu className="h-3.5 w-3.5" />
                      )}
                      Run on This Device
                    </button>
                  )}

                  {selectedTask.status === "running" && (
                    <button
                      type="button"
                      onClick={() => handleTaskAction(selectedTask.id, "pause")}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.1] px-3 text-xs text-zinc-300 hover:bg-white/[0.06]"
                    >
                      <Pause className="h-3.5 w-3.5" />
                      Pause
                    </button>
                  )}

                  {selectedTask.status === "paused" && (
                    <button
                      type="button"
                      onClick={() => handleTaskAction(selectedTask.id, "resume")}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.1] px-3 text-xs text-zinc-300 hover:bg-white/[0.06]"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Resume
                    </button>
                  )}

                  {selectedTask.status !== "completed" && selectedTask.status !== "cancelled" && (
                    <button
                      type="button"
                      onClick={() => handleTaskAction(selectedTask.id, "cancel")}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-xs text-rose-400 hover:bg-rose-500/20"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Pending Approval Banner */}
              {pendingTaskApproval && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
                    <div className="text-xs">
                      <p className="font-semibold text-white">Explicit Approval Required</p>
                      <p className="text-zinc-300">
                        This scheduled task includes a high-risk action and awaits your confirmation.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={actingId === pendingTaskApproval.id}
                      onClick={() => handleApprovalDecision(pendingTaskApproval, "approve")}
                      className="btn-ivory inline-flex h-7 items-center gap-1 rounded-lg px-3 text-xs"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={actingId === pendingTaskApproval.id}
                      onClick={() => handleApprovalDecision(pendingTaskApproval, "reject")}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 text-xs text-rose-400"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Proposed Plan Steps */}
              {selectedTask.steps && selectedTask.steps.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Execution Plan ({selectedTask.steps.length} steps)
                  </p>
                  <div className="space-y-1.5">
                    {selectedTask.steps.map((step) => (
                      <div
                        key={step.id}
                        className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-[#141B2D]/70 px-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#00D4FF]/15 font-mono text-[10px] font-bold text-[#00D4FF]">
                            {step.sequenceNumber}
                          </span>
                          <span className="font-mono text-[11px] text-[#00D4FF]">{step.toolName}</span>
                          <span className="text-zinc-200">{step.action}</span>
                        </div>
                        {step.requiresApproval && (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                            Approval Gated
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verified Execution Result */}
              {selectedTask.result && Object.keys(selectedTask.result).length > 0 && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs">
                  <p className="flex items-center gap-1.5 font-semibold text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verified Execution Result
                  </p>
                  <pre className="mt-1.5 overflow-x-auto font-mono text-[11px] whitespace-pre-wrap text-zinc-200">
                    {JSON.stringify(selectedTask.result, null, 2)}
                  </pre>
                </div>
              )}

              {/* Audit Timeline */}
              {selectedEvents.length > 0 && (
                <div className="space-y-1.5 border-t border-white/[0.07] pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    Activity Log
                  </p>
                  {selectedEvents.slice(-4).map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between text-[11px] text-zinc-400"
                    >
                      <span>{String(ev.eventData?.message || ev.eventType)}</span>
                      <span>{formatTimestamp(ev.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* + New Scheduled Task Modal */}
      {showComposerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="dropdown-surface w-full max-w-md rounded-2xl p-5">
            <h3 className="font-display text-sm font-semibold text-white">Schedule a new task</h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              Describe what NohbyAI should handle and choose a schedule.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                scheduleNewTask(instruction, cadence);
              }}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">
                  Task Instruction
                </label>
                <textarea
                  rows={3}
                  required
                  autoFocus
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="e.g., Review NattyBank implementation every Tuesday at 2:00 PM..."
                  className="studio-input w-full rounded-xl p-3 text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">Schedule</label>
                <select
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value)}
                  className="studio-input h-9 w-full rounded-xl px-3 text-xs"
                >
                  {SCHEDULE_CADENCE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowComposerModal(false)}
                  className="h-8 rounded-lg border border-white/[0.1] px-3 text-xs text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!instruction.trim() || creating}
                  className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-4 text-xs"
                >
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CalendarCheck className="h-3.5 w-3.5" />
                  )}
                  Schedule Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
