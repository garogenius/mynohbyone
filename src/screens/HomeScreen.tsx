import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  EyeOff,
  Keyboard,
  Loader2,
  Mic,
  Send,
  Square,
} from "lucide-react";

import { ApiError, apiClient } from "../lib/api";
import {
  isSpeechRecognitionSupported,
  speakText,
  startLocalVoiceRecognition,
  stopSpeaking,
  type VoiceSessionHandle,
} from "../lib/voice";
import { useAppStore } from "../store/useAppStore";
import type { FileItem, MemoryItem, Message, Task } from "../types/api";

function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "Just now";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function HomeScreen() {
  const { user, devices, currentDeviceId, health, setRoute, showToast } = useAppStore();

  // Real live telemetry & data
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [recentMessages, setRecentMessages] = useState<Message[]>([]);

  // Voice Control Dock state
  const [voiceActive, setVoiceActive] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [sending, setSending] = useState(false);
  const voiceHandleRef = useRef<VoiceSessionHandle | null>(null);

  const currentDevice = devices.find((d) => d.id === currentDeviceId) || null;
  const activeDevicesCount = devices.filter((d) => d.status === "active").length;

  const loadLiveDashboardData = useCallback(async () => {
    const start = performance.now();
    apiClient
      .health()
      .then(() => setLatencyMs(Math.max(1, Math.round(performance.now() - start))))
      .catch(() => null);

    const [tRes, mRes, fRes, cRes] = await Promise.all([
      apiClient.listTasks({ limit: 5 }).catch(() => null),
      apiClient.listMemories().catch(() => null),
      apiClient.listFiles({ limit: 5 }).catch(() => null),
      apiClient.listConversations({ limit: 1 }).catch(() => null),
    ]);

    if (tRes) setTasks(tRes.data.tasks);
    if (mRes) setMemories(mRes.data.memories);
    if (fRes) setFiles(fRes.data.files);

    if (cRes && cRes.data.conversations.length > 0) {
      const latestConv = cRes.data.conversations[0];
      setConversationId(latestConv.id);
      const detail = await apiClient.getConversation(latestConv.id).catch(() => null);
      if (detail) {
        setRecentMessages(detail.data.messages.slice(-4));
      }
    }
  }, []);

  useEffect(() => {
    loadLiveDashboardData();
    return () => {
      voiceHandleRef.current?.cancel();
      stopSpeaking();
    };
  }, [loadLiveDashboardData]);

  const sendToActiveSession = useCallback(
    async (content: string, inputType: "voice" | "text") => {
      const trimmed = content.trim();
      if (!trimmed || sending) return;

      setSending(true);
      try {
        let targetConvId = conversationId;
        if (!targetConvId) {
          const created = await apiClient.createConversation({
            title: trimmed.slice(0, 48),
            mode: "assistant",
          });
          targetConvId = created.data.conversation.id;
          setConversationId(targetConvId);
        }

        const res = await apiClient.sendMessage(targetConvId, {
          content: trimmed,
          inputType,
          deviceId: currentDeviceId,
        });

        setRecentMessages((prev) => [
          ...prev.slice(-2),
          res.data.userMessage,
          res.data.assistantMessage,
        ]);
        setTextDraft("");

        if (inputType === "voice" && res.data.assistantMessage.content) {
          speakText(res.data.assistantMessage.content.slice(0, 260), { rate: 1.05 });
        }

        // Refresh tasks in case execution was triggered
        apiClient
          .listTasks({ limit: 5 })
          .then((t) => setTasks(t.data.tasks))
          .catch(() => null);
      } catch (err) {
        showToast("error", err instanceof ApiError ? err.message : "Failed to send message.");
      } finally {
        setSending(false);
      }
    },
    [conversationId, currentDeviceId, sending, showToast]
  );

  const toggleVoiceMic = () => {
    if (voiceActive) {
      voiceHandleRef.current?.stop();
      voiceHandleRef.current = null;
      setVoiceActive(false);
      setInterimTranscript("");
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      showToast("info", "Browser voice recognition unavailable — use Input Text below.");
      setShowTextInput(true);
      return;
    }

    setVoiceActive(true);
    setInterimTranscript("");
    voiceHandleRef.current = startLocalVoiceRecognition({
      language: "en-US",
      onInterim: (text: string) => setInterimTranscript(text),
      onFinal: (text: string) => {
        if (text.trim()) {
          setInterimTranscript("");
          voiceHandleRef.current?.stop();
          voiceHandleRef.current = null;
          setVoiceActive(false);
          sendToActiveSession(text.trim(), "voice");
        }
      },
      onError: (msg: string) => {
        showToast("error", `Voice error: ${msg}`);
        setVoiceActive(false);
      },
      onEnd: () => {
        setVoiceActive(false);
      },
    });
  };

  const handleStopInterrupt = () => {
    voiceHandleRef.current?.cancel();
    voiceHandleRef.current = null;
    stopSpeaking();
    setVoiceActive(false);
    setInterimTranscript("");
    showToast("info", "Voice output and listening interrupted.");
  };

  // Latest assistant & user bubbles from real conversation history
  const latestAssistantMsg = [...recentMessages].reverse().find((m) => m.role === "assistant");
  const latestUserMsg = [...recentMessages].reverse().find((m) => m.role === "user");

  // Memory tags aggregated from real memories + indexed files
  const memoryTags = Array.from(
    new Set([
      ...memories.flatMap((m) => m.tags || []),
      ...files.map((f) => f.filename.replace(/\.[^.]+$/, "").slice(0, 14)),
    ])
  ).slice(0, 4);

  const latestMemory = memories[0] || null;
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const accuracyRate =
    tasks.length > 0 ? `${Math.round(((tasks.length - tasks.filter((t) => t.status === "failed").length) / tasks.length) * 100)}%` : "100%";

  return (
    <div className="grid w-full gap-4 lg:grid-cols-12">
      {/* ============================================================
          LEFT / CENTER: ACTIVE SESSION STAGE (Exact Reference Layout)
          ============================================================ */}
      <section className="nohby-stage flex min-h-[540px] flex-col justify-between p-4 sm:p-5 lg:col-span-8">
        {/* Stage Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-base font-semibold text-white">Active Session</h2>
            {voiceActive && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-2.5 py-0.5 text-[10px] font-medium text-[#00D4FF]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00D4FF]" />
                Listening
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setRoute("meetings")}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.12] bg-[#101624]/80 px-3 text-[11px] font-medium text-zinc-300 transition hover:border-[#00D4FF]/50 hover:text-white"
            title="Open Stealth Hidden Meeting & Interview Listener"
          >
            <EyeOff className="h-3.5 w-3.5 text-[#00D4FF]" />
            <span>Stealth Meeting Mode</span>
          </button>
        </div>

        {/* Centerpiece: Official /vioce-wave.gif Animated Voice Orb */}
        <div className="my-4 flex flex-col items-center justify-center">
          <button
            type="button"
            onClick={toggleVoiceMic}
            aria-label={voiceActive ? "Stop voice listening" : "Start voice listening"}
            className={`group relative flex h-52 w-52 items-center justify-center rounded-full transition duration-300 sm:h-64 sm:w-64 ${
              voiceActive
                ? "scale-105 shadow-[0_0_70px_rgba(0,212,255,0.45)]"
                : "hover:scale-[1.03] shadow-[0_0_48px_rgba(0,102,255,0.28)]"
            }`}
          >
            <img
              src="/vioce-wave.gif"
              alt="Nohby ONE Voice Wave"
              className="h-full w-full rounded-full object-cover mix-blend-screen"
            />
            <span
              className={`pointer-events-none absolute inset-0 rounded-full border transition ${
                voiceActive
                  ? "border-[#00D4FF]/70 ring-4 ring-[#00D4FF]/20"
                  : "border-white/15 group-hover:border-[#00D4FF]/40"
              }`}
            />
          </button>
        </div>

        {/* Live Conversation Exchange Bubbles (Real Data from Active Conversation) */}
        <div className="mx-auto mb-4 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          {/* Left: Voice Assistant Bubble */}
          <div className="flex flex-col items-start">
            <span className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#00D4FF]/35 bg-[#101A2E] px-2.5 py-0.5 text-[11px] font-medium text-zinc-200">
              Voice Assistant
              <img src="/icon-white.png" alt="" className="h-3.5 w-3.5 rounded-full object-contain" />
            </span>
            <div className="nohby-bubble-ai w-full rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-xs leading-relaxed text-zinc-100">
              {sending ? (
                <span className="inline-flex items-center gap-1.5 text-[#00D4FF]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                </span>
              ) : latestAssistantMsg ? (
                <p className="line-clamp-3">{latestAssistantMsg.content}</p>
              ) : (
                <p>
                  Hello {user?.profile?.displayName || user?.name}. I&apos;m connected to your
                  local workspace. Tap the mic or type a command to begin.
                </p>
              )}
            </div>
          </div>

          {/* Right: User Bubble */}
          <div className="flex flex-col items-end justify-end">
            <span className="mb-1.5 rounded-full border border-white/[0.12] bg-[#161E30] px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">
              You
            </span>
            <div className="w-full rounded-2xl rounded-tr-sm border border-white/[0.1] bg-[#151B2B]/90 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-200">
              {interimTranscript ? (
                <p className="italic text-[#00D4FF]">{interimTranscript}</p>
              ) : latestUserMsg ? (
                <p className="line-clamp-3">{latestUserMsg.content}</p>
              ) : (
                <p className="text-zinc-400">
                  Press &ldquo;On&rdquo; to speak or click &ldquo;Input Text&rdquo; to send a prompt.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Optional Inline Text Input when toggled from Dock */}
        {showTextInput && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendToActiveSession(textDraft, "text");
            }}
            className="mx-auto mb-3 flex w-full max-w-lg items-center gap-2"
          >
            <input
              type="text"
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="Type a message or command to Nohby ONE..."
              autoFocus
              className="studio-input h-9 flex-1 rounded-full px-4 text-xs"
            />
            <button
              type="submit"
              disabled={sending || !textDraft.trim()}
              className="btn-ivory inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send
            </button>
          </form>
        )}

        {/* Voice Control Dock (Exact 4-button floating pill from reference) */}
        <div className="flex flex-col items-center">
          <p className="mb-2 text-[11px] font-medium text-zinc-400">Voice Control Dock</p>
          <div className="nohby-dock inline-flex flex-wrap items-center justify-center gap-4 rounded-full px-5 py-2.5 sm:gap-6 sm:px-7">
            {/* 1. Mic Toggle (On/Off) */}
            <button
              type="button"
              onClick={toggleVoiceMic}
              className="flex flex-col items-center gap-1 text-[10px] font-medium text-zinc-300 transition hover:text-white"
            >
              <span
                className={`relative flex h-8 w-14 items-center rounded-full px-1 transition ${
                  voiceActive
                    ? "bg-gradient-to-r from-[#00B4FF] to-[#00E5FF]"
                    : "bg-[#1A2438] border border-white/[0.15]"
                }`}
              >
                <Mic className={`h-3.5 w-3.5 ${voiceActive ? "text-[#08142E]" : "text-zinc-400"}`} />
                <span
                  className={`ml-auto h-6 w-6 rounded-full bg-white shadow transition ${
                    voiceActive ? "translate-x-0" : "-translate-x-5 opacity-70"
                  }`}
                />
              </span>
              <span>{voiceActive ? "On" : "Off"}</span>
            </button>

            {/* 2. Stop / Interrupt */}
            <button
              type="button"
              onClick={handleStopInterrupt}
              className="flex flex-col items-center gap-1 text-[10px] font-medium text-zinc-300 transition hover:text-white"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-[0_0_16px_rgba(244,63,94,0.45)] transition hover:scale-105">
                <Square className="h-3.5 w-3.5 fill-current" />
              </span>
              <span>Stop/Interrupt</span>
            </button>

            {/* 3. Input Text */}
            <button
              type="button"
              onClick={() => setShowTextInput((v) => !v)}
              className="flex flex-col items-center gap-1 text-[10px] font-medium text-zinc-300 transition hover:text-white"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
                  showTextInput
                    ? "border-[#00D4FF] bg-[#00D4FF]/20 text-[#00D4FF]"
                    : "border-white/[0.14] bg-[#161E30] text-zinc-300 hover:border-[#00D4FF]/50"
                }`}
              >
                <Keyboard className="h-4 w-4" />
              </span>
              <span>Input Text</span>
            </button>

            {/* 4. Audio Settings */}
            <button
              type="button"
              onClick={() => setRoute("settings")}
              className="flex flex-col items-center gap-1 text-[10px] font-medium text-zinc-300 transition hover:text-white"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.14] bg-[#161E30] text-zinc-300 transition hover:border-[#00D4FF]/50 hover:text-[#00D4FF]">
                <AudioLines className="h-4 w-4" />
              </span>
              <span>Audio Settings</span>
            </button>
          </div>

          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
            <AudioLines className={`h-3.5 w-3.5 ${voiceActive ? "animate-pulse text-[#00D4FF]" : "text-zinc-500"}`} />
            <span>
              {sending
                ? "processing response..."
                : voiceActive
                  ? "listening for response..."
                  : "ready — toggle mic or input text"}
            </span>
          </p>
        </div>
      </section>

      {/* ============================================================
          RIGHT COLUMN: 3 STACKED LIVE TELEMETRY & CONTEXT CARDS
          ============================================================ */}
      <aside className="flex flex-col gap-4 lg:col-span-4">
        {/* 1. System Performance (Real Live Metrics) */}
        <div className="nohby-frame p-4">
          <h3 className="font-display text-sm font-semibold text-white">System Performance</h3>
          <p className="text-[11px] text-zinc-400">Live micro-metrics</p>

          <div className="mt-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">API Latency:</span>
              <span className="font-mono font-semibold text-white">
                {latencyMs !== null ? `${latencyMs}ms` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Task Success:</span>
              <span className="font-mono font-semibold text-emerald-400">{accuracyRate}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Active Agents:</span>
              <span className="font-mono font-semibold text-[#00D4FF]">
                {activeDevicesCount} {activeDevicesCount === 1 ? "device" : "devices"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Completed Tasks:</span>
              <span className="font-mono font-semibold text-white">{completedCount}</span>
            </div>
          </div>
        </div>

        {/* 2. Active Tasks (Real Live Queue from Backend) */}
        <div className="nohby-frame flex-1 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-white">Active Tasks</h3>
            <button
              type="button"
              onClick={() => setRoute("tasks")}
              className="text-[11px] font-medium text-[#00D4FF] hover:underline"
            >
              Manage
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {tasks.length === 0 ? (
              <button
                type="button"
                onClick={() => setRoute("tasks")}
                className="w-full rounded-xl border border-dashed border-white/[0.12] px-3 py-5 text-center text-xs text-zinc-400 transition hover:border-[#00D4FF]/40 hover:text-white"
              >
                No tasks queued yet — click to plan a workflow
              </button>
            ) : (
              tasks.slice(0, 3).map((task) => {
                const statusColor =
                  task.status === "running"
                    ? "text-[#00D4FF]"
                    : task.status === "completed"
                      ? "text-emerald-400"
                      : task.status === "awaiting_approval"
                        ? "text-amber-400"
                        : "text-zinc-400";
                const isRunning = task.status === "running";
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => setRoute("tasks")}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                      isRunning
                        ? "border-[#00D4FF]/50 bg-[#00D4FF]/10"
                        : "border-white/[0.08] bg-[#141B2D]/80 hover:border-[#00D4FF]/35"
                    }`}
                  >
                    <p className="truncate text-xs font-medium text-white">{task.instruction}</p>
                    <p className={`mt-0.5 text-[11px] capitalize ${statusColor}`}>
                      ({task.status.replace("_", " ")})
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 3. Memory Context (Real Live Tags + Workspace Info) */}
        <div className="nohby-frame p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-white">Memory Context</h3>
            <button
              type="button"
              onClick={() => setRoute("memory")}
              className="text-[11px] font-medium text-[#00D4FF] hover:underline"
            >
              View all
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {memoryTags.length > 0 ? (
              memoryTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/[0.12] bg-[#161E30] px-2.5 py-0.5 text-[11px] text-zinc-200"
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-white/[0.12] bg-[#161E30] px-2.5 py-0.5 text-[11px] text-zinc-400">
                No memory tags yet
              </span>
            )}
          </div>

          <div className="mt-3.5 space-y-1.5 text-xs">
            <p className="truncate text-zinc-400">
              Active Context:{" "}
              <span className="font-medium text-white">
                {latestMemory?.title || currentDevice?.deviceName || "Nohby ONE Workspace"}
              </span>
            </p>
            <p className="text-zinc-400">
              Last Sync:{" "}
              <span className="font-medium text-white">
                {formatTimeAgo(currentDevice?.lastSeenAt || latestMemory?.updatedAt)}
              </span>
            </p>
            <p className="text-zinc-400">
              Authorized Access:{" "}
              <span className="font-medium text-emerald-400">
                {health?.status === "healthy" ? "Verified Owner" : "Checking"}
              </span>
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
