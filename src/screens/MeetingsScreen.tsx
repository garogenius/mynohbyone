import { useCallback, useEffect, useRef, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  FileText,
  GripHorizontal,
  Headphones,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PictureInPicture2,
  Play,
  Plus,
  Radio,
  Save,
  Send,
  Shield,
  Square,
  Trash2,
  Volume2,
  X,
} from "lucide-react";

import { ApiError, apiClient } from "../lib/api";
import { cleanDisplayText, cleanFirstPersonAnswer } from "../lib/formatText";
import {
  isSpeechRecognitionSupported,
  speakText,
  startLocalVoiceRecognition,
  startMicLevelMonitor,
  stopSpeaking,
  type VoiceSessionHandle,
} from "../lib/voice";
import { useAppStore } from "../store/useAppStore";
import type { MeetingItem } from "../types/api";

interface ScheduledCalendarMeeting {
  id: string;
  title: string;
  scheduledAt: string;
  meetingUrl: string;
  provider: "Google Calendar" | "iCloud Calendar" | "Outlook Calendar";
  autoJoinAndRecord: boolean;
  notified?: boolean;
  autoStarted?: boolean;
}

interface SavedAudioClip {
  id: string;
  meetingId: string;
  title: string;
  url: string;
  mimeType: string;
  durationSec: number;
  createdAt: string;
  kind: "live_recording" | "neural_brief";
}

const CALENDAR_STORAGE_KEY = "nohbyone.meetings.calendarSchedule";
const NOTES_STORAGE_KEY = "nohbyone.meetings.savedNotes";

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

const WAVE_BARS = [
  8, 14, 10, 18, 12, 16, 8, 20, 13, 15, 10, 18, 11, 15, 9, 17, 12, 16, 10, 19, 12, 14, 9, 16,
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function MeetingsScreen() {
  const { user, currentDeviceId, voiceSettings, setRoute, showToast } = useAppStore();

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [selected, setSelected] = useState<MeetingItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState<"interview" | "meeting" | "standup" | "client_call">("interview");

  // Stealth Card Modal: ONLY displays when explicitly enabled by the user (false by default)
  const [showStealthCard, setShowStealthCard] = useState(false);
  const [stealthCardMinimized, setStealthCardMinimized] = useState(false);
  const [externalStealthActive, setExternalStealthActive] = useState(false);
  const stealthPopupRef = useRef<Window | null>(null);

  // Free 360-degree position & size state for the Stealth Card modal
  const [cardPos, setCardPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === "undefined") return { x: 260, y: 140 };
    return {
      x: Math.max(24, Math.round((window.innerWidth - 620) / 2)),
      y: Math.max(60, Math.round(window.innerHeight - 380)),
    };
  });
  const [cardSize, setCardSize] = useState<{ width: number; height: number }>({
    width: 620,
    height: 320,
  });
  const dragOriginRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const resizeOriginRef = useRef<{
    startX: number;
    startY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const [activeTab, setActiveTab] = useState<"transcript" | "notes" | "audio" | "calendar">(
    "transcript"
  );
  const [isListening, setIsListening] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("nohbyone.meetingMicOn") === "true";
    }
    return false;
  });
  const [liveCaption, setLiveCaption] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [pushingTasks, setPushingTasks] = useState(false);

  // Meeting Notes & Document Generator
  const [notesByMeeting, setNotesByMeeting] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  });
  const [savingNotes, setSavingNotes] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [generatedDocText, setGeneratedDocText] = useState<string | null>(null);
  const [generatedDocFilename, setGeneratedDocFilename] = useState<string>("");

  // Live Audio Recording & Neural Audio Export
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [savedAudioClips, setSavedAudioClips] = useState<SavedAudioClip[]>([]);
  const [convertingAudio, setConvertingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // Calendar Sync & Auto-Join
  const [calendarConnected, setCalendarConnected] = useState<boolean>(() => {
    return localStorage.getItem("nohbyone.meetings.calendarConnected") === "true";
  });
  const [calendarProvider, setCalendarProvider] = useState<
    "Google Calendar" | "iCloud Calendar" | "Outlook Calendar"
  >("Google Calendar");
  const [scheduledMeetings, setScheduledMeetings] = useState<ScheduledCalendarMeeting[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CALENDAR_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [calTitle, setCalTitle] = useState("");
  const [calDateTime, setCalDateTime] = useState(() => {
    const d = new Date(Date.now() + 3600 * 1000);
    return d.toISOString().slice(0, 16);
  });
  const [calUrl, setCalUrl] = useState("");
  const [calAutoJoin, setCalAutoJoin] = useState(true);

  const [waveLevels, setWaveLevels] = useState<number[]>(() => WAVE_BARS.map(() => 0.16));

  const voiceHandleRef = useRef<VoiceSessionHandle | null>(null);
  const stopMonitorRef = useRef<(() => void) | null>(null);
  const isListeningRef = useRef(false);
  const interimCommitTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const lastSentFinalRef = useRef<string>("");

  const currentNotes = selected ? notesByMeeting[selected.id] ?? selected.summary ?? "" : "";

  const updateCurrentNotes = (val: string) => {
    if (!selected) return;
    setNotesByMeeting((prev) => {
      const next = { ...prev, [selected.id]: val };
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const stopAudioCapture = useCallback((clearPersistence = true) => {
    isListeningRef.current = false;
    setIsListening(false);
    if (clearPersistence && typeof window !== "undefined") {
      sessionStorage.setItem("nohbyone.meetingMicOn", "false");
    }
    if (interimCommitTimerRef.current) {
      window.clearTimeout(interimCommitTimerRef.current);
      interimCommitTimerRef.current = null;
    }
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    voiceHandleRef.current?.cancel();
    voiceHandleRef.current = null;
    stopMonitorRef.current?.();
    stopMonitorRef.current = null;
    setWaveLevels(WAVE_BARS.map(() => 0.16));
    setLiveCaption("");
    window.dispatchEvent(new CustomEvent("nohby-manual-mic", { detail: { active: false } }));
  }, []);

  const stopLiveRecording = useCallback(() => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    setIsRecordingAudio(false);
  }, []);

  const startLiveRecording = useCallback(
    async (meetingObj: MeetingItem) => {
      if (isRecordingAudio || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;
        const startedTime = Date.now();
        setRecordingSeconds(0);
        setIsRecordingAudio(true);

        recordingTimerRef.current = window.setInterval(() => {
          setRecordingSeconds(Math.floor((Date.now() - startedTime) / 1000));
        }, 1000);

        recorder.ondataavailable = (evt) => {
          if (evt.data && evt.data.size > 0) {
            recordedChunksRef.current.push(evt.data);
          }
        };

        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const mimeType = recorder.mimeType || "audio/webm";
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          if (blob.size > 0) {
            const url = URL.createObjectURL(blob);
            const dur = Math.max(1, Math.round((Date.now() - startedTime) / 1000));
            const clip: SavedAudioClip = {
              id: `rec-${Date.now()}`,
              meetingId: meetingObj.id,
              title: `${meetingObj.title} — Session Recording`,
              url,
              mimeType,
              durationSec: dur,
              createdAt: new Date().toISOString(),
              kind: "live_recording",
            };
            setSavedAudioClips((prev) => [clip, ...prev]);
            showToast("success", "Meeting audio recording saved.");
          }
        };

        recorder.start(1000);
      } catch {
        showToast("error", "Microphone access is required to record session audio.");
      }
    },
    [isRecordingAudio, showToast]
  );

  const loadMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.listMeetings();
      setMeetings(res.data.meetings);
      if (res.data.meetings.length > 0 && !selected) {
        const detail = await apiClient.getMeeting(res.data.meetings[0].id);
        setSelected(detail.data.meeting);
      }
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to load meetings.");
    } finally {
      setLoading(false);
    }
  }, [selected, showToast]);

  useEffect(() => {
    loadMeetings();
    return () => {
      stopAudioCapture(false);
      stopLiveRecording();
      syncNativeStealthMode(false);
    };
  }, [loadMeetings, stopAudioCapture, stopLiveRecording]);

  const sendTranscriptSegment = useCallback(
    async (meetingId: string, text: string, speaker = "Interviewer") => {
      const clean = text.trim();
      if (!clean) return;
      try {
        const res = await apiClient.appendMeetingTranscript(meetingId, {
          speaker,
          content: clean,
        });
        setSelected((prev) => {
          if (!prev || prev.id !== meetingId) return prev;
          const existing = prev.transcripts || [];
          return {
            ...prev,
            transcriptCount: prev.transcriptCount + 1,
            transcripts: [...existing, res.data.transcript],
          };
        });
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
              sendTranscriptSegment(activeMeetingId, pendingDelta, "Interviewer");
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
            sendTranscriptSegment(activeMeetingId, delta, "Interviewer");
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

  const activateListeningOnMeeting = useCallback(
    (meetingObj: MeetingItem, alsoRecordAudio = false) => {
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

      startMicLevelMonitor((levels) => {
        setWaveLevels(levels);
      }, WAVE_BARS.length).then((stopFn) => {
        stopMonitorRef.current = stopFn;
      });

      startMeetingRecognitionLoop(meetingObj.id);
      if (alsoRecordAudio) {
        void startLiveRecording(meetingObj);
      }
    },
    [showToast, startLiveRecording, startMeetingRecognitionLoop]
  );

  // Resume persistent mic if user left it On
  const resumedOnceRef = useRef(false);
  useEffect(() => {
    if (resumedOnceRef.current || !selected || selected.status === "completed") return;
    if (isListening) {
      resumedOnceRef.current = true;
      activateListeningOnMeeting(selected, false);
    }
  }, [activateListeningOnMeeting, isListening, selected]);

  // Calendar Watcher: checks every 12s for upcoming scheduled meetings & auto-joins/records
  useEffect(() => {
    if (scheduledMeetings.length === 0) return;

    const timer = window.setInterval(async () => {
      const nowMs = Date.now();
      let changed = false;
      const updatedList = [...scheduledMeetings];

      for (let i = 0; i < updatedList.length; i++) {
        const item = updatedList[i];
        const targetMs = new Date(item.scheduledAt).getTime();
        if (Number.isNaN(targetMs)) continue;

        const diffMs = targetMs - nowMs;
        if (diffMs <= 60_000 && diffMs >= -600_000 && !item.notified) {
          item.notified = true;
          changed = true;

          showToast("info", `Meeting Time Now: "${item.title}"`);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(`NohbyAI Meeting Alert: ${item.title}`, {
              body: item.autoJoinAndRecord
                ? "Auto-joining, recording, and taking notes for your meeting now."
                : "Your scheduled meeting is starting now.",
              icon: "/icon-white.png",
            });
          }

          if (item.autoJoinAndRecord && !item.autoStarted) {
            item.autoStarted = true;
            if (item.meetingUrl && /^https?:\/\//i.test(item.meetingUrl)) {
              window.open(item.meetingUrl, "_blank", "noopener,noreferrer");
            }
            try {
              const res = await apiClient.createMeeting({
                title: item.title,
                meetingType: "meeting",
                provider: "local_audio",
                stealthMode: true,
              });
              setSelected(res.data.meeting);
              setMeetings((prev) => [res.data.meeting, ...prev]);
              activateListeningOnMeeting(res.data.meeting, true);
            } catch {
              // Ignore
            }
          }
        }
      }

      if (changed) {
        setScheduledMeetings(updatedList);
        localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(updatedList));
      }
    }, 12000);

    return () => window.clearInterval(timer);
  }, [activateListeningOnMeeting, scheduledMeetings, showToast]);

  const handleSelectMeeting = async (id: string) => {
    stopAudioCapture(true);
    stopLiveRecording();
    setGeneratedDocText(null);
    try {
      const res = await apiClient.getMeeting(id);
      setSelected(res.data.meeting);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to load session.");
    }
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const sessionTitle = title.trim() || "New Meeting Session";
    setStarting(true);
    stopAudioCapture(true);
    try {
      const res = await apiClient.createMeeting({
        title: sessionTitle,
        meetingType,
        provider: "local_audio",
        stealthMode: true,
      });
      setTitle("");
      setShowNewSessionForm(false);
      setSelected(res.data.meeting);
      await loadMeetings();
      showToast("success", "Session created.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to start session.");
    } finally {
      setStarting(false);
    }
  };

  const handleToggleStealthCard = async () => {
    const next = !showStealthCard;
    setShowStealthCard(next);
    setStealthCardMinimized(false);
    await syncNativeStealthMode(next);
    if (selected) {
      apiClient.toggleMeetingStealth(selected.id, next).catch(() => null);
    }
  };

  const toggleBackgroundMic = () => {
    if (!selected) {
      showToast("info", "Select or create a session first.");
      return;
    }
    if (isListening) {
      stopAudioCapture(true);
      return;
    }
    activateListeningOnMeeting(selected, false);
  };

  const handleStopAndSummarise = async () => {
    if (!selected) return;
    stopAudioCapture(true);
    stopLiveRecording();
    setActionsMenuOpen(false);
    try {
      const res = await apiClient.stopMeeting(selected.id);
      setSelected(res.data.meeting);
      setActiveTab("notes");
      showToast("success", "Session completed and key points extracted.");
      await loadMeetings();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to summarise.");
    }
  };

  const handleDeleteSegment = async (segmentId: string) => {
    if (!selected) return;
    try {
      const res = await apiClient.deleteMeetingTranscript(selected.id, segmentId);
      setSelected(res.data.meeting);
      showToast("info", "Transcript entry deleted.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to delete entry.");
    }
  };

  const handleSaveNotes = async () => {
    if (!selected || savingNotes) return;
    setSavingNotes(true);
    try {
      const res = await apiClient.updateMeeting(selected.id, {
        summary: currentNotes,
      });
      setSelected(res.data.meeting);
      showToast("success", "Meeting notes saved.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to save meeting notes.");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDownloadTranscript = () => {
    if (!selected) return;
    setActionsMenuOpen(false);
    const lines = [
      `MEETING TRANSCRIPT: ${selected.title}`,
      `Date: ${new Date(selected.startedAt).toLocaleString()}`,
      `Type: ${selected.meetingType.toUpperCase()}`,
      "",
      ...(selected.transcripts || []).flatMap((seg, i) => [
        `${i + 1}. [${seg.speaker}] (${new Date(seg.createdAt).toLocaleTimeString()}):`,
        `   ${cleanDisplayText(seg.content)}`,
        ...(seg.aiHint ? [`   Suggested Answer: ${cleanFirstPersonAnswer(seg.aiHint)}`] : []),
        "",
      ]),
    ];
    if (currentNotes) {
      lines.push("MEETING NOTES:", currentNotes);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `${selected.title.replace(/\s+/g, "-")}-Transcript.txt`);
    showToast("success", "Transcript downloaded.");
  };

  const handleGenerateDocument = async () => {
    if (!selected || generatingDoc) return;
    setGeneratingDoc(true);
    setActionsMenuOpen(false);
    try {
      const res = await apiClient.generateMeetingDocument(selected.id, {
        notes: currentNotes,
      });
      setGeneratedDocText(res.data.documentText);
      setGeneratedDocFilename(res.data.filename);
      setActiveTab("notes");
      const blob = new Blob([res.data.documentText], { type: "text/markdown;charset=utf-8" });
      downloadBlob(blob, res.data.filename);
      showToast("success", `Document saved to Library & downloaded (${res.data.filename}).`);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to generate document.");
    } finally {
      setGeneratingDoc(false);
    }
  };

  const handleConvertMeetingToAudioAndExport = async () => {
    if (!selected || convertingAudio) return;
    setConvertingAudio(true);
    setActionsMenuOpen(false);
    try {
      const res = await apiClient.exportMeetingAudio(selected.id, {
        notes: currentNotes,
        voiceType: voiceSettings?.voiceType || "female",
        language: voiceSettings?.inputLanguage || "en-US",
      });
      const speech = res.data.audio;
      if (speech.audioBase64) {
        const mime = speech.mimeType || "audio/mpeg";
        const byteChars = atob(speech.audioBase64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: mime });
        const url = URL.createObjectURL(blob);

        const clip: SavedAudioClip = {
          id: `neural-${Date.now()}`,
          meetingId: selected.id,
          title: `${selected.title} — Audio Brief`,
          url,
          mimeType: mime,
          durationSec: Math.max(8, Math.round(res.data.narrationText.length / 14)),
          createdAt: new Date().toISOString(),
          kind: "neural_brief",
        };
        setSavedAudioClips((prev) => [clip, ...prev]);
        downloadBlob(blob, res.data.filename);
        setActiveTab("audio");
        showToast("success", `Audio exported (${res.data.filename}).`);
      } else {
        speakText(res.data.narrationText, {
          language: voiceSettings?.inputLanguage || "en-US",
          voiceType: voiceSettings?.voiceType || "female",
        });
        showToast("info", "Playing meeting audio briefing.");
      }
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to convert meeting to audio.");
    } finally {
      setConvertingAudio(false);
    }
  };

  const handleSaveRecordingToLibrary = async (clip: SavedAudioClip) => {
    try {
      const resp = await fetch(clip.url);
      const blob = await resp.blob();
      const textSummary = [
        `MEETING AUDIO ARCHIVE: ${clip.title}`,
        `Recorded At: ${clip.createdAt}`,
        `Duration: ${clip.durationSec}s | Format: ${clip.mimeType}`,
        `Size: ${blob.size} bytes`,
        "",
        `Notes: ${currentNotes || selected?.summary || "Audio recording archived from Meetings."}`,
      ].join("\n");
      const summaryFile = new File(
        [textSummary],
        `${clip.title.replace(/[^a-zA-Z0-9_-]+/g, "-")}-Audio-Archive.md`,
        { type: "text/markdown" }
      );
      await apiClient.uploadFile(summaryFile);
      showToast("success", "Audio recording saved to Library.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to save to Library.");
    }
  };

  const handleConnectCalendar = async () => {
    try {
      const providerKey =
        calendarProvider === "Google Calendar"
          ? "google_calendar"
          : calendarProvider === "iCloud Calendar"
            ? "icloud_calendar"
            : "google_calendar";
      await apiClient
        .connectIntegration(providerKey, {
          accountLabel: user?.email || "Primary Calendar",
          scopes: ["calendar.read", "calendar.events", "meetings.auto_join"],
        })
        .catch(() => null);
      setCalendarConnected(true);
      localStorage.setItem("nohbyone.meetings.calendarConnected", "true");
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      showToast("success", `${calendarProvider} connected.`);
    } catch {
      setCalendarConnected(true);
      localStorage.setItem("nohbyone.meetings.calendarConnected", "true");
    }
  };

  const handleScheduleCalendarMeeting = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = calTitle.trim();
    if (!cleanTitle || !calDateTime) return;
    const item: ScheduledCalendarMeeting = {
      id: `cal-${Date.now()}`,
      title: cleanTitle,
      scheduledAt: calDateTime,
      meetingUrl: calUrl.trim(),
      provider: calendarProvider,
      autoJoinAndRecord: calAutoJoin,
    };
    const next = [item, ...scheduledMeetings];
    setScheduledMeetings(next);
    localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(next));
    setCalTitle("");
    setCalUrl("");
    showToast("success", `Saved "${cleanTitle}" to calendar.`);
  };

  const handleDeleteCalendarMeeting = (id: string) => {
    const next = scheduledMeetings.filter((m) => m.id !== id);
    setScheduledMeetings(next);
    localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(next));
    showToast("info", "Calendar meeting removed.");
  };

  const handleTriggerScheduledMeetingNow = async (item: ScheduledCalendarMeeting) => {
    if (item.meetingUrl && /^https?:\/\//i.test(item.meetingUrl)) {
      window.open(item.meetingUrl, "_blank", "noopener,noreferrer");
    }
    try {
      const res = await apiClient.createMeeting({
        title: item.title,
        meetingType: "meeting",
        provider: "local_audio",
        stealthMode: true,
      });
      setSelected(res.data.meeting);
      setMeetings((prev) => [res.data.meeting, ...prev]);
      setActiveTab("transcript");
      activateListeningOnMeeting(res.data.meeting, item.autoJoinAndRecord);
      showToast("success", `Started "${item.title}".`);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to start meeting.");
    }
  };

  const handlePushActionsToTasks = async () => {
    if (!selected || pushingTasks) return;
    setActionsMenuOpen(false);
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
      showToast("success", `Added ${Math.min(items.length, 3)} action item(s) to Tasks.`);
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
      showToast("info", "Session deleted.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Delete failed.");
    }
  };

  const latestSegment =
    selected?.transcripts && selected.transcripts.length > 0
      ? selected.transcripts[selected.transcripts.length - 1]
      : null;

  // Sync External Screen-Share-Invisible Floating Stealth Card Window & Device Overlay
  const syncExternalStealthCard = useCallback(() => {
    // 1. Sync unified device background overlay
    window.dispatchEvent(
      new CustomEvent("nohby-meeting-stealth-sync", {
        detail: {
          meetingId: selected?.id,
          meetingTitle: selected?.title,
          isListening,
          question: liveCaption || (latestSegment ? cleanDisplayText(latestSegment.content) : ""),
          answer: latestSegment?.aiHint ? cleanFirstPersonAnswer(latestSegment.aiHint) : "",
          autoSwitchToMeeting: Boolean(liveCaption || latestSegment?.aiHint),
        },
      })
    );

    const win = stealthPopupRef.current;
    if (!win || win.closed) return;
    const doc = win.document;
    const qEl = doc.getElementById("stealth-caught-q");
    const aEl = doc.getElementById("stealth-first-person-a");
    const statusEl = doc.getElementById("stealth-live-badge");

    if (statusEl) {
      statusEl.textContent = isListening
        ? "LISTENING • SCREEN-SHARE PROTECTED"
        : "STANDBY • SCREEN-SHARE PROTECTED";
    }
    if (qEl) {
      qEl.textContent =
        liveCaption ||
        (latestSegment
          ? cleanDisplayText(latestSegment.content)
          : "Waiting for question...");
    }
    if (aEl) {
      aEl.textContent = latestSegment?.aiHint
        ? cleanFirstPersonAnswer(latestSegment.aiHint)
        : "Your first-person response will appear here when a question is detected.";
    }
  }, [isListening, latestSegment, liveCaption, selected]);

  useEffect(() => {
    syncExternalStealthCard();
  }, [syncExternalStealthCard]);

  useEffect(() => {
    const onToggleMeetingMic = () => {
      toggleBackgroundMic();
    };
    window.addEventListener("nohby-toggle-meeting-mic", onToggleMeetingMic);
    return () => {
      window.removeEventListener("nohby-toggle-meeting-mic", onToggleMeetingMic);
    };
  }, [toggleBackgroundMic]);

  const toggleExternalStealthCardWindow = async () => {
    setActionsMenuOpen(false);
    await syncNativeStealthMode(true);

    // Launch or switch unified device desktop overlay to meeting stealth mode
    window.dispatchEvent(
      new CustomEvent("nohby-launch-device-overlay", {
        detail: { mode: "meeting" },
      })
    );
    setExternalStealthActive(true);
    showToast(
      "success",
      "Meeting stealth card floating on device background (Invisible in Screen Share)."
    );
  };

  // Free 360° pointer dragging handlers for Stealth Card Modal
  const handleCardPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Don't start drag when clicking buttons inside the header
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOriginRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: cardPos.x,
      origY: cardPos.y,
    };
  };

  const handleCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOriginRef.current) return;
    const dx = e.clientX - dragOriginRef.current.startX;
    const dy = e.clientY - dragOriginRef.current.startY;
    const maxW = typeof window !== "undefined" ? window.innerWidth - 120 : 1400;
    const maxH = typeof window !== "undefined" ? window.innerHeight - 60 : 900;
    setCardPos({
      x: Math.max(8, Math.min(maxW, dragOriginRef.current.origX + dx)),
      y: Math.max(8, Math.min(maxH, dragOriginRef.current.origY + dy)),
    });
  };

  const handleCardPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOriginRef.current) return;
    dragOriginRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  // Corner resize pointer handlers
  const handleResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeOriginRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origW: cardSize.width,
      origH: cardSize.height,
    };
  };

  const handleResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeOriginRef.current) return;
    const dx = e.clientX - resizeOriginRef.current.startX;
    const dy = e.clientY - resizeOriginRef.current.startY;
    setCardSize({
      width: Math.max(380, Math.min(960, resizeOriginRef.current.origW + dx)),
      height: Math.max(230, Math.min(720, resizeOriginRef.current.origH + dy)),
    });
  };

  const handleResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeOriginRef.current) return;
    resizeOriginRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-5.5rem)] w-full flex-col gap-4 lg:h-[calc(100vh-5.25rem)] lg:flex-row lg:overflow-hidden">
      {/* ============================================================
          LEFT SIDEBAR: Standard Split-Pane Sessions List
          (Matches Scheduled Tasks clean layout)
          ============================================================ */}
      {leftSidebarOpen && (
        <aside className="flex w-full shrink-0 flex-col border-b border-white/[0.08] pb-4 lg:h-full lg:w-64 lg:border-b-0 lg:border-r lg:pr-4 lg:pb-0">
          <div className="flex items-center justify-between px-2 py-1.5">
            <h2 className="font-display text-sm font-semibold text-white">Meetings</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowNewSessionForm((v) => !v)}
                title="New session"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setLeftSidebarOpen(false)}
                title="Hide Meetings sidebar"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* + New session button */}
          <button
            type="button"
            onClick={() => setShowNewSessionForm((v) => !v)}
            className="mt-1 flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-white transition hover:bg-white/[0.06]"
          >
            <Plus className="h-4 w-4 text-zinc-300" />
            <span>New session</span>
          </button>

          {showNewSessionForm && (
            <form
              onSubmit={handleStartSession}
              className="mt-2 space-y-2 rounded-xl border border-white/[0.08] bg-[#101624] p-2.5"
            >
              <input
                type="text"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Session title..."
                className="studio-input h-8 w-full rounded-lg px-2.5 text-xs"
              />
              <div className="flex items-center gap-1.5">
                <select
                  value={meetingType}
                  onChange={(e) => setMeetingType(e.target.value as typeof meetingType)}
                  className="studio-input h-8 flex-1 rounded-lg px-2 text-xs"
                >
                  <option value="interview">Interview</option>
                  <option value="meeting">Meeting</option>
                  <option value="standup">Standup</option>
                  <option value="client_call">Client Call</option>
                </select>
                <button
                  type="submit"
                  disabled={starting}
                  className="btn-ivory inline-flex h-8 items-center rounded-lg px-3 text-xs"
                >
                  {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Start"}
                </button>
              </div>
            </form>
          )}

          {/* Sessions List */}
          <div className="mt-3 flex-1 overflow-y-auto px-1">
            <p className="px-1.5 text-[11px] font-medium text-zinc-400">
              Sessions ({meetings.length})
            </p>
            <div className="mt-1.5 space-y-1">
              {loading ? (
                <div className="flex items-center gap-2 px-2 py-4 text-xs text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
                  Loading...
                </div>
              ) : meetings.length === 0 ? (
                <div className="px-2 py-3 text-xs text-zinc-500">No sessions yet</div>
              ) : (
                meetings.map((m) => {
                  const isSelected = selected?.id === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => handleSelectMeeting(m.id)}
                      className={`group flex cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition ${
                        isSelected ? "bg-white/[0.08] text-white" : "text-zinc-300 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-white">{m.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                          {new Date(m.startedAt).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          · {m.meetingType.replace("_", " ")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(m.id);
                        }}
                        className="rounded p-1 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-400"
                        title="Delete session"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </aside>
      )}

      {/* ============================================================
          RIGHT MAIN STAGE: Clean Standard Meeting Workspace
          ============================================================ */}
      <section className="flex flex-1 flex-col overflow-hidden">
        {!leftSidebarOpen && (
          <div className="mb-2 flex items-center">
            <button
              type="button"
              onClick={() => setLeftSidebarOpen(true)}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#141B2D]/80 px-2.5 text-[11px] font-medium text-zinc-300 hover:text-white"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
              <span>Sessions</span>
            </button>
          </div>
        )}

        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-white/[0.08] bg-[#101624] p-8 text-center">
            <h2 className="font-display text-base font-semibold text-white">
              Select or start a meeting session
            </h2>
            <p className="mt-1 max-w-md text-xs text-zinc-400">
              Capture live questions, record session audio, save meeting notes, and generate structured documents.
            </p>
            <button
              type="button"
              onClick={() => setShowNewSessionForm(true)}
              className="btn-ivory mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg px-4 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Start New Session
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101624]">
            {/* Clean Standard Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-3.5">
              <div className="min-w-0">
                <h1 className="font-display truncate text-base font-semibold text-white">
                  {selected.title}
                </h1>
                <p className="mt-0.5 text-xs text-zinc-400 capitalize">
                  {selected.meetingType.replace("_", " ")} ·{" "}
                  {new Date(selected.startedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {selected.transcriptCount} segment{selected.transcriptCount === 1 ? "" : "s"}
                </p>
              </div>

              {/* Standard Control Bar */}
              <div className="flex flex-wrap items-center gap-2">
                {/* 1. Microphone Listen + Compact Sound Equalizer */}
                <div className="flex items-center gap-2 rounded-lg border border-white/[0.1] bg-[#151C2C] px-2.5 py-1">
                  <button
                    type="button"
                    onClick={toggleBackgroundMic}
                    disabled={selected.status === "completed"}
                    className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition ${
                      isListening
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-white/[0.08] text-white hover:bg-white/[0.14]"
                    }`}
                  >
                    {isListening ? (
                      <>
                        <MicOff className="h-3 w-3" />
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <Mic className="h-3 w-3" />
                        <span>Listen</span>
                      </>
                    )}
                  </button>
                  <div className="flex h-4 w-24 items-center gap-0.5 overflow-hidden">
                    {WAVE_BARS.slice(0, 16).map((baseH, i) => {
                      const level = waveLevels[i] ?? 0.16;
                      const h = isListening
                        ? Math.max(3, Math.min(16, Math.round(3 + level * 14)))
                        : Math.max(3, Math.round(baseH * 0.45));
                      return (
                        <span
                          key={i}
                          style={{ height: `${h}px` }}
                          className={`w-1 flex-1 rounded-full transition-all duration-75 ${
                            isListening ? "bg-[#00D4FF]" : "bg-zinc-600/50"
                          }`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* 2. Audio Record Toggle */}
                <button
                  type="button"
                  onClick={() =>
                    isRecordingAudio ? stopLiveRecording() : startLiveRecording(selected)
                  }
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
                    isRecordingAudio
                      ? "border-rose-500/45 bg-rose-500/15 text-rose-600 dark:text-rose-300"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 dark:border-white/[0.1] dark:bg-[#151C2C] dark:text-zinc-200 dark:hover:text-white"
                  }`}
                >
                  <Radio
                    className={`h-3 w-3 ${isRecordingAudio ? "animate-pulse text-rose-500 dark:text-rose-400" : "text-zinc-500 dark:text-zinc-400"}`}
                  />
                  <span>
                    {isRecordingAudio
                      ? `${Math.floor(recordingSeconds / 60)}:${String(
                          recordingSeconds % 60
                        ).padStart(2, "0")}`
                      : "Record"}
                  </span>
                </button>

                {/* 3. Stealth Card Toggle (Off by default — only opens modal when enabled) */}
                <button
                  type="button"
                  onClick={handleToggleStealthCard}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
                    showStealthCard
                      ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:border-white/25 dark:bg-white dark:text-zinc-950"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950 dark:border-white/[0.1] dark:bg-[#151C2C] dark:text-zinc-300 dark:hover:text-white"
                  }`}
                  title="Enable or hide the movable Stealth Answer Card"
                >
                  <Shield className="h-3.5 w-3.5" />
                  <span>Stealth Card: {showStealthCard ? "On" : "Off"}</span>
                </button>

                {/* 4. Standard Actions Dropdown Menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setActionsMenuOpen((v) => !v)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 hover:text-zinc-950 dark:border-white/[0.1] dark:bg-[#151C2C] dark:text-zinc-200 dark:hover:text-white"
                  >
                    <span>Actions</span>
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                  </button>

                  {actionsMenuOpen && (
                    <div className="dropdown-surface absolute right-0 top-full z-30 mt-1.5 w-60 rounded-xl border border-white/[0.1] p-1.5 shadow-2xl">
                      <button
                        type="button"
                        disabled={generatingDoc}
                        onClick={handleGenerateDocument}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      >
                        <FileText className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Extract Key Points &amp; Generate Doc</span>
                      </button>
                      <button
                        type="button"
                        disabled={convertingAudio}
                        onClick={handleConvertMeetingToAudioAndExport}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      >
                        <Headphones className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Convert to Audio &amp; Export</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadTranscript}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      >
                        <Download className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Save Transcript (.txt)</span>
                      </button>
                      <button
                        type="button"
                        onClick={toggleExternalStealthCardWindow}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      >
                        <PictureInPicture2 className="h-3.5 w-3.5 text-zinc-400" />
                        <span>
                          {externalStealthActive
                            ? "Close External Background Card"
                            : "Float Card on Device Background"}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={pushingTasks}
                        onClick={handlePushActionsToTasks}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-zinc-200 hover:bg-white/[0.06]"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Send Action Items to Tasks</span>
                      </button>
                      {selected.status !== "completed" && (
                        <button
                          type="button"
                          onClick={handleStopAndSummarise}
                          className="mt-1 flex w-full items-center gap-2 border-t border-white/[0.06] px-2.5 pt-2 pb-1.5 text-left text-xs text-rose-400 hover:bg-rose-500/10"
                        >
                          <Square className="h-3.5 w-3.5" />
                          <span>End &amp; Summarise Session</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Clean Standard Underline Tabs */}
            <div className="flex items-center gap-6 border-b border-white/[0.08] px-5">
              {(
                [
                  { id: "transcript", label: "Transcript & Answers" },
                  { id: "notes", label: "Notes & Document" },
                  { id: "audio", label: `Audio (${savedAudioClips.length})` },
                  { id: "calendar", label: `Calendar (${scheduledMeetings.length})` },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`border-b-2 py-2.5 text-xs font-medium transition ${
                    activeTab === t.id
                      ? "border-white text-white"
                      : "border-transparent text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Main Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* TAB 1: TRANSCRIPT & ANSWERS */}
              {activeTab === "transcript" && (
                <div className="mx-auto max-w-3xl space-y-3">
                  {liveCaption && (
                    <div className="rounded-xl border border-white/[0.1] bg-[#151C2C] px-4 py-2.5 text-xs text-zinc-300">
                      Listening: &ldquo;{liveCaption}&rdquo;
                    </div>
                  )}

                  {!selected.transcripts || selected.transcripts.length === 0 ? (
                    <div className="rounded-xl border border-zinc-200/80 bg-zinc-50 px-5 py-10 text-center dark:border-white/[0.06] dark:bg-[#131926]">
                      <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">No transcript segments yet</p>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Click Listen above or type a question below. NohbyAI will generate a direct first-person response based on your experience.
                      </p>
                    </div>
                  ) : (
                    selected.transcripts.map((seg) => (
                      <div
                        key={seg.id}
                        className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs dark:border-white/[0.07] dark:bg-[#131926]"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-200">{seg.speaker}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-zinc-500">
                              {new Date(seg.createdAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteSegment(seg.id)}
                              className="rounded p-1 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400"
                              title="Delete entry"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        <p className="mt-1.5 text-xs leading-relaxed text-zinc-200">
                          {cleanDisplayText(seg.content)}
                        </p>

                        {seg.aiHint && (
                          <div className="mt-3 border-t border-white/[0.06] pt-3">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium text-zinc-400">
                                Suggested Response (First Person)
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard
                                      .writeText(cleanFirstPersonAnswer(seg.aiHint))
                                      .then(() => showToast("info", "Copied."))
                                      .catch(() => null);
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white"
                                >
                                  <Copy className="h-3 w-3" /> Copy
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    speakText(cleanFirstPersonAnswer(seg.aiHint), {
                                      language: voiceSettings?.inputLanguage || "en-US",
                                      voiceType: voiceSettings?.voiceType || "female",
                                    })
                                  }
                                  className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-white"
                                >
                                  <Volume2 className="h-3 w-3" /> Speak
                                </button>
                              </div>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-white">
                              {cleanFirstPersonAnswer(seg.aiHint)}
                            </p>
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {selected.status !== "completed" && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!manualInput.trim()) return;
                        sendTranscriptSegment(selected.id, manualInput.trim(), "Interviewer");
                        setManualInput("");
                      }}
                      className="flex items-center gap-2 pt-2"
                    >
                      <input
                        type="text"
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        placeholder="Add a question or transcript line..."
                        className="studio-input h-9 flex-1 rounded-lg px-3 text-xs"
                      />
                      <button
                        type="submit"
                        disabled={!manualInput.trim()}
                        className="btn-ivory inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs"
                      >
                        <Send className="h-3.5 w-3.5" /> Add
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* TAB 2: NOTES & DOCUMENT */}
              {activeTab === "notes" && (
                <div className="mx-auto max-w-3xl space-y-4">
                  <div className="rounded-xl border border-white/[0.08] bg-[#131926] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-white">Meeting Notes</h3>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateCurrentNotes("")}
                          className="h-7 rounded-lg border border-white/[0.08] px-2.5 text-[11px] text-zinc-400 hover:text-rose-400"
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          disabled={savingNotes}
                          onClick={handleSaveNotes}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.12] bg-[#182032] px-3 text-[11px] font-medium text-white"
                        >
                          {savingNotes ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Save className="h-3 w-3" />
                          )}
                          Save Notes
                        </button>
                        <button
                          type="button"
                          disabled={generatingDoc}
                          onClick={handleGenerateDocument}
                          className="btn-ivory inline-flex h-7 items-center gap-1 rounded-lg px-3 text-[11px]"
                        >
                          {generatingDoc ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                          Generate Document
                        </button>
                      </div>
                    </div>
                    <textarea
                      rows={8}
                      value={currentNotes}
                      onChange={(e) => updateCurrentNotes(e.target.value)}
                      placeholder="Write meeting notes or key decisions here..."
                      className="studio-input mt-3 w-full rounded-lg p-3 text-xs leading-relaxed"
                    />
                  </div>

                  {generatedDocText && (
                    <div className="rounded-xl border border-white/[0.08] bg-[#131926] p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">
                          Generated Document ({generatedDocFilename})
                        </span>
                        <button
                          type="button"
                          onClick={() => setRoute("files")}
                          className="text-xs text-zinc-300 underline hover:text-white"
                        >
                          View in Library
                        </button>
                      </div>
                      <pre className="mt-2.5 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-[#0D121C] p-3 font-sans text-xs leading-relaxed text-zinc-200">
                        {generatedDocText}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: AUDIO & RECORDINGS */}
              {activeTab === "audio" && (
                <div className="mx-auto max-w-3xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#131926] p-4">
                    <div>
                      <h3 className="text-xs font-semibold text-white">Audio Recordings &amp; Exports</h3>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        Record live session audio or convert this meeting into an audio file.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          isRecordingAudio ? stopLiveRecording() : startLiveRecording(selected)
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#182032] px-3 text-xs text-white"
                      >
                        <Radio className="h-3.5 w-3.5 text-rose-400" />
                        {isRecordingAudio ? "Stop Recording" : "Record Session"}
                      </button>
                      <button
                        type="button"
                        disabled={convertingAudio}
                        onClick={handleConvertMeetingToAudioAndExport}
                        className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs"
                      >
                        {convertingAudio ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Headphones className="h-3.5 w-3.5" />
                        )}
                        Export Audio
                      </button>
                    </div>
                  </div>

                  {savedAudioClips.length === 0 ? (
                    <div className="rounded-xl border border-white/[0.06] bg-[#131926] py-10 text-center text-xs text-zinc-500">
                      No audio files recorded or exported yet.
                    </div>
                  ) : (
                    savedAudioClips.map((clip) => (
                      <div
                        key={clip.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#131926] px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-white">{clip.title}</p>
                          <p className="text-[11px] text-zinc-500">
                            {new Date(clip.createdAt).toLocaleTimeString()}
                          </p>
                        </div>
                        <audio controls src={clip.url} className="h-8 max-w-[240px]" />
                        <div className="flex items-center gap-1.5">
                          <a
                            href={clip.url}
                            download={`${clip.title.replace(/\s+/g, "-")}.${
                              clip.mimeType.includes("wav")
                                ? "wav"
                                : clip.mimeType.includes("webm")
                                  ? "webm"
                                  : "mp3"
                            }`}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.1] px-2.5 text-[11px] text-zinc-200 hover:bg-white/[0.06]"
                          >
                            <Download className="h-3 w-3" /> Download
                          </a>
                          <button
                            type="button"
                            onClick={() => handleSaveRecordingToLibrary(clip)}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.1] px-2.5 text-[11px] text-zinc-200 hover:bg-white/[0.06]"
                          >
                            <Save className="h-3 w-3" /> Save to Library
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setSavedAudioClips((prev) => prev.filter((c) => c.id !== clip.id))
                            }
                            className="rounded-lg p-1.5 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 4: CALENDAR & AUTO-JOIN */}
              {activeTab === "calendar" && (
                <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.08] bg-[#131926] p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-white">Calendar Integration</h3>
                      <span className="text-[11px] text-zinc-400">
                        {calendarConnected ? "Connected" : "Not connected"}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <select
                        value={calendarProvider}
                        onChange={(e) =>
                          setCalendarProvider(e.target.value as typeof calendarProvider)
                        }
                        className="studio-input h-8 flex-1 rounded-lg px-2.5 text-xs"
                      >
                        <option value="Google Calendar">Google Calendar</option>
                        <option value="iCloud Calendar">iCloud Calendar</option>
                        <option value="Outlook Calendar">Outlook Calendar</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleConnectCalendar}
                        className="inline-flex h-8 items-center rounded-lg border border-white/[0.12] bg-[#182032] px-3 text-xs font-medium text-white"
                      >
                        {calendarConnected ? "Sync" : "Connect"}
                      </button>
                    </div>

                    <form onSubmit={handleScheduleCalendarMeeting} className="mt-4 space-y-2.5">
                      <input
                        type="text"
                        required
                        value={calTitle}
                        onChange={(e) => setCalTitle(e.target.value)}
                        placeholder="Meeting title..."
                        className="studio-input h-8 w-full rounded-lg px-2.5 text-xs"
                      />
                      <input
                        type="datetime-local"
                        required
                        value={calDateTime}
                        onChange={(e) => setCalDateTime(e.target.value)}
                        className="studio-input h-8 w-full rounded-lg px-2.5 text-xs"
                      />
                      <input
                        type="text"
                        value={calUrl}
                        onChange={(e) => setCalUrl(e.target.value)}
                        placeholder="Meeting URL (optional)..."
                        className="studio-input h-8 w-full rounded-lg px-2.5 text-xs"
                      />
                      <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          checked={calAutoJoin}
                          onChange={(e) => setCalAutoJoin(e.target.checked)}
                          className="h-3.5 w-3.5"
                        />
                        <span>Notify, auto-join, record &amp; take notes</span>
                      </label>
                      <button
                        type="submit"
                        className="btn-ivory inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs"
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        Schedule Meeting
                      </button>
                    </form>
                  </div>

                  <div className="rounded-xl border border-white/[0.08] bg-[#131926] p-4">
                    <h3 className="text-xs font-semibold text-white">Upcoming Scheduled Meetings</h3>
                    <div className="mt-3 space-y-2">
                      {scheduledMeetings.length === 0 ? (
                        <p className="py-8 text-center text-xs text-zinc-500">
                          No upcoming meetings scheduled.
                        </p>
                      ) : (
                        scheduledMeetings.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-white/[0.07] bg-[#171E2E] p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-medium text-white">{item.title}</p>
                                <p className="mt-0.5 text-[11px] text-zinc-400">
                                  {new Date(item.scheduledAt).toLocaleString([], {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteCalendarMeeting(item.id)}
                                className="rounded p-1 text-zinc-500 hover:text-rose-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-[10px] text-zinc-400">
                                {item.autoJoinAndRecord ? "Auto-Join & Record" : "Alert Only"}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleTriggerScheduledMeetingNow(item)}
                                className="inline-flex h-6 items-center gap-1 rounded border border-white/[0.1] px-2 text-[10px] text-white hover:bg-white/[0.06]"
                              >
                                <Play className="h-2.5 w-2.5 fill-current" /> Start Now
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ============================================================
          MOVABLE STEALTH ANSWER CARD MODAL
          - Only renders when explicitly enabled by the user (showStealthCard === true)
          - Smooth 360° pointer dragging in ANY direction across the entire viewport
          - Resizable to any width & height via bottom-right resize handle or expand button
          ============================================================ */}
      {showStealthCard && selected && (
        <div
          style={{
            left: `${cardPos.x}px`,
            top: `${cardPos.y}px`,
            width: stealthCardMinimized ? "320px" : `${cardSize.width}px`,
            height: stealthCardMinimized ? "auto" : `${cardSize.height}px`,
          }}
          className="dropdown-surface fixed z-50 flex flex-col justify-between rounded-2xl border border-white/[0.16] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.65)] backdrop-blur-xl"
        >
          {/* 360° Free-Drag Header Bar */}
          <div
            onPointerDown={handleCardPointerDown}
            onPointerMove={handleCardPointerMove}
            onPointerUp={handleCardPointerUp}
            onPointerCancel={handleCardPointerUp}
            title="Drag to move anywhere in any direction"
            className="flex cursor-move items-center justify-between gap-2 border-b border-white/[0.08] pb-2.5 select-none touch-none"
          >
            <div className="flex items-center gap-2">
              <GripHorizontal className="h-4 w-4 shrink-0 text-zinc-400" />
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                <Shield className="h-3.5 w-3.5 text-emerald-400" />
                Stealth Response Card
              </span>
              <span className="text-[10px] text-zinc-500">Screen-Share Protected</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleExternalStealthCardWindow}
                title="Float outside browser on device background"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
              >
                <PictureInPicture2 className="h-3.5 w-3.5" />
              </button>
              {!stealthCardMinimized && (
                <button
                  type="button"
                  onClick={() =>
                    setCardSize((cur) =>
                      cur.width < 720
                        ? { width: 780, height: 420 }
                        : { width: 620, height: 320 }
                    )
                  }
                  title="Toggle Large / XL size"
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setStealthCardMinimized((v) => !v)}
                title={stealthCardMinimized ? "Expand" : "Minimize"}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowStealthCard(false)}
                title="Close Stealth Card"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-500/15 hover:text-rose-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {!stealthCardMinimized && (
            <div className="mt-3 flex flex-1 flex-col gap-3 overflow-hidden">
              {/* Caught Question */}
              <div className="shrink-0 rounded-xl border border-white/[0.08] bg-[#0F1522] px-3.5 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Question ({isListening ? "Listening Live" : "Ready"})
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-zinc-100">
                  {liveCaption ||
                    (latestSegment
                      ? cleanDisplayText(latestSegment.content)
                      : "Waiting for incoming question...")}
                </p>
              </div>

              {/* First-Person Suggested Response */}
              <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-[#131B2C] px-4 py-3">
                <div className="flex shrink-0 items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Your Answer (First Person)
                  </p>
                  {latestSegment?.aiHint && (
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(cleanFirstPersonAnswer(latestSegment.aiHint))
                            .then(() => showToast("info", "Copied."))
                            .catch(() => null);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white"
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          stopSpeaking();
                          speakText(cleanFirstPersonAnswer(latestSegment.aiHint), {
                            language: voiceSettings?.inputLanguage || "en-US",
                            voiceType: voiceSettings?.voiceType || "female",
                          });
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white"
                      >
                        <Volume2 className="h-3.5 w-3.5" /> Speak
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-1.5 flex-1 overflow-y-auto pr-1 text-[15px] leading-relaxed text-white">
                  {latestSegment?.aiHint
                    ? cleanFirstPersonAnswer(latestSegment.aiHint)
                    : "Your personalized first-person response will appear here as soon as a question is caught."}
                </div>
              </div>
            </div>
          )}

          {/* Smooth Corner Resize Handle */}
          {!stealthCardMinimized && (
            <div
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={handleResizePointerUp}
              onPointerCancel={handleResizePointerUp}
              title="Drag corner to resize"
              className="absolute right-1.5 bottom-1.5 flex h-5 w-5 cursor-nwse-resize items-end justify-end p-0.5 text-zinc-500 select-none touch-none hover:text-white"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M9 1L1 9M9 5L5 9M9 8.5L8.5 9"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
