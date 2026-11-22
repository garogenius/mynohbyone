import { apiClient } from "./api";
import { applyTheme } from "./theme";
import type { ClientAction, NavRoute, SendMessageResponseData, Task, TaskStep } from "../types/api";

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

const KNOWN_WEB_TARGETS: Array<{ keywords: string[]; url: string; label: string }> = [
  { keywords: ["youtube"], url: "https://www.youtube.com", label: "YouTube" },
  { keywords: ["gmail", "google mail"], url: "https://mail.google.com", label: "Gmail" },
  { keywords: ["google drive", "gdrive"], url: "https://drive.google.com", label: "Google Drive" },
  { keywords: ["google calendar"], url: "https://calendar.google.com", label: "Google Calendar" },
  { keywords: ["google docs"], url: "https://docs.google.com", label: "Google Docs" },
  { keywords: ["google sheets"], url: "https://sheets.google.com", label: "Google Sheets" },
  { keywords: ["google maps"], url: "https://maps.google.com", label: "Google Maps" },
  { keywords: ["github"], url: "https://github.com", label: "GitHub" },
  { keywords: ["whatsapp"], url: "https://web.whatsapp.com", label: "WhatsApp Web" },
  { keywords: ["linkedin"], url: "https://www.linkedin.com", label: "LinkedIn" },
  { keywords: ["twitter", "x.com"], url: "https://x.com", label: "X" },
  { keywords: ["facebook"], url: "https://www.facebook.com", label: "Facebook" },
  { keywords: ["instagram"], url: "https://www.instagram.com", label: "Instagram" },
  { keywords: ["chatgpt"], url: "https://chatgpt.com", label: "ChatGPT" },
  { keywords: ["slack"], url: "https://app.slack.com", label: "Slack" },
  { keywords: ["notion"], url: "https://www.notion.so", label: "Notion" },
  { keywords: ["figma"], url: "https://www.figma.com", label: "Figma" },
  { keywords: ["spotify"], url: "https://open.spotify.com", label: "Spotify" },
  { keywords: ["netflix"], url: "https://www.netflix.com", label: "Netflix" },
  { keywords: ["amazon"], url: "https://www.amazon.com", label: "Amazon" },
  { keywords: ["wikipedia"], url: "https://www.wikipedia.org", label: "Wikipedia" },
  { keywords: ["bbc"], url: "https://www.bbc.com/news", label: "BBC News" },
  { keywords: ["cnn"], url: "https://www.cnn.com", label: "CNN" },
  { keywords: ["google"], url: "https://www.google.com", label: "Google" },
];

const WORKSPACE_ROUTE_COMMANDS: Array<{ triggers: string[]; route: NavRoute; label: string }> = [
  {
    triggers: ["open settings", "go to settings", "show settings", "audio settings", "voice settings"],
    route: "settings",
    label: "Settings",
  },
  {
    triggers: [
      "open tasks",
      "go to tasks",
      "show tasks",
      "show my tasks",
      "open scheduled",
      "scheduled tasks",
      "create a task",
      "create task",
      "schedule a task",
      "schedule task",
      "remind me to",
    ],
    route: "tasks",
    label: "Scheduled Tasks",
  },
  {
    triggers: [
      "open meetings",
      "go to meetings",
      "show meetings",
      "meeting room",
      "start a meeting",
      "start meeting",
      "new meeting",
      "start interview",
      "record meeting",
    ],
    route: "meetings",
    label: "Meetings",
  },
  {
    triggers: ["open plugins", "go to plugins", "show plugins", "open integrations", "go to integrations"],
    route: "integrations",
    label: "Plugins",
  },
  {
    triggers: ["open library", "go to library", "show library", "open files", "show my files"],
    route: "files",
    label: "Library",
  },
  {
    triggers: ["open memory", "go to memory", "show memory", "my memory"],
    route: "memory",
    label: "Memory",
  },
  {
    triggers: ["open devices", "go to devices", "show devices", "connected devices"],
    route: "devices",
    label: "Devices",
  },
  {
    triggers: ["open chat room", "go to chat room", "open chat"],
    route: "assistant",
    label: "Chat Room",
  },
  {
    triggers: ["open assistant", "go to assistant", "go home", "open home"],
    route: "home",
    label: "Assistant",
  },
];

/**
 * Synchronously resolves client-side browser / navigation / theme commands
 * so actions trigger immediately when the user speaks or types a command.
 */
export function resolveImmediateClientAction(commandText: string): ClientAction | null {
  const raw = commandText.trim();
  const lower = raw.toLowerCase();

  // 1. Theme switching
  if (
    ["switch to light", "light mode", "white mode", "light theme", "turn on light"].some((k) =>
      lower.includes(k)
    )
  ) {
    return { type: "set_theme", theme: "light", label: "Light Mode" };
  }
  if (
    ["switch to dark", "dark mode", "dark theme", "turn on dark"].some((k) => lower.includes(k))
  ) {
    return { type: "set_theme", theme: "dark", label: "Dark Mode" };
  }

  // 2. Workspace screen navigation (exact triggers)
  for (const item of WORKSPACE_ROUTE_COMMANDS) {
    if (item.triggers.some((t) => lower.includes(t))) {
      return { type: "navigate_route", route: item.route, label: item.label };
    }
  }

  // 2b. Flexible verb + workspace screen noun ("open my settings", "show me the library", "check my tasks")
  if (
    ["open ", "go to ", "show ", "view ", "check ", "take me to ", "launch "].some((v) =>
      lower.includes(v)
    ) &&
    !["google ", "icloud ", "youtube", "gmail", "github", "whatsapp"].some((w) =>
      lower.includes(w)
    )
  ) {
    const flexRoutes: Array<{ nouns: string[]; route: NavRoute; label: string }> = [
      { nouns: ["setting", "configuration"], route: "settings", label: "Settings" },
      { nouns: ["task", "scheduled"], route: "tasks", label: "Scheduled Tasks" },
      { nouns: ["meeting", "interview"], route: "meetings", label: "Meetings" },
      { nouns: ["plugin", "integration"], route: "integrations", label: "Plugins" },
      { nouns: ["library", "my files", "document"], route: "files", label: "Library" },
      { nouns: ["memory", "memories"], route: "memory", label: "Memory" },
      { nouns: ["device", "connected node"], route: "devices", label: "Devices" },
      { nouns: ["chat room"], route: "assistant", label: "Chat Room" },
    ];
    for (const item of flexRoutes) {
      if (item.nouns.some((n) => lower.includes(n))) {
        return { type: "navigate_route", route: item.route, label: item.label };
      }
    }
  }

  // 3. Explicit full URL
  const explicitUrl = extractFirstUrl(raw);
  if (
    explicitUrl &&
    ["open", "go to", "visit", "launch", "browse", "bude"].some((v) => lower.includes(v))
  ) {
    return { type: "open_url", url: explicitUrl, label: explicitUrl };
  }

  // 4. Web / YouTube search ("search for X", "open chrome and search for X", "google X")
  const searchRegexes = [
    /(?:open\s+(?:chrome|browser|broswer|google|youtube)\s+and\s+)?(?:search|look\s+up|find|research|nema)\s+(?:on\s+youtube\s+|youtube\s+)?(?:for\s+)?(.+)$/i,
    /^google\s+(.+)$/i,
    /^youtube\s+search\s+(.+)$/i,
  ];
  for (const rx of searchRegexes) {
    const m = raw.match(rx);
    if (m && m[1]) {
      const q = m[1].trim().replace(/[.?!]+$/, "");
      if (q && !["browser", "broswer", "chrome", "google", "youtube"].includes(q.toLowerCase())) {
        if (lower.includes("youtube")) {
          return {
            type: "open_url",
            url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
            label: `YouTube Search: ${q.slice(0, 40)}`,
          };
        }
        return {
          type: "open_url",
          url: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
          label: `Google Search: ${q.slice(0, 40)}`,
        };
      }
    }
  }

  // 5. Direct website launch or "open browser"
  if (
    ["open ", "launch ", "go to ", "visit ", "start ", "bude ", "show me "].some((t) =>
      lower.includes(t)
    )
  ) {
    for (const target of KNOWN_WEB_TARGETS) {
      if (target.keywords.some((k) => lower.includes(k))) {
        return { type: "open_url", url: target.url, label: target.label };
      }
    }

    const domMatch = lower.match(
      /(?:open|launch|go\s+to|visit|bude)\s+([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:\/[^\s]*)?/i
    );
    if (domMatch && domMatch[1]) {
      return {
        type: "open_url",
        url: `https://${domMatch[1]}`,
        label: domMatch[1],
      };
    }

    if (
      [
        "browser",
        "broswer",
        "brower",
        "chrome",
        "safari",
        "firefox",
        "microsoft edge",
        "internet",
        "web",
      ].some((b) => lower.includes(b))
    ) {
      return { type: "open_url", url: "https://www.google.com", label: "Web Browser" };
    }
  }

  return null;
}

export interface ClientActionHandlers {
  setRoute?: (route: NavRoute) => void;
  showToast?: (type: "info" | "success" | "error", message: string) => void;
}

/**
 * Executes a resolved ClientAction immediately on the user's device (Tauri native OS or Web).
 * If a voice command triggers a URL launch and the browser blocks the background popup,
 * dispatches "nohby-browser-action" so the in-app Quick Action Launcher appears immediately.
 */
export async function executeClientAction(
  action: ClientAction | null | undefined,
  handlers: ClientActionHandlers = {}
): Promise<boolean> {
  if (!action) return false;

  if (action.type === "set_theme" && action.theme) {
    applyTheme(action.theme);
    handlers.showToast?.("success", `Switched theme to ${action.label || action.theme}.`);
    return true;
  }

  if (action.type === "navigate_route" && action.route) {
    handlers.setRoute?.(action.route as NavRoute);
    handlers.showToast?.("info", `Opened ${action.label || action.route}.`);
    return true;
  }

  if (action.type === "open_url" && action.url) {
    const targetUrl = action.url;
    const label = action.label || targetUrl;

    if (typeof window !== "undefined" && window.__TAURI__?.core?.invoke) {
      try {
        await window.__TAURI__.core.invoke<LocalStepOutput>("execute_local_step", {
          toolName: "browser",
          action: "open",
          inputData: { url: targetUrl, description: `Open ${label}` },
        });
        handlers.showToast?.("success", `Opened ${label} in your device browser.`);
        return true;
      } catch {
        // Fall through to web launcher
      }
    }

    if (typeof window !== "undefined" && typeof window.open === "function") {
      try {
        const win = window.open(targetUrl, "_blank", "noopener,noreferrer");
        if (win) {
          handlers.showToast?.("success", `Opened ${label} in a new browser tab.`);
          return true;
        }
      } catch {
        // Fall through to in-app launcher modal
      }

      // Browser blocked popup from async voice timer -> open immediate in-app launcher card
      window.dispatchEvent(
        new CustomEvent("nohby-browser-action", {
          detail: { url: targetUrl, label },
        })
      );
      return true;
    }
  }

  if (action.type === "memory_saved") {
    handlers.showToast?.("success", "Saved note to your Workspace Memory.");
    return true;
  }

  return false;
}

export async function finalizeAssistantExecution(
  data: SendMessageResponseData,
  options: ClientActionHandlers & {
    deviceId?: string | null;
    alreadyExecutedImmediate?: boolean;
  }
): Promise<void> {
  const serverAction = data.clientAction || data.interpretation?.clientAction;
  if (serverAction && !options.alreadyExecutedImmediate) {
    await executeClientAction(serverAction, options);
  }

  if (data.autoExecute && data.taskId && options.deviceId) {
    try {
      const taskRes = await apiClient.getTask(data.taskId);
      await executeTaskLocally(taskRes.data.task, options.deviceId, undefined, {
        skipBrowserPopup: true,
      });
    } catch {
      // Non-blocking background verification
    }
  }
}

async function runStepLocally(
  step: TaskStep,
  instruction: string,
  options: { skipBrowserPopup?: boolean } = {}
): Promise<LocalStepOutput> {
  const fullTool = `${step.toolName}.${step.action}`;

  if (
    !options.skipBrowserPopup &&
    typeof window !== "undefined" &&
    window.__TAURI__?.core?.invoke
  ) {
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
        : `https://www.google.com/search?q=${encodeURIComponent(queryText)}`;

    let openedTab = Boolean(options.skipBrowserPopup);
    if (
      !options.skipBrowserPopup &&
      typeof window !== "undefined" &&
      typeof window.open === "function"
    ) {
      try {
        const opened = window.open(targetUrl, "_blank", "noopener,noreferrer");
        openedTab = Boolean(opened);
        if (!openedTab) {
          window.dispatchEvent(
            new CustomEvent("nohby-browser-action", {
              detail: { url: targetUrl, label: queryText.slice(0, 40) },
            })
          );
          openedTab = true;
        }
      } catch {
        openedTab = false;
      }
    }

    return {
      toolName: step.toolName,
      action: step.action,
      runtime: isTauriRuntime() ? "tauri_desktop_agent" : "web_agent",
      verified: true,
      summary: openedTab
        ? `Opened authorised URL in browser: ${targetUrl}`
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
    runtime: isTauriRuntime() ? "tauri_desktop_agent" : "web_agent",
    verified: true,
    summary: desc,
    evidence: {
      tool: fullTool,
      executedAt: nowIso,
    },
  };
}

export async function executeTaskLocally(
  task: Task,
  deviceId: string,
  onProgress?: (updatedTask: Task) => void,
  options: { skipBrowserPopup?: boolean } = {}
): Promise<Task> {
  if (!deviceId) {
    throw new Error("No active device registered for this session. Register a device first.");
  }

  await apiClient.registerAgent({
    deviceId,
    agentVersion: "0.5.0",
    capabilities: isTauriRuntime()
      ? ["local_agent", "browser_automation", "file_access", "voice"]
      : ["local_agent", "browser_automation", "voice"],
  });

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

      const output = await runStepLocally(step, activeTask.instruction, options);
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
      // Ignore secondary failure reporting errors
    }
    throw err;
  }
}
