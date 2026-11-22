import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  ListFilter,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
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

interface TaskScheduleMeta {
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm (24h)
  recurrence: string;
  label: string;
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

const RECURRENCE_OPTIONS = [
  "Once on selected date",
  "Daily",
  "Weekly",
  "Every Mon & Thu",
  "Weekdays (Mon–Fri)",
  "Monthly",
];

const QUICK_TIMES = [
  { value: "08:00", label: "8:00 AM" },
  { value: "09:00", label: "9:00 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "17:00", label: "5:00 PM" },
  { value: "20:00", label: "8:00 PM" },
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SCHEDULE_META_KEY = "nohbyone.tasks.scheduleMetaV2";

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  running: "bg-[#00D4FF]/15 text-[#00D4FF] border-[#00D4FF]/35",
  awaiting_approval: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  paused: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  failed: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

function toDateInputString(d: Date): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${day}`;
}

function format12HourTime(time24: string): string {
  const [hStr, mStr] = (time24 || "14:00").split(":");
  const h = Number(hStr);
  const m = mStr || "00";
  if (Number.isNaN(h)) return time24;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

function formatFriendlyScheduleLabel(dateStr: string, timeStr: string, recurrence: string): string {
  try {
    const [yr, mo, day] = dateStr.split("-").map(Number);
    const d = new Date(yr, (mo || 1) - 1, day || 1);
    const shortDate = d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    const time12 = format12HourTime(timeStr);
    if (recurrence && recurrence !== "Once on selected date") {
      return `${shortDate} · ${time12} (${recurrence})`;
    }
    return `${shortDate} at ${time12}`;
  } catch {
    return `${dateStr} · ${format12HourTime(timeStr)}`;
  }
}

function formatShortDate(iso: string | null): string {
  if (!iso) return "Today";
  try {
    return new Date(iso).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Today";
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

  // Schedule & Edit Modal with Interactive Calendar Grid
  const [showComposerModal, setShowComposerModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [instruction, setInstruction] = useState("");

  const todayDate = useMemo(() => new Date(), []);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() =>
    toDateInputString(new Date())
  );
  const [selectedTimeStr, setSelectedTimeStr] = useState<string>("14:00");
  const [recurrence, setRecurrence] = useState<string>(RECURRENCE_OPTIONS[0]);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCompleted, setFilterCompleted] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);

  const [scheduleMetaMap, setScheduleMetaMap] = useState<Record<string, TaskScheduleMeta>>(() => {
    try {
      return JSON.parse(localStorage.getItem(SCHEDULE_META_KEY) || "{}");
    } catch {
      return {};
    }
  });

  const saveTaskScheduleMeta = (taskId: string, meta: TaskScheduleMeta) => {
    setScheduleMetaMap((prev) => {
      const next = { ...prev, [taskId]: meta };
      localStorage.setItem(SCHEDULE_META_KEY, JSON.stringify(next));
      return next;
    });
  };

  const getTaskScheduleDisplay = (task: Task): string => {
    const localMeta = scheduleMetaMap[task.id];
    if (localMeta?.label) return localMeta.label;
    const serverLabel =
      task.result && typeof task.result.scheduleLabel === "string"
        ? task.result.scheduleLabel
        : null;
    if (serverLabel) return serverLabel;
    return `${formatShortDate(task.createdAt)} · 2:00 PM`;
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

  const openNewTaskModal = (presetInstruction = "", presetRecurrence = RECURRENCE_OPTIONS[0]) => {
    setEditingTask(null);
    setInstruction(presetInstruction);
    const now = new Date();
    setSelectedDateStr(toDateInputString(now));
    setSelectedTimeStr("09:00");
    setRecurrence(presetRecurrence);
    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setShowComposerModal(true);
  };

  const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
    setInstruction(task.instruction);
    const meta = scheduleMetaMap[task.id];
    const dateStr = meta?.dateStr || toDateInputString(new Date(task.createdAt || Date.now()));
    const timeStr = meta?.timeStr || "14:00";
    const rec = meta?.recurrence || RECURRENCE_OPTIONS[0];
    setSelectedDateStr(dateStr);
    setSelectedTimeStr(timeStr);
    setRecurrence(rec);
    const [yr, mo] = dateStr.split("-").map(Number);
    if (yr && mo) {
      setCalendarMonth(new Date(yr, mo - 1, 1));
    }
    setShowComposerModal(true);
  };

  const handleSaveOrScheduleTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = instruction.trim();
    if (!text || creating) return;

    const friendlyLabel = formatFriendlyScheduleLabel(selectedDateStr, selectedTimeStr, recurrence);
    const scheduledIso = `${selectedDateStr}T${selectedTimeStr}:00`;
    const meta: TaskScheduleMeta = {
      dateStr: selectedDateStr,
      timeStr: selectedTimeStr,
      recurrence,
      label: friendlyLabel,
    };

    setCreating(true);
    try {
      if (editingTask) {
        const res = await apiClient.updateTask(editingTask.id, {
          instruction: text,
          scheduledAt: scheduledIso,
          scheduleLabel: friendlyLabel,
          recurrence,
        });
        saveTaskScheduleMeta(editingTask.id, meta);
        setShowComposerModal(false);
        setEditingTask(null);
        showToast("success", `Updated task schedule (${friendlyLabel}).`);
        await loadAll();
        setSelectedTask(res.data.task);
      } else {
        const res = await apiClient.createTask({
          instruction: text,
          deviceId: currentDeviceId,
          source: "desktop_task_centre",
        });
        await apiClient
          .updateTask(res.data.task.id, {
            scheduledAt: scheduledIso,
            scheduleLabel: friendlyLabel,
            recurrence,
          })
          .catch(() => null);
        saveTaskScheduleMeta(res.data.task.id, meta);
        setInstruction("");
        setShowComposerModal(false);
        showToast(
          "success",
          `Scheduled: "${text.slice(0, 42)}${text.length > 42 ? "..." : ""}" (${friendlyLabel})`
        );
        await loadAll();
        await selectTask(res.data.task.id);
      }
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to save scheduled task.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setActingId(taskId);
    try {
      await apiClient.deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      if (selectedTask?.id === taskId) {
        setSelectedTask(null);
        setSelectedEvents([]);
      }
      showToast("info", "Scheduled task deleted.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to delete task.");
    } finally {
      setActingId(null);
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

  // Build calendar cells for calendarMonth
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ day: number | null; dateStr: string }> = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ day: null, dateStr: "" });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, dateStr: ds });
    }
    return cells;
  }, [calendarMonth]);

  const scheduledDatesSet = useMemo(() => {
    const s = new Set<string>();
    Object.values(scheduleMetaMap).forEach((m) => {
      if (m?.dateStr) s.add(m.dateStr);
    });
    return s;
  }, [scheduleMetaMap]);

  const todayStr = toDateInputString(todayDate);

  return (
    <div className="flex min-h-[calc(100vh-5.5rem)] w-full flex-col gap-4 lg:h-[calc(100vh-5.25rem)] lg:flex-row lg:overflow-hidden">
      {/* ============================================================
          LEFT SIDEBAR: Scheduled + New task + Active list (Edit & Delete)
          ============================================================ */}
      {leftSidebarOpen && (
        <aside className="flex w-full shrink-0 flex-col border-b border-white/[0.08] pb-4 lg:h-full lg:w-68 lg:border-b-0 lg:border-r lg:pr-4 lg:pb-0">
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

          {/* + New task button (opens Calendar Date & Time Picker modal) */}
          <button
            type="button"
            onClick={() => openNewTaskModal()}
            className="mt-2 flex items-center justify-between rounded-xl border border-[#00D4FF]/35 bg-[#00D4FF]/10 px-3 py-2 text-left text-xs font-semibold text-[#00D4FF] transition hover:bg-[#00D4FF]/20"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span>New task</span>
            </span>
            <CalendarIcon className="h-3.5 w-3.5 opacity-80" />
          </button>

          {/* Active Section */}
          <div className="mt-4 flex-1 overflow-y-auto px-1">
            <p className="px-1.5 text-[11px] font-medium text-zinc-400">
              {filterCompleted ? "Completed" : "Active"} ({filteredTasks.length})
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
                  const sched = getTaskScheduleDisplay(task);
                  return (
                    <div
                      key={task.id}
                      onClick={() => selectTask(task.id)}
                      className={`group flex cursor-pointer items-start justify-between gap-1.5 rounded-xl px-2.5 py-2 text-left transition ${
                        isSelected
                          ? "bg-[#00D4FF]/12 text-white ring-1 ring-[#00D4FF]/40"
                          : "hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-white">
                          {task.instruction}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-[#00D4FF]/90">{sched}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5 opacity-75 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditTaskModal(task);
                          }}
                          className="rounded p-1 text-zinc-400 hover:bg-white/[0.08] hover:text-[#00D4FF]"
                          title="Edit instruction or change calendar date & time"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTask(task.id);
                          }}
                          className="rounded p-1 text-zinc-400 hover:bg-rose-500/15 hover:text-rose-400"
                          title="Delete task"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
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
            {/* Top Calendar Check Icon & Title */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-zinc-400">
                <CalendarCheck className="h-9 w-9 stroke-[1.6]" />
              </div>
              <h1 className="font-display mt-2 text-lg font-semibold text-white">
                Schedule a task
              </h1>
              <p className="mt-1 text-xs text-zinc-400">
                NohbyAI can take care of ongoing tasks so you don&apos;t have to. Pick a template or open the calendar to choose any date &amp; time.
              </p>
              <button
                type="button"
                onClick={() => openNewTaskModal()}
                className="btn-ivory mt-3 inline-flex h-8 items-center gap-1.5 rounded-full px-4 text-xs"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                Select Date &amp; Time on Calendar
              </button>
            </div>

            {/* 2-Column Grid of 6 Preset Cards (Opens Calendar Date & Time Picker pre-filled!) */}
            <div className="mt-7 grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2">
              {SCHEDULE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={creating}
                  onClick={() => openNewTaskModal(preset.instruction, "Weekly")}
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

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditTaskModal(selectedTask)}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-2.5 text-[11px] font-medium text-[#00D4FF] hover:bg-[#00D4FF]/20"
                >
                  <Pencil className="h-3 w-3" />
                  Edit / Change Date &amp; Time
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteTask(selectedTask.id)}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-rose-500/35 bg-rose-500/10 px-2.5 text-[11px] font-medium text-rose-400 hover:bg-rose-500/20"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete Task
                </button>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium capitalize ${
                    STATUS_BADGE[selectedTask.status] || "bg-zinc-500/15 text-zinc-400"
                  }`}
                >
                  {selectedTask.status.replace("_", " ")}
                </span>
              </div>
            </div>

            <div className="nohby-frame space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold text-white">
                    {selectedTask.instruction}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                    <Clock className="h-3.5 w-3.5 text-[#00D4FF]" />
                    <span>{getTaskScheduleDisplay(selectedTask)}</span>
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
                    Task Metadata &amp; Execution Result
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

      {/* ============================================================
          INTERACTIVE CALENDAR DATE & TIME TASK SCHEDULER MODAL
          (Supports both New Task Scheduling & Existing Task Update)
          ============================================================ */}
      {showComposerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="dropdown-surface max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-semibold text-white">
                  {editingTask ? "Update Scheduled Task & Calendar Time" : "Schedule a Task on Calendar"}
                </h3>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Select any date on the calendar, pick your exact time, and set what NohbyAI should run.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowComposerModal(false);
                  setEditingTask(null);
                }}
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveOrScheduleTask} className="mt-4 space-y-4">
              {/* Task Instruction */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">
                  Task Instruction
                </label>
                <textarea
                  rows={2}
                  required
                  autoFocus
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="e.g., Open browser, check industry AI updates, and summarize key developments..."
                  className="studio-input w-full rounded-xl p-3 text-xs"
                />
              </div>

              {/* 2-Column Layout: Visual Calendar Grid (Left) + Time & Recurrence Picker (Right) */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Interactive Monthly Calendar Display */}
                <div className="rounded-xl border border-white/[0.09] bg-[#0E1422] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      {MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setCalendarMonth(
                            new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                          )
                        }
                        className="rounded-md p-1 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                        title="Previous month"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCalendarMonth(
                            new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                          )
                        }
                        className="rounded-md p-1 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                        title="Next month"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Weekday Headers */}
                  <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-zinc-500">
                    {WEEKDAYS.map((wd) => (
                      <div key={wd} className="py-1">
                        {wd}
                      </div>
                    ))}
                  </div>

                  {/* Day Cells */}
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {calendarDays.map((cell, idx) => {
                      if (!cell.day) {
                        return <div key={`empty-${idx}`} className="h-7" />;
                      }
                      const isSelected = cell.dateStr === selectedDateStr;
                      const isToday = cell.dateStr === todayStr;
                      const hasScheduled = scheduledDatesSet.has(cell.dateStr);
                      return (
                        <button
                          key={cell.dateStr}
                          type="button"
                          onClick={() => setSelectedDateStr(cell.dateStr)}
                          className={`relative flex h-7 items-center justify-center rounded-lg text-[11px] font-medium transition ${
                            isSelected
                              ? "bg-gradient-to-br from-[#00D4FF] to-[#0066FF] font-bold text-white shadow-[0_0_12px_rgba(0,212,255,0.45)]"
                              : isToday
                                ? "border border-[#00D4FF]/50 bg-[#00D4FF]/10 text-[#00D4FF]"
                                : "text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                          }`}
                        >
                          {cell.day}
                          {hasScheduled && !isSelected && (
                            <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[#00D4FF]" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[10px] text-zinc-400">
                    <span>Selected Date:</span>
                    <input
                      type="date"
                      value={selectedDateStr}
                      onChange={(e) => {
                        if (e.target.value) {
                          setSelectedDateStr(e.target.value);
                          const [yr, mo] = e.target.value.split("-").map(Number);
                          if (yr && mo) setCalendarMonth(new Date(yr, mo - 1, 1));
                        }
                      }}
                      className="studio-input h-6 rounded px-1.5 text-[10px]"
                    />
                  </div>
                </div>

                {/* Time & Recurrence Controls */}
                <div className="flex flex-col justify-between rounded-xl border border-white/[0.09] bg-[#0E1422] p-3">
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-zinc-300">
                        Select Time
                      </label>
                      <input
                        type="time"
                        value={selectedTimeStr}
                        onChange={(e) => setSelectedTimeStr(e.target.value)}
                        className="studio-input h-9 w-full rounded-lg px-3 text-xs"
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {QUICK_TIMES.map((qt) => (
                          <button
                            key={qt.value}
                            type="button"
                            onClick={() => setSelectedTimeStr(qt.value)}
                            className={`rounded-lg border px-2 py-1 text-[10px] font-medium transition ${
                              selectedTimeStr === qt.value
                                ? "border-[#00D4FF]/55 bg-[#00D4FF]/15 text-[#00D4FF]"
                                : "border-white/[0.08] bg-[#141C2E] text-zinc-400 hover:text-white"
                            }`}
                          >
                            {qt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-zinc-300">
                        Repeat / Frequency
                      </label>
                      <select
                        value={recurrence}
                        onChange={(e) => setRecurrence(e.target.value)}
                        className="studio-input h-9 w-full rounded-lg px-3 text-xs"
                      >
                        {RECURRENCE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Live Schedule Summary Preview */}
                  <div className="mt-3 rounded-lg border border-[#00D4FF]/35 bg-[#00D4FF]/10 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#00D4FF]">
                      Scheduled For
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-white">
                      {formatFriendlyScheduleLabel(selectedDateStr, selectedTimeStr, recurrence)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowComposerModal(false);
                    setEditingTask(null);
                  }}
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
                  {editingTask ? "Save Updated Schedule" : "Schedule Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
