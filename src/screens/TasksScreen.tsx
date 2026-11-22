import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";

import { EmptyState, LoadingState } from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import { executeTaskLocally } from "../lib/localAgent";
import { useAppStore } from "../store/useAppStore";
import type { Approval, Permission, Task, TaskEvent } from "../types/api";

type TabMode = "tasks" | "approvals" | "permissions";

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-blue-500/15 text-blue-500",
  running: "bg-blue-500/15 text-blue-500",
  awaiting_approval: "bg-amber-500/15 text-amber-500",
  paused: "bg-zinc-500/15 text-zinc-400",
  completed: "bg-emerald-500/15 text-emerald-500",
  cancelled: "bg-rose-500/15 text-rose-500",
  failed: "bg-rose-500/15 text-rose-500",
  pending: "bg-zinc-500/15 text-zinc-400",
};

const RESOURCE_OPTIONS = ["browser", "files", "calendar", "email", "social", "iot"];

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

  const [tab, setTab] = useState<TabMode>("tasks");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<TaskEvent[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  // Permission composer state
  const [permResource, setPermResource] = useState("browser");
  const [permActions, setPermActions] = useState("open, navigate, search");
  const [scopeToDevice, setScopeToDevice] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, appRes, permRes] = await Promise.all([
        apiClient.listTasks({ limit: 50 }),
        apiClient.listPendingApprovals(),
        apiClient.listPermissions(),
      ]);
      setTasks(tasksRes.data.tasks);
      setApprovals(appRes.data.approvals);
      setPermissions(permRes.data.permissions);

      if (tasksRes.data.tasks.length > 0) {
        const currentId = selectedTask?.id;
        const match = tasksRes.data.tasks.find((t) => t.id === currentId) || tasksRes.data.tasks[0];
        const detail = await apiClient.getTask(match.id);
        setSelectedTask(detail.data.task);
        setSelectedEvents(detail.data.events);
      } else {
        setSelectedTask(null);
        setSelectedEvents([]);
      }
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to load task centre.");
    } finally {
      setLoading(false);
    }
  }, [selectedTask?.id, showToast]);

  useEffect(() => {
    loadAll();
  }, []);

  const selectTask = async (taskId: string) => {
    try {
      const detail = await apiClient.getTask(taskId);
      setSelectedTask(detail.data.task);
      setSelectedEvents(detail.data.events);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Unable to load task details.");
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = instruction.trim();
    if (!text || creating) return;

    setCreating(true);
    try {
      const res = await apiClient.createTask({
        instruction: text,
        deviceId: currentDeviceId,
        source: "desktop_task_centre",
      });
      setInstruction("");
      showToast(
        res.data.task.status === "awaiting_approval" ? "info" : "success",
        res.data.task.status === "awaiting_approval"
          ? "Task created — requires your approval before execution."
          : "Task planned and queued."
      );
      await loadAll();
      await selectTask(res.data.task.id);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to create task.");
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

  const handleRunLocally = async (task: Task) => {
    if (!currentDeviceId) {
      showToast("error", "No active local device registered. Open Devices to register this machine.");
      return;
    }
    setActingId(task.id);
    try {
      const completed = await executeTaskLocally(task, currentDeviceId, (updated) => {
        setSelectedTask(updated);
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      });
      showToast("success", "Task executed and verified on this device.");
      await loadAll();
      await selectTask(completed.id);
    } catch (err) {
      showToast(
        "error",
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Local execution failed."
      );
      await loadAll();
      await selectTask(task.id);
    } finally {
      setActingId(null);
    }
  };

  const handleApproval = async (approval: Approval, decision: "approve" | "reject") => {
    setActingId(approval.id);
    try {
      if (decision === "approve") {
        await apiClient.approveAction(approval.id, approval.actionFingerprint);
        showToast("success", "Action approved — task moved to queue.");
      } else {
        await apiClient.rejectAction(approval.id, "Rejected by user in Approval Centre.");
        showToast("info", "Action rejected and task cancelled.");
      }
      await loadAll();
      await selectTask(approval.taskId);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Approval action failed.");
    } finally {
      setActingId(null);
    }
  };

  const handleGrantPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedActions = permActions
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    if (parsedActions.length === 0) return;

    setCreating(true);
    try {
      await apiClient.grantPermission({
        deviceId: scopeToDevice ? currentDeviceId : null,
        resource: permResource,
        actions: parsedActions,
      });
      showToast("success", `Granted ${permResource} permission.`);
      await loadAll();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to grant permission.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevokePermission = async (permissionId: string) => {
    setActingId(permissionId);
    try {
      await apiClient.revokePermission(permissionId);
      showToast("info", "Permission revoked.");
      await loadAll();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to revoke permission.");
    } finally {
      setActingId(null);
    }
  };

  const filteredTasks =
    statusFilter === "all" ? tasks : tasks.filter((t) => t.status === statusFilter);

  return (
    <div className="w-full space-y-4">
      {/* Top tabs + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-white/[0.08] bg-[#111318] p-1">
          {(
            [
              { id: "tasks", label: "Tasks", count: tasks.length },
              { id: "approvals", label: "Approvals", count: approvals.length },
              {
                id: "permissions",
                label: "Permissions",
                count: permissions.filter((p) => p.active).length,
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tab === item.id
                  ? "btn-ivory"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <span>{item.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
                  tab === item.id ? "bg-white/20 text-white" : "bg-white/[0.06] text-zinc-400"
                }`}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={loadAll}
          disabled={loading}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#111318] px-3 text-xs font-medium text-zinc-300 transition hover:border-white/[0.2]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && tasks.length === 0 ? (
        <LoadingState message="Loading task orchestration engine..." />
      ) : tab === "tasks" ? (
        <div className="space-y-4">
          {/* Quick Task Composer */}
          <form
            onSubmit={handleCreateTask}
            className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-[#111318] p-3 sm:flex-row"
          >
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Describe a task (e.g. 'Send email to team@company.com with Q4 update' or 'Open Chrome and research cloud hosts')..."
              className="studio-input h-9 flex-1 rounded-lg px-3 text-[13px]"
            />
            <button
              type="submit"
              disabled={creating || !instruction.trim()}
              className="btn-ivory inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-xs"
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Plan Task
            </button>
          </form>

          {/* Status filters */}
          <div className="flex flex-wrap gap-1.5">
            {["all", "awaiting_approval", "queued", "running", "paused", "completed", "failed", "cancelled"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                  statusFilter === st
                    ? "border-[#0066FF] bg-[#0066FF]/15 text-[#0066FF]"
                    : "border-white/[0.08] bg-[#111318] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {st.replace("_", " ")}
              </button>
            ))}
          </div>

          {filteredTasks.length === 0 ? (
            <EmptyState
              title="No tasks yet"
              description="Submit an instruction above to generate a structured execution plan with risk classification and scoped approvals."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-12">
              {/* Task List */}
              <div className="space-y-2 lg:col-span-5">
                {filteredTasks.map((task) => {
                  const isSelected = selectedTask?.id === task.id;
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => selectTask(task.id)}
                      className={`w-full rounded-xl border p-3.5 text-left transition ${
                        isSelected
                          ? "border-[#0066FF] bg-[#111318]"
                          : "border-white/[0.08] bg-[#111318] hover:border-white/[0.16]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-xs font-medium text-white">
                          {task.instruction}
                        </p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                            STATUS_BADGE[task.status] || "bg-zinc-500/15 text-zinc-400"
                          }`}
                        >
                          {task.status.replace("_", " ")}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                        <span className="font-mono uppercase">{task.riskLevel} risk</span>
                        <span>
                          {task.steps.length} step{task.steps.length === 1 ? "" : "s"} ·{" "}
                          {formatTimestamp(task.createdAt)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Task Details & Step Timeline (Screen 08) */}
              <div className="rounded-xl border border-white/[0.08] bg-[#111318] p-4 sm:p-5 lg:col-span-7">
                {selectedTask ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.07] pb-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                              STATUS_BADGE[selectedTask.status] || "bg-zinc-500/15 text-zinc-400"
                            }`}
                          >
                            {selectedTask.status.replace("_", " ")}
                          </span>
                          <span className="font-mono text-[10px] uppercase text-zinc-500">
                            {selectedTask.taskType} · {selectedTask.riskLevel} risk
                          </span>
                        </div>
                        <h3 className="mt-1.5 text-sm font-semibold text-white">
                          {selectedTask.instruction}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {selectedTask.status === "queued" &&
                          !selectedTask.approvals.some((a) => a.status === "pending") && (
                            <button
                              type="button"
                              disabled={actingId === selectedTask.id || !currentDeviceId}
                              onClick={() => handleRunLocally(selectedTask)}
                              className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs"
                              title={
                                currentDeviceId
                                  ? "Claim and execute this task on your local device"
                                  : "Register a device first to execute tasks locally"
                              }
                            >
                              {actingId === selectedTask.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Cpu className="h-3.5 w-3.5" />
                              )}
                              Run on This Device
                            </button>
                          )}
                        {(selectedTask.status === "queued" ||
                          selectedTask.status === "awaiting_approval" ||
                          selectedTask.status === "running") && (
                          <button
                            type="button"
                            disabled={actingId === selectedTask.id}
                            onClick={() => handleTaskAction(selectedTask.id, "pause")}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.1] px-2.5 text-xs text-zinc-300 hover:bg-white/[0.06]"
                          >
                            <Pause className="h-3 w-3" /> Pause
                          </button>
                        )}
                        {selectedTask.status === "paused" && (
                          <button
                            type="button"
                            disabled={actingId === selectedTask.id}
                            onClick={() => handleTaskAction(selectedTask.id, "resume")}
                            className="btn-ivory inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs"
                          >
                            <Play className="h-3 w-3" /> Resume
                          </button>
                        )}
                        {!["completed", "cancelled", "failed"].includes(selectedTask.status) && (
                          <button
                            type="button"
                            disabled={actingId === selectedTask.id}
                            onClick={() => handleTaskAction(selectedTask.id, "cancel")}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 text-xs text-rose-400 hover:bg-rose-500/20"
                          >
                            <XCircle className="h-3 w-3" /> Cancel
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Verified Execution Result & Evidence (Phase 5) */}
                    {selectedTask.status === "completed" && selectedTask.result && (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                        <div className="flex items-start gap-2.5">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-xs font-semibold text-white">
                              Verified Execution Result
                            </p>
                            <p className="text-xs text-zinc-300">
                              {String(selectedTask.result.summary || "Task completed successfully.")}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 font-mono text-[10px] text-zinc-400">
                              {selectedTask.result.executedByDeviceName ? (
                                <span>
                                  Device: {String(selectedTask.result.executedByDeviceName)}
                                </span>
                              ) : null}
                              {selectedTask.result.verifiedAt ? (
                                <span>
                                  Verified: {formatTimestamp(String(selectedTask.result.verifiedAt))}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Execution Failure Banner */}
                    {selectedTask.status === "failed" && (
                      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="text-xs font-semibold text-white">
                              Execution Failed
                              {selectedTask.errorCode ? ` (${selectedTask.errorCode})` : ""}
                            </p>
                            <p className="text-xs text-rose-300">
                              {selectedTask.errorMessage || "An error occurred during local execution."}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Inline pending approvals for this task */}
                    {selectedTask.approvals
                      .filter((a) => a.status === "pending")
                      .map((app) => (
                        <div
                          key={app.id}
                          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5"
                        >
                          <div className="flex items-start gap-2.5">
                            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-white">
                                Approval Required: {String(app.actionDetails.tool || "action")}
                              </p>
                              <p className="mt-0.5 text-xs text-zinc-400">
                                {String(app.actionDetails.description || "")}
                              </p>
                              <p className="mt-1 font-mono text-[10px] text-zinc-500">
                                Fingerprint: {app.actionFingerprint.slice(0, 16)}… · Expires{" "}
                                {formatTimestamp(app.expiresAt)}
                              </p>
                              <div className="mt-3 flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={actingId === app.id}
                                  onClick={() => handleApproval(app, "approve")}
                                  className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Approve Action
                                </button>
                                <button
                                  type="button"
                                  disabled={actingId === app.id}
                                  onClick={() => handleApproval(app, "reject")}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-xs text-rose-400 hover:bg-rose-500/20"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  Reject
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                    {/* Step-by-step plan */}
                    <div>
                      <h4 className="text-xs font-semibold text-white">Execution Steps</h4>
                      <ol className="mt-2 space-y-2">
                        {selectedTask.steps.map((step) => (
                          <li
                            key={step.id}
                            className="rounded-lg border border-white/[0.07] bg-[#171A21] px-3 py-2 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] text-zinc-500">
                                  {step.sequenceNumber}.
                                </span>
                                <code className="text-indigo-400">
                                  {step.toolName}.{step.action}
                                </code>
                                <span className="text-zinc-300">
                                  {String(step.inputData.description || "")}
                                </span>
                              </div>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                                  STATUS_BADGE[step.status] || "bg-zinc-500/15 text-zinc-400"
                                }`}
                              >
                                {step.status.replace("_", " ")}
                              </span>
                            </div>
                            {step.outputData && typeof step.outputData.summary === "string" && (
                              <p className="mt-1.5 border-t border-white/[0.06] pt-1.5 text-[11px] text-emerald-400">
                                {step.outputData.summary}
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>

                    {/* Event timeline */}
                    {selectedEvents.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-white">Lifecycle Events</h4>
                        <div className="mt-2 space-y-1.5">
                          {selectedEvents.map((ev) => (
                            <div
                              key={ev.id}
                              className="flex items-center justify-between text-[11px] text-zinc-400"
                            >
                              <span className="inline-flex items-center gap-1.5 font-mono">
                                <Clock className="h-3 w-3 text-zinc-500" />
                                {ev.eventType}
                              </span>
                              <span>{formatTimestamp(ev.createdAt)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyState
                    title="Select a task"
                    description="Choose a task from the list to inspect its execution plan, steps, and lifecycle events."
                  />
                )}
              </div>
            </div>
          )}
        </div>
      ) : tab === "approvals" ? (
        <div className="space-y-3">
          {approvals.length === 0 ? (
            <EmptyState
              title="No pending approvals"
              description="High-risk actions (sending emails, publishing posts, deleting files) appear here for explicit sign-off."
            />
          ) : (
            approvals.map((app) => (
              <div
                key={app.id}
                className="flex flex-col justify-between gap-4 rounded-xl border border-amber-500/30 bg-[#111318] p-4 sm:flex-row sm:items-center"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-500" />
                    <span className="text-xs font-semibold text-white">
                      {String(app.actionDetails.tool || "Sensitive Action")}
                    </span>
                    <span className="rounded-full bg-rose-500/15 px-2 py-0.5 font-mono text-[10px] uppercase text-rose-400">
                      {String(app.actionDetails.riskLevel || "high")} risk
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300">
                    {String(app.actionDetails.instruction || app.actionDetails.description || "")}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-500">
                    Scope Fingerprint: {app.actionFingerprint.slice(0, 20)}… · Expires{" "}
                    {formatTimestamp(app.expiresAt)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={actingId === app.id}
                    onClick={() => handleApproval(app, "approve")}
                    className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={actingId === app.id}
                    onClick={() => handleApproval(app, "reject")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-xs text-rose-400 hover:bg-rose-500/20"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Grant new permission */}
          <form
            onSubmit={handleGrantPermission}
            className="rounded-xl border border-white/[0.08] bg-[#111318] p-4"
          >
            <h3 className="text-xs font-semibold text-white">Grant Granular Permission</h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Authorise specific tools and actions independently. High-risk actions still require
              per-action approval.
            </p>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-12">
              <select
                value={permResource}
                onChange={(e) => setPermResource(e.target.value)}
                className="studio-input h-9 rounded-lg px-3 text-xs sm:col-span-3"
              >
                {RESOURCE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={permActions}
                onChange={(e) => setPermActions(e.target.value)}
                placeholder="Comma-separated actions (e.g. open, search)"
                className="studio-input h-9 rounded-lg px-3 text-xs sm:col-span-5"
              />
              <label className="flex items-center gap-2 text-xs text-zinc-400 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={scopeToDevice}
                  onChange={(e) => setScopeToDevice(e.target.checked)}
                />
                This device
              </label>
              <button
                type="submit"
                disabled={creating}
                className="btn-ivory inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs sm:col-span-2"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Grant
              </button>
            </div>
          </form>

          {/* Permission list */}
          {permissions.length === 0 ? (
            <EmptyState
              title="No permissions granted"
              description="Grant resource permissions above to authorise your local agent."
            />
          ) : (
            <div className="space-y-2">
              {permissions.map((perm) => (
                <div
                  key={perm.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#111318] px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-white">
                        {perm.resource}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          perm.active
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-rose-500/15 text-rose-500"
                        }`}
                      >
                        {perm.active ? "Active" : "Revoked"}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {perm.deviceId ? "Device-scoped" : "Account-wide"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {perm.actions.map((act) => (
                        <span
                          key={act}
                          className="rounded border border-white/[0.08] bg-[#171A21] px-2 py-0.5 font-mono text-[10px] text-zinc-300"
                        >
                          {act}
                        </span>
                      ))}
                    </div>
                  </div>

                  {perm.active && (
                    <button
                      type="button"
                      disabled={actingId === perm.id}
                      onClick={() => handleRevokePermission(perm.id)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 text-xs text-rose-400 hover:bg-rose-500/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
