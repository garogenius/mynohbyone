import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mic,
  MicOff,
  Play,
  Plus,
  Send,
  Shield,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";

import { EmptyState, LoadingState } from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import {
  isSpeechRecognitionSupported,
  startLocalVoiceRecognition,
  startMicLevelMonitor,
  type VoiceSessionHandle,
} from "../lib/voice";
import { useAppStore } from "../store/useAppStore";
import type { MeetingItem } from "../types/api";

async function syncNativeStealthMode(enabled: boolean): Promise<boolean> {
  if (typeof window !== "undefined" && window.__TAURI__?.core?.invoke) {
    try {
      await window.__TAURI__.core.invoke<boolean>("set_stealth_mode", { enabled });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

async function hideNativeWindowToBackground(): Promise<boolean> {
  if (typeof window !== "undefined" && window.__TAURI__?.core?.invoke) {
    try {
      await window.__TAURI__.core.invoke<boolean>("hide_to_background");
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

const WAVE_BARS = [6, 10, 14, 18, 10, 12, 16, 20, 10, 14, 16, 20, 8, 12, 14, 10, 8, 12, 16, 10, 12, 16, 10, 12, 18, 12, 14, 16, 12, 18];

export function MeetingsScreen() {
  const { currentDeviceId, voiceSettings, showToast } = useAppStore();

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [selected, setSelected] = useState<MeetingItem | null>(null);
  const [activeTab, setActiveTab] = useState<"transcript" | "summary" | "actions">("transcript");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pushingTasks, setPushingTasks] = useState(false);

  // New session bar
  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState<"interview" | "meeting" | "standup" | "client_call">("interview");
  const [provider, setProvider] = useState("zoom");
  const [stealthEnabled, setStealthEnabled] = useState(true);
  const [hiddenOverlay, setHiddenOverlay] = useState(false);

  // Background listening & real-time 30-bar sound frequency monitor
  const [isListening, setIsListening] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("nohbyone.meetingMicOn") === "true";
  });
  const [liveCaption, setLiveCaption] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [waveLevels, setWaveLevels] = useState<number[]>(() =>
    WAVE_BARS.map((h) => h / 24)
  );
  const voiceHandleRef = useRef<VoiceSessionHandle | null>(null);
  const stopMonitorRef = useRef<(() => void) | null>(null);
  const interimCommitTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const isListeningRef = useRef<boolean>(isListening);
  const lastSentFinalRef = useRef<string>("");
  isListeningRef.current = isListening;

  const stopAudioCapture = useCallback((persistOff = false) => {
    if (interimCommitTimerRef.current) {
      window.clearTimeout(interimCommitTimerRef.current);
      interimCommitTimerRef.current = null;
    }
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (stopMonitorRef.current) {
      stopMonitorRef.current();
      stopMonitorRef.current = null;
    }
    voiceHandleRef.current?.cancel();
    voiceHandleRef.current = null;
    if (persistOff) {
      setIsListening(false);
      isListeningRef.current = false;
      if (typeof window !== "undefined") {
        sessionStorage.setItem("nohbyone.meetingMicOn", "false");
      }
    }
    setLiveCaption("");
    setWaveLevels(WAVE_BARS.map((h) => h / 24));
    window.dispatchEvent(new CustomEvent("nohby-manual-mic", { detail: { active: false } }));
  }, []);

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.listMeetings();
      setMeetings(res.data.meetings);
      if (res.data.meetings.length > 0) {
        const targetId = selected?.id || res.data.meetings[0].id;
        const detail = await apiClient.getMeeting(targetId).catch(() => null);
        if (detail) {
          setSelected(detail.data.meeting);
          setStealthEnabled(detail.data.meeting.stealthMode);
        }
      } else {
        setSelected(null);
      }
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to load meetings.");
    } finally {
      setLoading(false);
    }
  }, [selected?.id, showToast]);

  useEffect(() => {
    loadMeetings();
    return () => {
      stopAudioCapture();
    };
  }, [loadMeetings, stopAudioCapture]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setHiddenOverlay((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const selectMeeting = async (id: string) => {
    try {
      const detail = await apiClient.getMeeting(id);
      setSelected(detail.data.meeting);
      setStealthEnabled(detail.data.meeting.stealthMode);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Unable to load session.");
    }
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim() || "Live Interview Session";
    setCreating(true);
    try {
      const res = await apiClient.createMeeting({
        title: cleanTitle,
        meetingType,
        provider,
        stealthMode: stealthEnabled,
      });
      setTitle("");
      setSelected(res.data.meeting);
      if (stealthEnabled) await syncNativeStealthMode(true);
      showToast("success", "Session started.");
      await loadMeetings();
      await selectMeeting(res.data.meeting.id);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to start session.");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStealth = async () => {
    const next = !stealthEnabled;
    setStealthEnabled(next);
    const nativeApplied = await syncNativeStealthMode(next);
    if (selected) {
      await apiClient.toggleMeetingStealth(selected.id, next).catch(() => null);
    }
    showToast(
      "info",
      next
        ? nativeApplied
          ? "Stealth ON — hidden from screen share & taskbar."
          : "Stealth ON — press Ctrl+Shift+H or click Hide App anytime."
        : "Stealth OFF."
    );
  };

  const handleHideInBackground = async () => {
    const hiddenNatively = await hideNativeWindowToBackground();
    if (!hiddenNatively) setHiddenOverlay(true);
  };

  const sendTranscriptSegment = useCallback(
    async (meetingId: string, content: string, speaker = "Speaker") => {
      if (!content.trim()) return;
      try {
        const res = await apiClient.appendMeetingTranscript(meetingId, {
          speaker,
          content: content.trim(),
        });
        setSelected((prev) =>
          prev && prev.id === meetingId
            ? {
                ...prev,
                transcripts: [...(prev.transcripts || []), res.data.transcript],
                transcriptCount: (prev.transcriptCount || 0) + 1,
              }
            : prev
        );
      } catch {
        // Silent
      }
    },
    []
  );

  const startMeetingRecognitionLoop = useCallback(
    (activeMeetingId: string) => {
      if (!isListeningRef.current) return;
      lastSentFinalRef.current = "";
      voiceHandleRef.current = startLocalVoiceRecognition({
        language: voiceSettings?.inputLanguage || "en-US",
        onInterim: (fullText: string) => {
          const prevSent = lastSentFinalRef.current;
          const pendingDelta = fullText.startsWith(prevSent)
            ? fullText.slice(prevSent.length).trim()
            : fullText.trim();

          setLiveCaption(pendingDelta);

          if (interimCommitTimerRef.current) {
            window.clearTimeout(interimCommitTimerRef.current);
          }
          if (pendingDelta) {
            interimCommitTimerRef.current = window.setTimeout(() => {
              lastSentFinalRef.current = fullText;
              setLiveCaption("");
              sendTranscriptSegment(activeMeetingId, pendingDelta, "Speaker");
            }, 850);
          }
        },
        onFinal: (fullText: string) => {
          if (interimCommitTimerRef.current) {
            window.clearTimeout(interimCommitTimerRef.current);
            interimCommitTimerRef.current = null;
          }
          const prevSent = lastSentFinalRef.current;
          const delta = fullText.startsWith(prevSent)
            ? fullText.slice(prevSent.length).trim()
            : fullText.trim();
          lastSentFinalRef.current = fullText;
          if (delta) {
            setLiveCaption("");
            sendTranscriptSegment(activeMeetingId, delta, "Speaker");
          }
        },
        onError: (msg: string) => {
          if (msg === "not-allowed" || msg === "service-not-allowed") {
            showToast("error", "Microphone access denied by browser.");
            stopAudioCapture(true);
          }
        },
        onEnd: () => {
          if (isListeningRef.current) {
            restartTimerRef.current = window.setTimeout(
              () => startMeetingRecognitionLoop(activeMeetingId),
              300
            );
          }
        },
      });
    },
    [sendTranscriptSegment, showToast, stopAudioCapture, voiceSettings?.inputLanguage]
  );

  const toggleBackgroundMic = () => {
    if (!selected) {
      showToast("info", "Start a session first.");
      return;
    }
    if (isListening) {
      stopAudioCapture(true);
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      showToast("error", "Speech recognition unavailable in this browser.");
      return;
    }
    setIsListening(true);
    isListeningRef.current = true;
    if (typeof window !== "undefined") {
      sessionStorage.setItem("nohbyone.meetingMicOn", "true");
    }
    window.dispatchEvent(new CustomEvent("nohby-manual-mic", { detail: { active: true } }));

    // Start 60fps real-time high/low sound frequency analyser across all 30 bars
    startMicLevelMonitor((levels) => {
      setWaveLevels(levels);
    }, WAVE_BARS.length).then((stopFn) => {
      stopMonitorRef.current = stopFn;
    });

    startMeetingRecognitionLoop(selected.id);
  };

  const handleStopAndSummarise = async () => {
    if (!selected) return;
    stopAudioCapture(true);
    try {
      const res = await apiClient.stopMeeting(selected.id);
      setSelected(res.data.meeting);
      setActiveTab("summary");
      showToast("success", "Session summarised.");
      await loadMeetings();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to summarise.");
    }
  };

  const handlePushActionsToTasks = async () => {
    if (!selected || pushingTasks) return;
    const items = selected.actionItems?.length
      ? selected.actionItems
      : [`Follow up on "${selected.title}" notes`];
    setPushingTasks(true);
    try {
      for (const act of items.slice(0, 3)) {
        await apiClient.createTask({
          instruction: act,
          deviceId: currentDeviceId,
          source: "meeting_action_items",
        });
      }
      showToast("success", `Pushed ${Math.min(items.length, 3)} action item(s) to Tasks.`);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to push tasks.");
    } finally {
      setPushingTasks(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteMeeting(id);
      if (selected?.id === id) setSelected(null);
      await loadMeetings();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Delete failed.");
    }
  };

  if (hiddenOverlay) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end justify-end bg-[#080C14] p-4">
        <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#101624] px-3 py-1.5 text-[11px] text-zinc-400">
          <span className={`h-2 w-2 rounded-full ${isListening ? "animate-pulse bg-emerald-400" : "bg-zinc-600"}`} />
          <span>{isListening ? "Stealth Listening Active" : "Hidden"}</span>
          <button
            type="button"
            onClick={() => setHiddenOverlay(false)}
            className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-0.5 text-[10px] font-medium text-white"
          >
            <Eye className="h-3 w-3" /> Restore (Ctrl+Shift+H)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3.5">
      {/* Slim Stealth Controls + Quick New Session Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#101624] px-3.5 py-2.5">
        <form onSubmit={handleStartSession} className="flex flex-1 flex-wrap items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New meeting or interview title..."
            className="studio-input h-8 min-w-[200px] flex-1 rounded-lg px-3 text-xs"
          />
          <select
            value={meetingType}
            onChange={(e) => setMeetingType(e.target.value as typeof meetingType)}
            className="studio-input h-8 rounded-lg px-2.5 text-xs"
          >
            <option value="interview">Interview</option>
            <option value="meeting">Meeting</option>
            <option value="standup">Standup</option>
            <option value="client_call">Client Call</option>
          </select>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="studio-input h-8 rounded-lg px-2.5 text-xs"
          >
            <option value="zoom">Zoom</option>
            <option value="google_meet">Google Meet</option>
            <option value="microsoft_teams">Teams</option>
            <option value="local_audio">Local Mic</option>
          </select>
          <button
            type="submit"
            disabled={creating}
            className="btn-ivory inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            New
          </button>
        </form>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleToggleStealth}
            className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-medium transition ${
              stealthEnabled
                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-400"
                : "border-white/[0.1] bg-[#141B2D] text-zinc-400"
            }`}
            title="Exclude from Zoom/Meet/Teams screen share"
          >
            <Shield className="h-3 w-3" />
            {stealthEnabled ? "Stealth On" : "Stealth Off"}
          </button>
          <button
            type="button"
            onClick={handleHideInBackground}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#00D4FF]/35 bg-[#00D4FF]/10 px-2.5 text-[11px] font-medium text-[#00D4FF] hover:bg-[#00D4FF]/20"
            title="Hide app completely while listening in background (Ctrl+Shift+H)"
          >
            <EyeOff className="h-3 w-3" />
            Hide App
          </button>
        </div>
      </div>

      {/* Session Switcher Pills */}
      {meetings.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {meetings.map((m) => (
            <div
              key={m.id}
              onClick={() => selectMeeting(m.id)}
              className={`group flex shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-[11px] transition ${
                selected?.id === m.id
                  ? "border-[#00D4FF]/50 bg-[#00D4FF]/15 font-medium text-[#00D4FF]"
                  : "border-white/[0.08] bg-[#101624] text-zinc-400 hover:text-white"
              }`}
            >
              <span className="max-w-[180px] truncate">{m.title}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(m.id);
                }}
                className="opacity-50 hover:text-rose-400 hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Meeting View matching Screenshot 1 */}
      {loading && meetings.length === 0 ? (
        <LoadingState message="Loading sessions..." />
      ) : !selected ? (
        <EmptyState
          title="No meeting or interview selected"
          description="Create a new stealth session above to start background listening with live coaching hints."
        />
      ) : (
        <div className="space-y-3.5">
          {/* Header Row matching Screenshot 1 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">{selected.title}</h2>
              <p className="text-xs capitalize text-zinc-400">
                {new Date(selected.startedAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {selected.meetingType.replace("_", " ")} · {selected.provider.replace("_", " ")}
                {selected.stealthMode ? " · Hidden Stealth Active" : ""}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {selected.status !== "completed" && (
                <button
                  type="button"
                  onClick={handleStopAndSummarise}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.12] bg-[#101624] px-3 text-xs font-medium text-zinc-200 hover:border-[#00D4FF]/40"
                >
                  <Square className="h-3 w-3" /> End &amp; Summarise
                </button>
              )}
              <button
                type="button"
                disabled={pushingTasks}
                onClick={handlePushActionsToTasks}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/15 px-3.5 text-xs font-medium text-violet-300 transition hover:bg-violet-500/25"
              >
                {pushingTasks && <Loader2 className="h-3 w-3 animate-spin" />}
                Push All Actions to Tasks
              </button>
            </div>
          </div>

          {/* Sleek Audio Waveform Bar matching Screenshot 1 */}
          <div className="flex items-center gap-3.5 rounded-xl border border-white/[0.08] bg-[#101624] px-4 py-3">
            <button
              type="button"
              onClick={toggleBackgroundMic}
              disabled={selected.status === "completed"}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow transition ${
                isListening
                  ? "bg-gradient-to-br from-rose-500 to-fuchsia-600"
                  : "bg-gradient-to-br from-[#00D4FF] to-[#0066FF]"
              }`}
              title={isListening ? "Stop background listening" : "Start background listening"}
            >
              {isListening ? (
                <MicOff className="h-4 w-4" />
              ) : selected.status === "completed" ? (
                <Play className="h-4 w-4 fill-current" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] text-zinc-500">
                <span className="flex items-center gap-2">
                  <span>{isListening ? "LIVE CAPTURE" : `${selected.transcriptCount} SEGMENTS`}</span>
                  {isListening && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#00D4FF]/15 px-2 py-0.2 text-[9px] font-semibold text-[#00D4FF]">
                      <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[#00D4FF]" />
                      {Math.max(...waveLevels) > 0.45
                        ? "SOUND: HIGH"
                        : Math.max(...waveLevels) > 0.22
                          ? "SOUND: ACTIVE"
                          : "SOUND: LOW"}
                    </span>
                  )}
                </span>
                <span>{selected.status.toUpperCase()}</span>
              </div>
              <div className="flex h-7 items-center gap-1.5 overflow-hidden">
                {WAVE_BARS.map((baseH, i) => {
                  const activeBar = isListening
                    ? true
                    : i < Math.min(WAVE_BARS.length, Math.max(6, selected.transcriptCount * 3));
                  const level = waveLevels[i] ?? 0.16;
                  const liveHeight = isListening
                    ? Math.max(5, Math.min(28, Math.round(4 + level * 24)))
                    : baseH;
                  const isLoudPeak = isListening && level > 0.42;
                  return (
                    <span
                      key={i}
                      style={{ height: `${liveHeight}px` }}
                      className={`w-2 flex-1 rounded-full transition-all duration-75 ${
                        activeBar
                          ? isLoudPeak
                            ? "bg-gradient-to-t from-[#0094E8] to-[#00E5FF] shadow-[0_0_10px_rgba(0,212,255,0.65)]"
                            : "bg-[#00D4FF]"
                          : "bg-slate-600/40"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Clean Pill Tabs matching Screenshot 1 */}
          <div className="flex items-center gap-2">
            {(
              [
                { id: "transcript", label: "Live Transcript" },
                { id: "summary", label: "AI Summary" },
                { id: "actions", label: "Action Items" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === t.id
                    ? "border border-[#00D4FF]/40 bg-[#00D4FF]/15 text-[#00D4FF]"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "transcript" ? (
            <div className="space-y-2">
              {selected.status !== "completed" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!manualInput.trim()) return;
                    sendTranscriptSegment(selected.id, manualInput.trim(), "Interviewer");
                    setManualInput("");
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="Capture a question or speak with the mic above for instant private coaching hints..."
                    className="studio-input h-8 flex-1 rounded-lg px-3 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={!manualInput.trim()}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#00D4FF]/35 bg-[#00D4FF]/10 px-3 text-xs font-medium text-[#00D4FF]"
                  >
                    <Send className="h-3 w-3" /> Add
                  </button>
                </form>
              )}

              {liveCaption && (
                <div className="rounded-xl border border-[#00D4FF]/30 bg-[#00D4FF]/10 px-3.5 py-2 text-xs italic text-[#00D4FF]">
                  {liveCaption}
                </div>
              )}

              {(!selected.transcripts || selected.transcripts.length === 0) ? (
                <div className="rounded-xl border border-white/[0.07] bg-[#101624] px-4 py-8 text-center text-xs text-zinc-500">
                  Press the blue mic button above to listen silently in the background.
                </div>
              ) : (
                selected.transcripts.map((seg) => (
                  <div
                    key={seg.id}
                    className="rounded-xl border border-white/[0.07] bg-[#101624] px-4 py-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#00D4FF]">{seg.speaker}</span>
                      <span className="font-mono text-[11px] text-zinc-500">
                        {new Date(seg.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-200">{seg.content}</p>
                    {seg.aiHint && (
                      <p className="mt-2 flex items-start gap-1.5 border-t border-white/[0.06] pt-2 text-[11px] text-zinc-400">
                        <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-[#00D4FF]" />
                        <span>
                          <strong className="text-[#00D4FF]">Private Hint:</strong> {seg.aiHint}
                        </span>
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : activeTab === "summary" ? (
            <div className="rounded-xl border border-white/[0.08] bg-[#101624] p-4">
              {selected.summary ? (
                <p className="text-xs leading-relaxed text-zinc-200">{selected.summary}</p>
              ) : (
                <p className="text-xs text-zinc-400">
                  Click &ldquo;End &amp; Summarise&rdquo; above to generate an AI summary for this session.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {selected.actionItems.length === 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-[#101624] p-4 text-xs text-zinc-400">
                  No action items extracted yet. End &amp; Summarise the session to extract follow-ups.
                </div>
              ) : (
                selected.actionItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-[#101624] px-4 py-3 text-xs text-zinc-200"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span>{item}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
