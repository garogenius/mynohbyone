import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  ChevronDown,
  History,
  Keyboard,
  Loader2,
  Mic,
  Plus,
  Send,
  Square,
  Trash2,
} from "lucide-react";

import { ApiError, apiClient } from "../lib/api";
import { getSelectedOrbStyle, type OrbStyleOption } from "../lib/orbStyle";
import {
  isSpeechRecognitionSupported,
  speakText,
  startLocalVoiceRecognition,
  stopSpeaking,
  type VoiceSessionHandle,
} from "../lib/voice";
import { useAppStore } from "../store/useAppStore";
import type { Conversation, FileItem, MemoryItem, Message, Task } from "../types/api";

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
  const {
    user,
    devices,
    currentDeviceId,
    health,
    voiceSettings,
    loadVoiceSettings,
    setRoute,
    showToast,
  } = useAppStore();

  // Real live telemetry & data
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [recentMessages, setRecentMessages] = useState<Message[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Voice Control Dock state
  const [orbStyle, setOrbStyle] = useState<OrbStyleOption>(() => getSelectedOrbStyle());
  const [voiceActive, setVoiceActive] = useState(false);
  const [isAssistantSpeaking, setIsAssistantSpeaking] = useState(false);
  const [jarvisState, setJarvisState] = useState<"standby" | "awake" | "thinking" | "speaking">("standby");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [sending, setSending] = useState(false);
  const voiceHandleRef = useRef<VoiceSessionHandle | null>(null);

  const isOrbMoving =
    voiceActive ||
    isAssistantSpeaking ||
    sending ||
    jarvisState === "awake" ||
    jarvisState === "thinking" ||
    jarvisState === "speaking";

  // Sync live bubbles and orb animation with global JarvisWakeEngine & orb style picker
  useEffect(() => {
    const onOrbChange = () => setOrbStyle(getSelectedOrbStyle());
    const onJarvisState = (e: Event) => {
      const detail = (e as CustomEvent<{ state: "standby" | "awake" | "thinking" | "speaking" }>).detail;
      if (detail?.state) setJarvisState(detail.state);
    };
    const onJarvisReply = (e: Event) => {
      const detail = (e as CustomEvent<{ userMessage: Message; assistantMessage: Message }>).detail;
      if (detail?.userMessage && detail?.assistantMessage) {
        setRecentMessages((prev) => [...prev.slice(-2), detail.userMessage, detail.assistantMessage]);
      }
    };
    window.addEventListener("nohby-orb-style-change", onOrbChange);
    window.addEventListener("nohby-jarvis-state", onJarvisState);
    window.addEventListener("nohby-jarvis-reply", onJarvisReply);
    return () => {
      window.removeEventListener("nohby-orb-style-change", onOrbChange);
      window.removeEventListener("nohby-jarvis-state", onJarvisState);
      window.removeEventListener("nohby-jarvis-reply", onJarvisReply);
    };
  }, []);

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
      apiClient.listConversations({ limit: 20 }).catch(() => null),
    ]);

    if (tRes) setTasks(tRes.data.tasks);
    if (mRes) setMemories(mRes.data.memories);
    if (fRes) setFiles(fRes.data.files);

    if (cRes) {
      setConversations(cRes.data.conversations);
      if (cRes.data.conversations.length > 0 && !conversationId) {
        const latestConv = cRes.data.conversations[0];
        setConversationId(latestConv.id);
        const detail = await apiClient.getConversation(latestConv.id).catch(() => null);
        if (detail) {
          setRecentMessages(detail.data.messages.slice(-4));
        }
      }
    }
  }, [conversationId]);

  const handleSelectConversation = async (id: string) => {
    setConversationId(id);
    setHistoryOpen(false);
    const detail = await apiClient.getConversation(id).catch(() => null);
    if (detail) {
      setRecentMessages(detail.data.messages.slice(-4));
    }
  };

  const handleNewConversation = async () => {
    try {
      const created = await apiClient.createConversation({ title: "New Session", mode: "assistant" });
      setConversationId(created.data.conversation.id);
      setConversations((prev) => [created.data.conversation, ...prev]);
      setRecentMessages([]);
      setHistoryOpen(false);
      showToast("info", "Started a fresh session.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Unable to start new session.");
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await apiClient.deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (conversationId === id) {
        if (remaining.length > 0) {
          handleSelectConversation(remaining[0].id);
        } else {
          setConversationId(null);
          setRecentMessages([]);
        }
      }
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to delete session.");
    }
  };

  useEffect(() => {
    if (!voiceSettings) {
      loadVoiceSettings();
    }
    loadLiveDashboardData();
    return () => {
      voiceHandleRef.current?.cancel();
      stopSpeaking();
    };
  }, [loadLiveDashboardData, loadVoiceSettings, voiceSettings]);

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

        if ((inputType === "voice" || voiceSettings?.autoSpeakResponses) && res.data.assistantMessage.content) {
          speakText(res.data.assistantMessage.content.slice(0, 260), {
            language: voiceSettings?.inputLanguage || "en-US",
            voiceType: voiceSettings?.voiceType || "female",
            pitch: voiceSettings?.ttsPitch,
            rate: voiceSettings?.ttsRate ?? 1.0,
            onStart: () => setIsAssistantSpeaking(true),
            onEnd: () => setIsAssistantSpeaking(false),
          });
        }

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
    [conversationId, currentDeviceId, sending, showToast, voiceSettings]
  );

  const interimTimerRef = useRef<number | null>(null);

  const setManualMicState = (active: boolean) => {
    setVoiceActive(active);
    window.dispatchEvent(new CustomEvent("nohby-manual-mic", { detail: { active } }));
  };

  const toggleVoiceMic = () => {
    if (voiceActive) {
      if (interimTimerRef.current) window.clearTimeout(interimTimerRef.current);
      voiceHandleRef.current?.stop();
      voiceHandleRef.current = null;
      setManualMicState(false);
      setInterimTranscript("");
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      showToast("info", "Browser voice recognition unavailable — use Input Text below.");
      setShowTextInput(true);
      return;
    }

    stopSpeaking();
    setManualMicState(true);
    setInterimTranscript("");
    let committed = false;

    const commitVoiceText = (rawText: string) => {
      if (committed) return;
      const trimmed = rawText.trim();
      if (!trimmed) return;
      committed = true;
      if (interimTimerRef.current) {
        window.clearTimeout(interimTimerRef.current);
        interimTimerRef.current = null;
      }
      setInterimTranscript("");
      voiceHandleRef.current?.stop();
      voiceHandleRef.current = null;
      setManualMicState(false);
      sendToActiveSession(trimmed, "voice");
    };

    voiceHandleRef.current = startLocalVoiceRecognition({
      language: voiceSettings?.inputLanguage || "en-US",
      onInterim: (text: string) => {
        setInterimTranscript(text);
        if (interimTimerRef.current) window.clearTimeout(interimTimerRef.current);
        if (text.trim()) {
          interimTimerRef.current = window.setTimeout(() => {
            commitVoiceText(text);
          }, 1400);
        }
      },
      onFinal: (text: string) => {
        commitVoiceText(text);
      },
      onError: (msg: string) => {
        if (msg !== "no-speech" && msg !== "aborted") {
          showToast("error", `Voice error: ${msg}`);
        }
        setManualMicState(false);
      },
      onEnd: () => {
        setManualMicState(false);
      },
    });
  };

  const handleStopInterrupt = () => {
    if (interimTimerRef.current) window.clearTimeout(interimTimerRef.current);
    voiceHandleRef.current?.cancel();
    voiceHandleRef.current = null;
    stopSpeaking();
    setManualMicState(false);
    setIsAssistantSpeaking(false);
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
    <div className="grid w-full gap-3 lg:h-[calc(100vh-5.25rem)] lg:grid-cols-[minmax(0,1fr)_250px] xl:grid-cols-[minmax(0,1fr)_265px] lg:overflow-hidden">
      {/* ============================================================
          LEFT / CENTER: ACTIVE SESSION STAGE (Zero-Scroll Room)
          ============================================================ */}
      <section className="nohby-stage flex flex-col justify-between p-3.5 sm:p-4 lg:h-full lg:overflow-hidden">
        {/* Clean Stage Header (Exact Reference Match) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-semibold text-white">Active Session</h2>
            {(voiceActive || jarvisState === "awake") && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-2 py-0.5 text-[10px] font-medium text-[#00D4FF]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00D4FF]" />
                Listening
              </span>
            )}
            {(isAssistantSpeaking || jarvisState === "speaking") && !voiceActive && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
                NohbyAI Speaking
              </span>
            )}
          </div>
        </div>

        {/* Centerpiece: Adapts frame automatically to selected wave shape (circular orb vs wide horizontal wave) */}
        <div className="my-1 flex flex-1 items-center justify-center px-2">
          <button
            type="button"
            onClick={toggleVoiceMic}
            aria-label={voiceActive ? "Stop voice listening" : "Start voice listening"}
            className={`group relative flex items-center justify-center overflow-hidden transition duration-300 ${
              orbStyle.shape === "wide"
                ? "aspect-[16/9] max-h-52 w-full max-w-[440px] rounded-2xl xl:max-h-56 xl:max-w-[500px]"
                : "h-44 w-44 rounded-full xl:h-52 xl:w-52"
            } ${
              isOrbMoving
                ? "scale-[1.03] shadow-[0_0_65px_rgba(0,212,255,0.55)]"
                : "hover:scale-[1.015] shadow-[0_0_32px_rgba(0,102,255,0.28)]"
            }`}
          >
            <img
              src={isOrbMoving ? orbStyle.gif : orbStyle.still}
              alt={orbStyle.label}
              className={`h-full w-full object-cover transition duration-300 ${
                orbStyle.shape === "wide" ? "rounded-2xl" : "scale-[1.34] rounded-full"
              } ${isOrbMoving ? "opacity-100" : "opacity-95"}`}
            />
            <span
              className={`pointer-events-none absolute inset-0 border transition ${
                orbStyle.shape === "wide" ? "rounded-2xl" : "rounded-full"
              } ${
                isOrbMoving
                  ? "border-[#00D4FF]/75 ring-4 ring-[#00D4FF]/20"
                  : "border-[#00D4FF]/30 group-hover:border-[#00D4FF]/55"
              }`}
            />
          </button>
        </div>

        {/* Live Conversation Exchange Bubbles (Compact) */}
        <div
          className={`mx-auto mb-2.5 grid w-full gap-2.5 ${
            interimTranscript || latestUserMsg ? "max-w-2xl sm:grid-cols-2" : "max-w-md grid-cols-1"
          }`}
        >
          <div className="flex flex-col items-start">
            <span className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-[#00D4FF]/35 bg-[#101A2E] px-2 py-0.5 text-[10px] font-medium text-zinc-200">
              NohbyAI
              <img src="/icon-white.png" alt="" className="h-3 w-3 rounded-full object-contain" />
            </span>
            <div className="nohby-bubble-ai w-full rounded-xl rounded-tl-sm px-3 py-2 text-[11px] leading-relaxed text-zinc-100">
              {sending ? (
                <span className="inline-flex items-center gap-1.5 text-[#00D4FF]">
                  <Loader2 className="h-3 w-3 animate-spin" /> Thinking...
                </span>
              ) : latestAssistantMsg ? (
                <p className="line-clamp-2">{latestAssistantMsg.content}</p>
              ) : (
                <p className="line-clamp-2">
                  Hello {user?.profile?.displayName || user?.name}. Tap the mic or type a command to begin.
                </p>
              )}
            </div>
          </div>

          {(interimTranscript || latestUserMsg) && (
            <div className="flex flex-col items-end justify-end">
              <span className="mb-1 rounded-full border border-white/[0.12] bg-[#161E30] px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                You
              </span>
              <div className="w-full rounded-xl rounded-tr-sm border border-white/[0.1] bg-[#151B2B]/90 px-3 py-2 text-[11px] leading-relaxed text-zinc-200">
                {interimTranscript ? (
                  <p className="line-clamp-2 italic text-[#00D4FF]">{interimTranscript}</p>
                ) : (
                  <p className="line-clamp-2">{latestUserMsg?.content}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Optional Inline Text Input */}
        {showTextInput && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendToActiveSession(textDraft, "text");
            }}
            className="mx-auto mb-2 flex w-full max-w-lg items-center gap-2"
          >
            <input
              type="text"
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="Type a message or command..."
              autoFocus
              className="studio-input h-8 flex-1 rounded-full px-3.5 text-xs"
            />
            <button
              type="submit"
              disabled={sending || !textDraft.trim()}
              className="btn-ivory inline-flex h-8 items-center gap-1 rounded-full px-3.5 text-xs"
            >
              {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Send
            </button>
          </form>
        )}

        {/* Compact Voice Control Dock */}
        <div className="flex flex-col items-center">
          <p className="mb-1 text-[10px] font-medium text-zinc-400">Voice Control Dock</p>
          <div className="nohby-dock inline-flex flex-wrap items-center justify-center gap-4 rounded-full px-5 py-2 sm:gap-6">
            <button
              type="button"
              onClick={toggleVoiceMic}
              className="flex flex-col items-center gap-0.5 text-[10px] font-medium text-zinc-300 transition hover:text-white"
            >
              <span
                className={`relative flex h-7 w-12 items-center rounded-full px-1 transition ${
                  voiceActive
                    ? "bg-gradient-to-r from-[#00B4FF] to-[#00E5FF]"
                    : "border border-white/[0.15] bg-[#1A2438]"
                }`}
              >
                <Mic className={`h-3 w-3 ${voiceActive ? "text-[#08142E]" : "text-zinc-400"}`} />
                <span
                  className={`ml-auto h-5 w-5 rounded-full bg-white shadow transition ${
                    voiceActive ? "translate-x-0" : "-translate-x-4 opacity-75"
                  }`}
                />
              </span>
              <span>{voiceActive ? "On" : "Off"}</span>
            </button>

            <button
              type="button"
              onClick={handleStopInterrupt}
              className="flex flex-col items-center gap-0.5 text-[10px] font-medium text-zinc-300 transition hover:text-white"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-[0_0_12px_rgba(244,63,94,0.45)] transition hover:scale-105">
                <Square className="h-3 w-3 fill-current" />
              </span>
              <span>Stop/Interrupt</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTextInput((v) => !v)}
              className="flex flex-col items-center gap-0.5 text-[10px] font-medium text-zinc-300 transition hover:text-white"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
                  showTextInput
                    ? "border-[#00D4FF] bg-[#00D4FF]/20 text-[#00D4FF]"
                    : "border-white/[0.14] bg-[#161E30] text-zinc-300 hover:border-[#00D4FF]/50"
                }`}
              >
                <Keyboard className="h-3.5 w-3.5" />
              </span>
              <span>Input Text</span>
            </button>

            <button
              type="button"
              onClick={() => setRoute("settings")}
              className="flex flex-col items-center gap-0.5 text-[10px] font-medium text-zinc-300 transition hover:text-white"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.14] bg-[#161E30] text-zinc-300 transition hover:border-[#00D4FF]/50 hover:text-[#00D4FF]">
                <AudioLines className="h-3.5 w-3.5" />
              </span>
              <span>Audio Settings</span>
            </button>
          </div>

          <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-zinc-400">
            <AudioLines className={`h-3 w-3 ${voiceActive ? "animate-pulse text-[#00D4FF]" : "text-zinc-500"}`} />
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
          RIGHT COLUMN: SLIM 250px RAIL (History Dropdown + Metrics)
          ============================================================ */}
      <aside className="flex flex-col gap-2.5 lg:h-full lg:overflow-hidden">
        {/* 0. Workspace History Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="nohby-frame flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:border-[#00D4FF]/60"
          >
            <div className="flex min-w-0 items-center gap-2">
              <History className="h-3.5 w-3.5 shrink-0 text-[#00D4FF]" />
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-white">
                  {conversations.find((c) => c.id === conversationId)?.title || "Session History"}
                </p>
                <p className="text-[9px] text-zinc-400">
                  {conversations.length} workspace thread{conversations.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition ${
                historyOpen ? "rotate-180 text-[#00D4FF]" : ""
              }`}
            />
          </button>

          {historyOpen && (
            <div className="dropdown-surface absolute right-0 top-full z-30 mt-1.5 w-full rounded-xl border border-[#00D4FF]/35 p-2 shadow-2xl">
              <button
                type="button"
                onClick={handleNewConversation}
                className="btn-ivory mb-2 flex h-7 w-full items-center justify-center gap-1.5 rounded-lg text-[11px]"
              >
                <Plus className="h-3 w-3" />
                New Session
              </button>

              <div className="max-h-48 space-y-1 overflow-y-auto">
                {conversations.length === 0 ? (
                  <p className="py-3 text-center text-[10px] text-zinc-400">No saved chats yet</p>
                ) : (
                  conversations.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`group flex cursor-pointer items-center justify-between gap-1.5 rounded-lg px-2 py-1.5 text-[11px] transition ${
                        conv.id === conversationId
                          ? "bg-[#00D4FF]/15 font-medium text-[#00D4FF]"
                          : "text-zinc-300 hover:bg-white/[0.06]"
                      }`}
                    >
                      <span className="truncate">{conv.title}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(conv.id);
                        }}
                        className="shrink-0 rounded p-0.5 text-zinc-500 opacity-60 hover:text-rose-400 hover:opacity-100"
                        title="Delete session"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* 1. System Performance */}
        <div className="nohby-frame p-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-[12px] font-semibold text-white">System Performance</h3>
            <span className="text-[9px] text-zinc-500">Live</span>
          </div>

          <div className="mt-2 space-y-1 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Latency:</span>
              <span className="font-mono font-semibold text-white">
                {latencyMs !== null ? `${latencyMs}ms` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Accuracy:</span>
              <span className="font-mono font-semibold text-emerald-400">{accuracyRate}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Nodes:</span>
              <span className="font-mono font-semibold text-[#00D4FF]">
                {activeDevicesCount} · {completedCount} done
              </span>
            </div>
          </div>
        </div>

        {/* 2. Active Tasks */}
        <div className="nohby-frame flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[12px] font-semibold text-white">Active Tasks</h3>
            <button
              type="button"
              onClick={() => setRoute("tasks")}
              className="text-[10px] font-medium text-[#00D4FF] hover:underline"
            >
              Manage
            </button>
          </div>

          <div className="mt-2 flex-1 space-y-1.5 overflow-y-auto">
            {tasks.length === 0 ? (
              <button
                type="button"
                onClick={() => setRoute("tasks")}
                className="w-full rounded-lg border border-dashed border-white/[0.1] px-2.5 py-3 text-center text-[10px] text-zinc-400 transition hover:border-[#00D4FF]/40 hover:text-white"
              >
                No tasks queued — plan one
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
                    className={`w-full rounded-lg border px-2.5 py-1.5 text-left transition ${
                      isRunning
                        ? "border-[#00D4FF]/50 bg-[#00D4FF]/10"
                        : "border-white/[0.08] bg-[#141B2D]/80 hover:border-[#00D4FF]/35"
                    }`}
                  >
                    <p className="truncate text-[11px] font-medium text-white">{task.instruction}</p>
                    <p className={`text-[10px] capitalize ${statusColor}`}>
                      ({task.status.replace("_", " ")})
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* 3. Memory Context */}
        <div className="nohby-frame p-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-[12px] font-semibold text-white">Memory Context</h3>
            <button
              type="button"
              onClick={() => setRoute("memory")}
              className="text-[10px] font-medium text-[#00D4FF] hover:underline"
            >
              View all
            </button>
          </div>

          <div className="mt-1.5 flex flex-wrap gap-1">
            {memoryTags.length > 0 ? (
              memoryTags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/[0.12] bg-[#161E30] px-2 py-0.5 text-[10px] text-zinc-200"
                >
                  {tag}
                </span>
              ))
            ) : (
              <span className="rounded-full border border-white/[0.1] bg-[#161E30] px-2 py-0.5 text-[10px] text-zinc-400">
                No tags
              </span>
            )}
          </div>

          <div className="mt-2 space-y-0.5 text-[10px]">
            <p className="truncate text-zinc-400">
              Context:{" "}
              <span className="font-medium text-white">
                {latestMemory?.title || currentDevice?.deviceName || "Nohby ONE"}
              </span>
            </p>
            <p className="text-zinc-400">
              Sync:{" "}
              <span className="font-medium text-white">
                {formatTimeAgo(currentDevice?.lastSeenAt || latestMemory?.updatedAt)}
              </span>
            </p>
            <p className="text-zinc-400">
              Access:{" "}
              <span className="font-medium text-emerald-400">
                {health?.status === "healthy" ? "Verified" : "Checking"}
              </span>
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
