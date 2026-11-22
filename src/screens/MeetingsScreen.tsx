import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Send,
  Shield,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";

import { ProviderLogo } from "../components/ProviderLogo";
import { EmptyState, LoadingState } from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import {
  isSpeechRecognitionSupported,
  startLocalVoiceRecognition,
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

export function MeetingsScreen() {
  const { showToast } = useAppStore();

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [selected, setSelected] = useState<MeetingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // New session form
  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState<"interview" | "meeting" | "standup" | "client_call">("interview");
  const [provider, setProvider] = useState("zoom");
  const [stealthEnabled, setStealthEnabled] = useState(true);
  const [hiddenOverlay, setHiddenOverlay] = useState(false);

  // Live background listening state
  const [isListening, setIsListening] = useState(false);
  const [liveCaption, setLiveCaption] = useState("");
  const [manualInput, setManualInput] = useState("");
  const voiceHandleRef = useRef<VoiceSessionHandle | null>(null);
  const lastSentFinalRef = useRef<string>("");

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
      voiceHandleRef.current?.cancel();
    };
  }, []);

  // Global panic-hide shortcut: Ctrl+Shift+H hides/restores the interface instantly
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
      if (stealthEnabled) {
        await syncNativeStealthMode(true);
      }
      showToast(
        "success",
        stealthEnabled
          ? "Stealth listening session created — hidden from screen share."
          : "Meeting session created."
      );
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
          ? "Stealth Protection ON — window excluded from Zoom/Meet/Teams screen share & taskbar."
          : "Stealth Mode ON — press Ctrl+Shift+H or click Hide App to listen invisibly in background."
        : "Stealth Mode OFF — window visible normally."
    );
  };

  const handleHideInBackground = async () => {
    const hiddenNatively = await hideNativeWindowToBackground();
    if (!hiddenNatively) {
      setHiddenOverlay(true);
    }
  };

  const sendTranscriptSegment = useCallback(
    async (meetingId: string, content: string, speaker = "Interviewer") => {
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
        // Silent in background mode
      }
    },
    []
  );

  const toggleBackgroundMic = () => {
    if (!selected) {
      showToast("info", "Start a session first to begin background listening.");
      return;
    }
    if (isListening) {
      voiceHandleRef.current?.stop();
      voiceHandleRef.current = null;
      setIsListening(false);
      setLiveCaption("");
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      showToast("error", "Browser microphone speech recognition is not available in this browser.");
      return;
    }

    const activeMeetingId = selected.id;
    lastSentFinalRef.current = "";
    setIsListening(true);
    voiceHandleRef.current = startLocalVoiceRecognition({
      language: "en-US",
      onInterim: (text: string) => setLiveCaption(text),
      onFinal: (fullText: string) => {
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
        showToast("error", `Mic error: ${msg}`);
        setIsListening(false);
      },
      onEnd: () => {
        setIsListening(false);
      },
    });
  };

  const handleStopAndSummarise = async () => {
    if (!selected) return;
    voiceHandleRef.current?.stop();
    voiceHandleRef.current = null;
    setIsListening(false);
    try {
      const res = await apiClient.stopMeeting(selected.id);
      setSelected(res.data.meeting);
      showToast("success", "Session ended and summarised.");
      await loadMeetings();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to summarise session.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteMeeting(id);
      showToast("info", "Meeting session deleted.");
      if (selected?.id === id) setSelected(null);
      await loadMeetings();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Delete failed.");
    }
  };

  // Full-screen Hidden / Stealth Cover Mode (for web browser when user clicks "Hide App")
  if (hiddenOverlay) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-end justify-end bg-[#080C14] p-4">
        <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#101624]/90 px-3 py-1.5 text-[11px] text-zinc-400">
          <span
            className={`h-2 w-2 rounded-full ${
              isListening ? "animate-pulse bg-emerald-400" : "bg-zinc-600"
            }`}
          />
          <span>{isListening ? "Listening silently in background" : "Hidden"}</span>
          <button
            type="button"
            onClick={() => setHiddenOverlay(false)}
            className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-0.5 text-[10px] font-medium text-white hover:bg-white/[0.15]"
          >
            <Eye className="h-3 w-3" /> Restore (Ctrl+Shift+H)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Stealth / Invisible Meeting & Interview Protection Control Banner */}
      <section className="nohby-frame p-4">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#00D4FF]/25 to-[#8B5CF6]/25 text-[#00D4FF]">
              <EyeOff className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-sm font-semibold text-white">
                  Stealth Meeting &amp; Interview Listener
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    stealthEnabled
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-zinc-500/15 text-zinc-400"
                  }`}
                >
                  {stealthEnabled ? "Hidden from Screen Share" : "Standard Visibility"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400">
                Listens silently in the background during Zoom, Google Meet, or Microsoft Teams interviews without appearing on screen share, taskbar, or meeting participant lists. Press <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white">Ctrl+Shift+H</kbd> anytime to hide instantly.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleToggleStealth}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
                stealthEnabled
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-white/[0.12] bg-[#101624] text-zinc-300 hover:border-[#00D4FF]/40"
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              {stealthEnabled ? "Stealth Active" : "Enable Stealth"}
            </button>

            <button
              type="button"
              onClick={handleHideInBackground}
              className="btn-ivory inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs"
            >
              <EyeOff className="h-3.5 w-3.5" />
              Hide App Now
            </button>
          </div>
        </div>
      </section>

      {/* Start New Background Listening Session */}
      <form
        onSubmit={handleStartSession}
        className="nohby-frame grid gap-2.5 p-3.5 sm:grid-cols-12"
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Session title (e.g. 'Technical System Design Interview' or 'Client Discovery Call')..."
          className="studio-input h-9 rounded-lg px-3 text-xs sm:col-span-5"
        />
        <select
          value={meetingType}
          onChange={(e) => setMeetingType(e.target.value as typeof meetingType)}
          className="studio-input h-9 rounded-lg px-3 text-xs sm:col-span-2"
        >
          <option value="interview">Interview</option>
          <option value="meeting">Meeting</option>
          <option value="standup">Standup</option>
          <option value="client_call">Client Call</option>
        </select>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="studio-input h-9 rounded-lg px-3 text-xs sm:col-span-3"
        >
          <option value="zoom">Zoom</option>
          <option value="google_meet">Google Meet</option>
          <option value="microsoft_teams">Microsoft Teams</option>
          <option value="local_audio">Local Microphone</option>
        </select>
        <button
          type="submit"
          disabled={creating}
          className="btn-ivory inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-xs sm:col-span-2"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Start Session
        </button>
      </form>

      {/* Main Split Workspace */}
      {loading && meetings.length === 0 ? (
        <LoadingState message="Loading meeting & interview sessions..." />
      ) : meetings.length === 0 ? (
        <EmptyState
          title="No meeting sessions yet"
          description="Create a stealth interview or meeting session above to capture live audio transcripts and private AI coaching hints."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Session List */}
          <div className="space-y-2 lg:col-span-4">
            {meetings.map((m) => {
              const active = selected?.id === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => selectMeeting(m.id)}
                  className={`cursor-pointer rounded-xl border p-3.5 transition ${
                    active
                      ? "nohby-frame"
                      : "border-white/[0.08] bg-[#101624] hover:border-white/[0.18]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ProviderLogo provider={m.provider} className="h-7 w-7 shrink-0 rounded-lg" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-white">{m.title}</p>
                        <p className="text-[10px] capitalize text-zinc-500">
                          {m.meetingType.replace("_", " ")} · {m.transcriptCount} segments
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(m.id);
                      }}
                      className="rounded p-1 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px]">
                    <span
                      className={`rounded-full px-2 py-0.5 capitalize ${
                        m.status === "listening"
                          ? "bg-[#00D4FF]/15 text-[#00D4FF]"
                          : "bg-emerald-500/15 text-emerald-400"
                      }`}
                    >
                      {m.status}
                    </span>
                    {m.stealthMode && (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <EyeOff className="h-3 w-3" /> Stealth
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live Transcript & Private AI Coaching Panel */}
          <div className="nohby-frame p-4 sm:p-5 lg:col-span-8">
            {selected ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-3.5">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-white">
                      {selected.title}
                    </h3>
                    <p className="mt-0.5 text-[11px] capitalize text-zinc-400">
                      {selected.meetingType.replace("_", " ")} · {selected.provider.replace("_", " ")} ·{" "}
                      {selected.stealthMode ? "Hidden Stealth Mode" : "Visible Mode"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selected.status !== "completed" && (
                      <>
                        <button
                          type="button"
                          onClick={toggleBackgroundMic}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition ${
                            isListening
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              : "btn-ivory"
                          }`}
                        >
                          {isListening ? (
                            <>
                              <MicOff className="h-3.5 w-3.5" /> Pause Mic
                            </>
                          ) : (
                            <>
                              <Mic className="h-3.5 w-3.5" /> Listen in Background
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleStopAndSummarise}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-[#161E30] px-3 text-xs text-zinc-200 hover:border-[#00D4FF]/50"
                        >
                          <Square className="h-3 w-3" /> End &amp; Summarise
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {liveCaption && (
                  <div className="rounded-lg border border-[#00D4FF]/35 bg-[#00D4FF]/10 px-3 py-2 text-xs italic text-[#00D4FF]">
                    Live audio: {liveCaption}
                  </div>
                )}

                {/* Summary (when completed) */}
                {selected.summary && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" /> Session Summary
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-200">{selected.summary}</p>
                    {selected.actionItems.length > 0 && (
                      <ul className="mt-2 space-y-1 text-[11px] text-zinc-300">
                        {selected.actionItems.map((ai, idx) => (
                          <li key={idx}>• {ai}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Manual question / note test bar */}
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
                      placeholder="Or type an interviewer question to get an instant private coaching hint..."
                      className="studio-input h-9 flex-1 rounded-lg px-3 text-xs"
                    />
                    <button
                      type="submit"
                      disabled={!manualInput.trim()}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-3 text-xs font-medium text-[#00D4FF] hover:bg-[#00D4FF]/20"
                    >
                      <Send className="h-3.5 w-3.5" /> Capture
                    </button>
                  </form>
                )}

                {/* Transcript & Private AI Coaching Stream */}
                <div className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
                  {(!selected.transcripts || selected.transcripts.length === 0) ? (
                    <p className="py-8 text-center text-xs text-zinc-500">
                      Click &ldquo;Listen in Background&rdquo; to transcribe audio silently and receive real-time private coaching hints.
                    </p>
                  ) : (
                    selected.transcripts.map((seg) => (
                      <div
                        key={seg.id}
                        className="rounded-xl border border-white/[0.08] bg-[#141B2D] p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between text-[10px] text-zinc-500">
                          <span className="font-semibold text-zinc-300">{seg.speaker}</span>
                          <span>{new Date(seg.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-xs text-white">{seg.content}</p>
                        {seg.aiHint && (
                          <div className="nohby-bubble-ai rounded-lg px-3 py-2 text-[11px] text-zinc-100">
                            <span className="mr-1.5 inline-flex items-center gap-1 font-semibold text-[#00D4FF]">
                              <Sparkles className="h-3 w-3" /> Private Hint:
                            </span>
                            {seg.aiHint}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                title="Select a session"
                description="Pick a meeting or interview session on the left to inspect transcripts and private hints."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
