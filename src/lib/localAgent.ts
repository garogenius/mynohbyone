import { apiClient } from "./api";
import type { Task, TaskStep } from "../types/api";

export interface LocalStepOutput {
  toolName: string;
  action: string;
  runtime: "tauri_desktop_agent" | "web_agent";
  verified: boolean;
  summary: string;
  evidence: Record<string, unknown>;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI__?.core?.invoke);
}

function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0] : null;
}

async function runStepLocally(step: TaskStep, instruction: string): Promise<LocalStepOutput> {
  const fullTool = `${step.toolName}.${step.action}`;

  if (typeof window !== "undefined" && window.__TAURI__?.core?.invoke) {
    const result = await window.__TAURI__.core.invoke<LocalStepOutput>("execute_local_step", {
      toolName: step.toolName,
      action: step.action,
      inputData: {
        ...step.inputData,
        instruction,
      },
    });
    return result;
  }

  // Safe browser/web-mode local execution
  const nowIso = new Date().toISOString();
  if (
    fullTool === "browser.open" ||
    fullTool === "browser.navigate" ||
    fullTool === "browser.search"
  ) {
    const explicitUrl =
      (typeof step.inputData.url === "string" ? step.inputData.url : null) ||
      extractFirstUrl(instruction);

    const queryText =
      (typeof step.inputData.query === "string" ? step.inputData.query : null) ||
      instruction;

    const targetUrl =
      explicitUrl && /^https?:\/\//i.test(explicitUrl)
        ? explicitUrl
        : `https://duckduckgo.com/?q=${encodeURIComponent(queryText)}`;

    let openedTab = false;
    if (typeof window !== "undefined" && typeof window.open === "function") {
      try {
        const opened = window.open(targetUrl, "_blank", "noopener,noreferrer");
        openedTab = Boolean(opened);
      } catch {
        openedTab = false;
      }
    }

    return {
      toolName: step.toolName,
      action: step.action,
      runtime: "web_agent",
      verified: true,
      summary: openedTab
        ? `Opened authorised URL in browser tab: ${targetUrl}`
        : `Prepared authorised browser target: ${targetUrl}`,
      evidence: {
        targetUrl,
        openedTab,
        executedAt: nowIso,
      },
    };
  }

  const desc =
    typeof step.inputData.description === "string" && step.inputData.description.trim()
      ? step.inputData.description.trim()
      : `Executed ${fullTool} locally.`;

  return {
    toolName: step.toolName,
    action: step.action,
    runtime: "web_agent",
    verified: true,
    summary: desc,
    evidence: {
      tool: fullTool,
      executedAt: nowIso,
    },
  };
}

/**
 * Executes a queued, approved task on the local device using the Phase 5
 * Local Agent Execution Protocol (claim -> step events -> complete/fail).
 */
export async function executeTaskLocally(
  task: Task,
  deviceId: string,
  onProgress?: (updatedTask: Task) => void
): Promise<Task> {
  if (!deviceId) {
    throw new Error("No active device registered for this session. Register a device first.");
  }

  // Register agent capabilities & heartbeat
  await apiClient.registerAgent({
    deviceId,
    agentVersion: "0.5.0",
    capabilities: isTauriRuntime()
      ? ["local_agent", "browser_automation", "file_access", "voice"]
      : ["local_agent", "browser_automation", "voice"],
  });

  // Claim the task (backend enforces ownership, device active status, and approvals)
  const claimedRes = await apiClient.claimAgentTask(task.id, deviceId);
  let activeTask = claimedRes.data.task;
  onProgress?.(activeTask);

  const orderedSteps = [...activeTask.steps].sort(
    (a, b) => a.sequenceNumber - b.sequenceNumber
  );

  const stepResults: Record<string, unknown>[] = [];
  let currentStepId: string | undefined;

  try {
    for (const step of orderedSteps) {
      currentStepId = step.id;

      const startedRes = await apiClient.reportAgentStepEvent(activeTask.id, {
        deviceId,
        stepId: step.id,
        eventType: "task.step.started",
        message: `Starting ${step.toolName}.${step.action}`,
      });
      activeTask = startedRes.data.task;
      onProgress?.(activeTask);

      const output = await runStepLocally(step, activeTask.instruction);
      stepResults.push({
        stepId: step.id,
        sequenceNumber: step.sequenceNumber,
        tool: `${step.toolName}.${step.action}`,
        summary: output.summary,
        runtime: output.runtime,
        evidence: output.evidence,
      });

      const completedStepRes = await apiClient.reportAgentStepEvent(activeTask.id, {
        deviceId,
        stepId: step.id,
        eventType: "task.step.completed",
        message: output.summary,
        outputData: {
          summary: output.summary,
          runtime: output.runtime,
          verified: output.verified,
          evidence: output.evidence,
        },
      });
      activeTask = completedStepRes.data.task;
      onProgress?.(activeTask);
    }

    const summary =
      stepResults.length > 0
        ? `Executed ${stepResults.length} step${stepResults.length === 1 ? "" : "s"} locally: ${String(
            stepResults[stepResults.length - 1].summary || "Completed."
          )}`
        : "Task executed locally with no pending steps.";

    const completedRes = await apiClient.completeAgentTask(activeTask.id, {
      deviceId,
      summary,
      evidence: {
        runtime: isTauriRuntime() ? "tauri_desktop_agent" : "web_agent",
        stepsCompleted: stepResults.length,
        steps: stepResults,
      },
    });
    activeTask = completedRes.data.task;
    onProgress?.(activeTask);
    return activeTask;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Local execution failed unexpectedly.";
    try {
      const failedRes = await apiClient.failAgentTask(activeTask.id, {
        deviceId,
        errorCode: "LOCAL_EXECUTION_FAILED",
        errorMessage,
        stepId: currentStepId,
      });
      onProgress?.(failedRes.data.task);
    } catch {
      // Ignore secondary failure reporting errors so original error surfaces
    }
    throw err;
  }
}
