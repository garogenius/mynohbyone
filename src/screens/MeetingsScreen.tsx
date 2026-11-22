import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  Calendar,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  GripHorizontal,
  Headphones,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PictureInPicture2,
  Play,
  Plus,
  Radio,
  Save,
  Send,
  Shield,
  Sparkles,
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
  scheduledAt: string; // ISO or YYYY-MM-DDTHH:mm
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
  10, 18, 12, 24, 15, 22, 10, 26, 16, 20, 12, 24, 14, 19, 11, 23, 15, 21, 13, 25, 16, 18, 12, 22,
  14, 20, 10, 16, 12, 18,
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

  const [title, setTitle] = useState("");
  const [meetingType, setMeetingType] = useState<"interview" | "meeting" | "standup" | "client_call">("interview");
  const [stealthMode, setStealthMode] = useState(true);
  const [hiddenOverlay, setHiddenOverlay] = useState(false);

  // Floating Stealth Card Modal (In-App + Screen-Share-Invisible OS Desktop Overlay)
  const [showStealthCard, setShowStealthCard] = useState(true);
  const [stealthCardMinimized, setStealthCardMinimized] = useState(false);
  const [stealthCardExpanded, setStealthCardExpanded] = useState(false);
  const [externalStealthActive, setExternalStealthActive] = useState(false);
  const stealthPopupRef = useRef<Window | null>(null);

  const [activeTab, setActiveTab] = useState<
    "transcript" | "keypoints" | "audio" | "calendar" | "actions"
  >("transcript");
  const [isListening, setIsListening] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("nohbyone.meetingMicOn") === "true";
    }
    return false;
  });
  const [liveCaption, setLiveCaption] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [pushingTasks, setPushingTasks] = useState(false);

  // Meeting Notes, Extracted Key Points & Generated Document state
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

  // Live Session Audio Recorder & Neural Audio Converter
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [savedAudioClips, setSavedAudioClips] = useState<SavedAudioClip[]>([]);
  const [convertingAudio, setConvertingAudio] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // Calendar Sync & Auto-Join state
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
              title: `${meetingObj.title} — Live Session Recording`,
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
        setStealthMode(detail.data.meeting.stealthMode);
        syncNativeStealthMode(detail.data.meeting.stealthMode);
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setHiddenOverlay((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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

  // Calendar Watcher: checks every 15s for upcoming scheduled meetings & auto-joins/records
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
        // Within 1 minute of start time or up to 10 minutes past
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
      setStealthMode(res.data.meeting.stealthMode);
      syncNativeStealthMode(res.data.meeting.stealthMode);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to load session.");
    }
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const sessionTitle = title.trim() || "Live Interview / Meeting Session";
    setStarting(true);
    stopAudioCapture(true);
    try {
      const res = await apiClient.createMeeting({
        title: sessionTitle,
        meetingType,
        provider: "local_audio",
        stealthMode,
      });
      setTitle("");
      setSelected(res.data.meeting);
      setShowStealthCard(true);
      await syncNativeStealthMode(stealthMode);
      await loadMeetings();
      showToast("success", "Stealth meeting assistant active.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to start session.");
    } finally {
      setStarting(false);
    }
  };

  const handleToggleStealth = async () => {
    const next = !stealthMode;
    setStealthMode(next);
    await syncNativeStealthMode(next);
    if (!selected) return;
    try {
      const res = await apiClient.toggleMeetingStealth(selected.id, next);
      setSelected(res.data.meeting);
      showToast(
        "info",
        next
          ? "Stealth shield enabled — card is hidden from OS screen sharing."
          : "Standard window mode enabled."
      );
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Unable to update stealth mode.");
    }
  };

  const toggleBackgroundMic = () => {
    if (!selected) {
      showToast("info", "Start a session first.");
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
    try {
      const res = await apiClient.stopMeeting(selected.id);
      setSelected(res.data.meeting);
      setActiveTab("keypoints");
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
      showToast("info", "Transcript segment deleted.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to delete segment.");
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
    const lines = [
      `MEETING TRANSCRIPT & CAUGHT Q&A: ${selected.title}`,
      `Date: ${new Date(selected.startedAt).toLocaleString()}`,
      `Type: ${selected.meetingType.toUpperCase()}`,
      "",
      ...(selected.transcripts || []).flatMap((seg, i) => [
        `${i + 1}. [${seg.speaker}] (${new Date(seg.createdAt).toLocaleTimeString()}):`,
        `   Question / Statement: ${cleanDisplayText(seg.content)}`,
        ...(seg.aiHint ? [`   My Answer (First-Person): ${cleanDisplayText(seg.aiHint)}`] : []),
        "",
      ]),
    ];
    if (currentNotes) {
      lines.push("SAVED MEETING NOTES:", currentNotes);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `${selected.title.replace(/\s+/g, "-")}-Transcript.txt`);
    showToast("success", "Transcript downloaded.");
  };

  const handleGenerateDocument = async () => {
    if (!selected || generatingDoc) return;
    setGeneratingDoc(true);
    try {
      const res = await apiClient.generateMeetingDocument(selected.id, {
        notes: currentNotes,
      });
      setGeneratedDocText(res.data.documentText);
      setGeneratedDocFilename(res.data.filename);
      const blob = new Blob([res.data.documentText], { type: "text/markdown;charset=utf-8" });
      downloadBlob(blob, res.data.filename);
      showToast("success", `Key points document saved to Library & downloaded (${res.data.filename}).`);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to generate document.");
    } finally {
      setGeneratingDoc(false);
    }
  };

  const handleConvertMeetingToAudioAndExport = async () => {
    if (!selected || convertingAudio) return;
    setConvertingAudio(true);
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
          title: `${selected.title} — Neural Audio Export`,
          url,
          mimeType: mime,
          durationSec: Math.max(8, Math.round(res.data.narrationText.length / 14)),
          createdAt: new Date().toISOString(),
          kind: "neural_brief",
        };
        setSavedAudioClips((prev) => [clip, ...prev]);
        downloadBlob(blob, res.data.filename);
        setActiveTab("audio");
        showToast("success", `Meeting converted to audio and exported (${res.data.filename}).`);
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
      showToast("success", "Audio recording metadata & notes saved to Library.");
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
      showToast("success", `${calendarProvider} connected for meeting alerts & auto-join.`);
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
    showToast(
      "success",
      `Saved "${cleanTitle}" to calendar (${item.autoJoinAndRecord ? "Auto-Join & Record ON" : "Alert Only"}).`
    );
  };

  const handleDeleteCalendarMeeting = (id: string) => {
    const next = scheduledMeetings.filter((m) => m.id !== id);
    setScheduledMeetings(next);
    localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(next));
    showToast("info", "Scheduled calendar meeting removed.");
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
      showToast("success", `Joined "${item.title}" — listening, recording & taking notes.`);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to start meeting.");
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
      showToast("success", `Pushed ${Math.min(items.length, 3)} action item(s) to Scheduled Tasks.`);
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
      showToast("info", "Meeting session deleted.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Delete failed.");
    }
  };

  const latestSegment =
    selected?.transcripts && selected.transcripts.length > 0
      ? selected.transcripts[selected.transcripts.length - 1]
      : null;

  // Sync External Screen-Share-Invisible Floating Stealth Card Window
  const syncExternalStealthCard = useCallback(() => {
    const win = stealthPopupRef.current;
    if (!win || win.closed) return;
    const doc = win.document;
    const qEl = doc.getElementById("stealth-caught-q");
    const aEl = doc.getElementById("stealth-first-person-a");
    const statusEl = doc.getElementById("stealth-live-badge");

    if (statusEl) {
      statusEl.textContent = isListening
        ? "LIVE LISTENING • STEALTH SHIELD ACTIVE (INVISIBLE ON SCREEN SHARE)"
        : "STANDBY • STEALTH SHIELD ACTIVE";
    }
    if (qEl) {
      qEl.textContent =
        liveCaption ||
        (latestSegment
          ? cleanDisplayText(latestSegment.content)
          : "Listening for interviewer or meeting question...");
    }
    if (aEl) {
      aEl.textContent = latestSegment?.aiHint
        ? cleanFirstPersonAnswer(latestSegment.aiHint)
        : "Your personalized first-person answer ('I...', 'In my experience...') will appear here immediately when a question is caught.";
    }
  }, [isListening, latestSegment, liveCaption]);

  useEffect(() => {
    syncExternalStealthCard();
  }, [syncExternalStealthCard]);

  const toggleExternalStealthCardWindow = async () => {
    // Enable OS hardware screen-capture protection in Tauri Desktop
    await syncNativeStealthMode(true);

    if (stealthPopupRef.current && !stealthPopupRef.current.closed) {
      stealthPopupRef.current.close();
      stealthPopupRef.current = null;
      setExternalStealthActive(false);
      return;
    }

    try {
      let pipWin: Window | null = null;
      if (window.documentPictureInPicture?.requestWindow) {
        pipWin = await window.documentPictureInPicture.requestWindow({
          width: 580,
          height: 410,
        });
      } else {
        pipWin = window.open(
          "",
          "NohbyStealthMeetingCard",
          "width=580,height=420,menubar=no,toolbar=no,location=no,status=no,resizable=yes"
        );
      }

      if (!pipWin) {
        showToast("error", "Allow popups to float the stealth card on your device background.");
        return;
      }

      stealthPopupRef.current = pipWin;
      setExternalStealthActive(true);

      pipWin.document.open();
      pipWin.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>NohbyAI Stealth Answer Card (Screen-Share Protected)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #080D18;
      color: #F8FAFC;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 14px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 10px;
    }
    .shield {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34D399;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .box-q {
      background: #101829;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 10px 12px;
    }
    .label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #94A3B8;
      margin-bottom: 4px;
    }
    .q-text {
      font-size: 12px;
      color: #E2E8F0;
      line-height: 1.45;
    }
    .box-a {
      flex: 1;
      background: linear-gradient(145deg, rgba(0, 212, 255, 0.12), rgba(124, 58, 237, 0.12));
      border: 1px solid rgba(0, 212, 255, 0.45);
      border-radius: 12px;
      padding: 12px;
      overflow-y: auto;
    }
    .a-label {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #00D4FF;
      margin-bottom: 6px;
    }
    .a-text {
      font-size: 13.5px;
      font-weight: 500;
      color: #FFFFFF;
      line-height: 1.55;
    }
  </style>
</head>
<body>
  <div class="shield">
    <span id="stealth-live-badge">STEALTH SHIELD ACTIVE • INVISIBLE ON SCREEN SHARE</span>
  </div>
  <div class="box-q">
    <div class="label">Caught Question / Speaker</div>
    <div class="q-text" id="stealth-caught-q">Listening for question...</div>
  </div>
  <div class="box-a">
    <div class="a-label">Answer As You (First-Person Script — Read Aloud)</div>
    <div class="a-text" id="stealth-first-person-a">Waiting for question...</div>
  </div>
</body>
</html>`);
      pipWin.document.close();

      pipWin.addEventListener("pagehide", () => {
        stealthPopupRef.current = null;
        setExternalStealthActive(false);
      });

      syncExternalStealthCard();
      showToast(
        "success",
        "Stealth Answer Card popped out to device background (excluded from tab/window screen share)."
      );
    } catch {
      showToast("error", "Unable to open external stealth card window.");
    }
  };

  if (hiddenOverlay) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end justify-end bg-[#080C14] p-4">
        <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#101624] px-3 py-1.5 text-[11px] text-zinc-400">
          <span
            className={`h-2 w-2 rounded-full ${isListening ? "animate-pulse bg-emerald-400" : "bg-zinc-600"}`}
          />
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
      {/* Top Bar: Start New Session + Stealth Shield & Pop-Out Floating Card */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#101624] px-3.5 py-2.5">
        <form onSubmit={handleStartSession} className="flex flex-1 flex-wrap items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New meeting or interview title..."
            className="studio-input h-8 min-w-[180px] flex-1 rounded-lg px-3 text-xs"
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
          <button
            type="submit"
            disabled={starting}
            className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs"
          >
            {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            New Session
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleToggleStealth}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition ${
              stealthMode
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                : "border-white/[0.08] bg-white/[0.03] text-zinc-400"
            }`}
            title="Hardware screen-capture protection excludes this card from Zoom/Meet/Teams screen share"
          >
            <Shield className="h-3.5 w-3.5" />
            {stealthMode ? "Screen-Share Invisible: ON" : "Stealth Off"}
          </button>

          <button
            type="button"
            onClick={() => setShowStealthCard((v) => !v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition ${
              showStealthCard
                ? "border-[#00D4FF]/45 bg-[#00D4FF]/15 text-[#00D4FF]"
                : "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:text-white"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {showStealthCard ? "Stealth Answer Card: Visible" : "Show Answer Card"}
          </button>

          <button
            type="button"
            onClick={toggleExternalStealthCardWindow}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition ${
              externalStealthActive
                ? "border-violet-400/50 bg-violet-500/20 text-violet-300"
                : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:border-[#00D4FF]/40 hover:text-white"
            }`}
            title="Float Stealth Answer Card on top of any app on your device background (hidden from tab/window screen share)"
          >
            <PictureInPicture2 className="h-3.5 w-3.5 text-[#00D4FF]" />
            Float on Device Background
          </button>

          <button
            type="button"
            onClick={() => setHiddenOverlay(true)}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] text-zinc-400 hover:text-white"
            title="Hide workspace UI (Ctrl+Shift+H)"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Session Selector Pills */}
      {meetings.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {meetings.map((m) => (
            <div
              key={m.id}
              onClick={() => handleSelectMeeting(m.id)}
              className={`group inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${
                selected?.id === m.id
                  ? "border-[#00D4FF]/45 bg-[#00D4FF]/12 text-white"
                  : "border-white/[0.07] bg-[#101624] text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  m.status === "listening" ? "bg-emerald-400" : "bg-zinc-600"
                }`}
              />
              <span className="max-w-[160px] truncate font-medium">{m.title}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(m.id);
                }}
                className="opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                title="Delete meeting"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Meeting Room Container */}
      {loading ? (
        <div className="nohby-frame flex items-center justify-center py-12 text-xs text-zinc-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#00D4FF]" />
          Loading meeting sessions...
        </div>
      ) : !selected ? (
        <div className="nohby-frame p-6 text-center">
          <p className="text-sm font-semibold text-white">No Meeting Session Active</p>
          <p className="mt-1 text-xs text-zinc-400">
            Create a session above or connect your calendar to auto-join and catch questions in stealth mode.
          </p>
        </div>
      ) : (
        <div className="nohby-frame space-y-4 p-4 sm:p-5">
          {/* Header Row */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base font-bold text-white">{selected.title}</h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                  <Shield className="h-3 w-3" />
                  Invisible on Screen Share
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-400">
                Started{" "}
                {new Date(selected.startedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                • Local Private Audio • Personalized First-Person Answers ({user?.name || "You"})
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  isRecordingAudio ? stopLiveRecording() : startLiveRecording(selected)
                }
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition ${
                  isRecordingAudio
                    ? "border-rose-500/60 bg-rose-500/20 text-rose-300"
                    : "border-white/[0.12] bg-[#151D2E] text-zinc-200 hover:border-[#00D4FF]/50"
                }`}
              >
                <Radio className={`h-3 w-3 ${isRecordingAudio ? "animate-ping text-rose-400" : "text-[#00D4FF]"}`} />
                {isRecordingAudio
                  ? `Stop Recording (${Math.floor(recordingSeconds / 60)}:${String(
                      recordingSeconds % 60
                    ).padStart(2, "0")})`
                  : "Record Audio"}
              </button>

              <button
                type="button"
                disabled={convertingAudio}
                onClick={handleConvertMeetingToAudioAndExport}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#00D4FF]/40 bg-[#00D4FF]/15 px-3.5 text-xs font-medium text-[#00D4FF] transition hover:bg-[#00D4FF]/25"
              >
                {convertingAudio ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Headphones className="h-3 w-3" />
                )}
                Convert to Audio &amp; Export
              </button>

              <button
                type="button"
                disabled={generatingDoc}
                onClick={handleGenerateDocument}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/25"
              >
                {generatingDoc ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                Extract Key Points &amp; Generate Doc
              </button>

              {selected.status !== "completed" && (
                <button
                  type="button"
                  onClick={handleStopAndSummarise}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-rose-500/35 bg-rose-500/15 px-3.5 text-xs font-medium text-rose-400 transition hover:bg-rose-500/25"
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
                Push Actions to Tasks
              </button>
            </div>
          </div>

          {/* 30-Bar Real-Time Sound Level Waveform Bar */}
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
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#00D4FF]/15 px-2 py-0.5 text-[9px] font-semibold text-[#00D4FF]">
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

          {/* Navigation Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "transcript", label: "Live Transcript & Q&A" },
                  { id: "keypoints", label: "Key Points, Notes & Doc" },
                  { id: "audio", label: `Audio & Recordings (${savedAudioClips.length})` },
                  { id: "calendar", label: `Calendar & Auto-Join (${scheduledMeetings.length})` },
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

            <button
              type="button"
              onClick={handleDownloadTranscript}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.1] bg-[#141B2D] px-2.5 text-[11px] font-medium text-zinc-300 transition hover:border-[#00D4FF]/40 hover:text-white"
            >
              <Download className="h-3 w-3 text-[#00D4FF]" />
              Save Transcript (.txt)
            </button>
          </div>

          {/* TAB 1: LIVE TRANSCRIPT & CAUGHT Q&A */}
          {activeTab === "transcript" && (
            <div className="space-y-2.5">
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
                    placeholder="Type or speak any interview/meeting question to get your instant first-person answer..."
                    className="studio-input h-8 flex-1 rounded-lg px-3 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={!manualInput.trim()}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#00D4FF]/35 bg-[#00D4FF]/10 px-3 text-xs font-medium text-[#00D4FF]"
                  >
                    <Send className="h-3 w-3" /> Catch &amp; Answer
                  </button>
                </form>
              )}

              {liveCaption && (
                <div className="rounded-xl border border-[#00D4FF]/30 bg-[#00D4FF]/10 px-3.5 py-2 text-xs italic text-[#00D4FF]">
                  Catching live speech: &ldquo;{liveCaption}&rdquo;
                </div>
              )}

              {!selected.transcripts || selected.transcripts.length === 0 ? (
                <div className="rounded-xl border border-white/[0.07] bg-[#101624] px-4 py-8 text-center text-xs text-zinc-500">
                  Press the blue mic button above to listen silently in the background. Any question asked will be caught and answered in the first person based on your skills and experience.
                </div>
              ) : (
                selected.transcripts.map((seg) => (
                  <div
                    key={seg.id}
                    className="rounded-xl border border-white/[0.07] bg-[#101624] px-4 py-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-amber-400">
                        {seg.speaker} (Caught Question)
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-zinc-500">
                          {new Date(seg.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteSegment(seg.id)}
                          className="rounded p-1 text-zinc-500 transition hover:bg-rose-500/15 hover:text-rose-400"
                          title="Delete this saved transcript entry"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-200">
                      {cleanDisplayText(seg.content)}
                    </p>
                    {seg.aiHint && (
                      <div className="mt-2.5 rounded-lg border border-[#00D4FF]/35 bg-gradient-to-r from-[#00D4FF]/10 to-violet-500/10 p-2.5">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#00D4FF]">
                            <Sparkles className="h-3 w-3" />
                            Answer As You (First-Person Script)
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard
                                  .writeText(cleanDisplayText(seg.aiHint))
                                  .then(() => showToast("info", "Answer copied."))
                                  .catch(() => null);
                              }}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 hover:bg-white/[0.08]"
                            >
                              <Copy className="h-2.5 w-2.5" /> Copy
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                speakText(cleanDisplayText(seg.aiHint), {
                                  language: voiceSettings?.inputLanguage || "en-US",
                                  voiceType: voiceSettings?.voiceType || "female",
                                })
                              }
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[#00D4FF] hover:bg-white/[0.08]"
                            >
                              <Volume2 className="h-2.5 w-2.5" /> Speak
                            </button>
                          </div>
                        </div>
                        <p className="mt-1 text-xs font-medium leading-relaxed text-white">
                          {cleanDisplayText(seg.aiHint)}
                        </p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 2: KEY POINTS, SAVED MEETING NOTES & DOCUMENT GENERATION */}
          {activeTab === "keypoints" && (
            <div className="grid gap-3.5 lg:grid-cols-2">
              {/* Saved Meeting Notes Editor */}
              <div className="rounded-xl border border-white/[0.08] bg-[#101624] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xs font-semibold text-white">
                    Saved Meeting Notes
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateCurrentNotes("")}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.08] px-2 text-[10px] text-zinc-400 hover:text-rose-400"
                    >
                      <Trash2 className="h-3 w-3" /> Clear
                    </button>
                    <button
                      type="button"
                      disabled={savingNotes}
                      onClick={handleSaveNotes}
                      className="btn-ivory inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[10px]"
                    >
                      {savingNotes ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Save className="h-3 w-3" />
                      )}
                      Save Notes
                    </button>
                  </div>
                </div>
                <textarea
                  rows={7}
                  value={currentNotes}
                  onChange={(e) => updateCurrentNotes(e.target.value)}
                  placeholder="Write or edit your meeting notes here. NohbyAI also auto-populates key takeaways when you summarise..."
                  className="studio-input mt-2.5 w-full rounded-lg p-3 text-xs leading-relaxed"
                />
              </div>

              {/* Extracted Key Points & One-Click Document Generator */}
              <div className="rounded-xl border border-white/[0.08] bg-[#101624] p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xs font-semibold text-white">
                    Extracted Key Points &amp; Meeting Document
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={generatingDoc}
                      onClick={handleGenerateDocument}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/25"
                    >
                      {generatingDoc ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <FileText className="h-3 w-3" />
                      )}
                      Generate Document &amp; Save to Library
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoute("files")}
                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.1] px-2 text-[10px] text-zinc-300 hover:text-white"
                    >
                      Open Library
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 max-h-48 space-y-1.5 overflow-y-auto text-xs text-zinc-300">
                  {generatedDocText ? (
                    <pre className="whitespace-pre-wrap rounded-lg border border-emerald-500/30 bg-[#0B101C] p-3 font-sans text-[11px] leading-relaxed text-zinc-200">
                      {generatedDocText}
                    </pre>
                  ) : selected.transcripts && selected.transcripts.length > 0 ? (
                    selected.transcripts.map((seg, i) => (
                      <div
                        key={seg.id}
                        className="rounded-lg border border-white/[0.06] bg-[#141C2E] px-3 py-2"
                      >
                        <p className="text-[11px] font-medium text-white">
                          {i + 1}. {cleanDisplayText(seg.content)}
                        </p>
                        {seg.aiHint && (
                          <p className="mt-0.5 text-[11px] text-[#00D4FF]">
                            → {cleanDisplayText(seg.aiHint)}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="py-4 text-xs text-zinc-400">
                      {selected.summary
                        ? cleanDisplayText(selected.summary)
                        : "Click 'Extract Key Points & Generate Doc' to build a dedicated document from this meeting."}
                    </p>
                  )}
                </div>
                {generatedDocFilename && (
                  <p className="mt-2 text-[10px] text-emerald-400">
                    Saved to Library as: {generatedDocFilename}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: AUDIO RECORDINGS & NEURAL AUDIO EXPORT */}
          {activeTab === "audio" && (
            <div className="space-y-3 rounded-xl border border-white/[0.08] bg-[#101624] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-xs font-semibold text-white">
                    Meeting Audio Recordings &amp; Neural Audio Exports
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Record the live meeting session or convert the meeting summary &amp; transcript into studio neural audio (.mp3 / .wav).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      isRecordingAudio ? stopLiveRecording() : startLiveRecording(selected)
                    }
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${
                      isRecordingAudio
                        ? "border-rose-500/50 bg-rose-500/20 text-rose-300"
                        : "border-white/[0.12] bg-[#161F33] text-white"
                    }`}
                  >
                    <Radio className="h-3.5 w-3.5 text-rose-400" />
                    {isRecordingAudio ? "Stop & Save Recording" : "Start Live Audio Recording"}
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
                    Convert Meeting to Audio &amp; Export
                  </button>
                </div>
              </div>

              {savedAudioClips.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/[0.1] py-8 text-center text-xs text-zinc-400">
                  No audio recordings or exports yet. Click &ldquo;Start Live Audio Recording&rdquo; or &ldquo;Convert Meeting to Audio &amp; Export&rdquo; above.
                </div>
              ) : (
                <div className="space-y-2">
                  {savedAudioClips.map((clip) => (
                    <div
                      key={clip.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#141C2E] px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-white">{clip.title}</p>
                        <p className="text-[10px] text-zinc-400">
                          {clip.kind === "live_recording" ? "Live Microphone Recording" : "Studio Neural Audio Brief"}{" "}
                          • {new Date(clip.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <audio controls src={clip.url} className="h-8 max-w-[240px]" />
                      <div className="flex items-center gap-1.5">
                        <a
                          href={clip.url}
                          download={`${clip.title.replace(/\s+/g, "-")}.${
                            clip.mimeType.includes("wav") ? "wav" : clip.mimeType.includes("webm") ? "webm" : "mp3"
                          }`}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#00D4FF]/40 bg-[#00D4FF]/15 px-2.5 text-[10px] font-medium text-[#00D4FF]"
                        >
                          <Download className="h-3 w-3" /> Export
                        </a>
                        <button
                          type="button"
                          onClick={() => handleSaveRecordingToLibrary(clip)}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 text-[10px] font-medium text-emerald-300"
                        >
                          <Save className="h-3 w-3" /> Save to Library
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSavedAudioClips((prev) => prev.filter((c) => c.id !== clip.id))
                          }
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-rose-500/15 hover:text-rose-400"
                          title="Delete audio clip"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CALENDAR CONNECTION, ALERTS & AUTO-JOIN / AUTO-RECORD */}
          {activeTab === "calendar" && (
            <div className="grid gap-3.5 lg:grid-cols-2">
              <div className="rounded-xl border border-white/[0.08] bg-[#101624] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-[#00D4FF]" />
                    <h3 className="font-display text-xs font-semibold text-white">
                      Connect Calendar &amp; Schedule Auto-Join
                    </h3>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      calendarConnected
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-zinc-500/15 text-zinc-400"
                    }`}
                  >
                    {calendarConnected ? `${calendarProvider} Connected` : "Not Connected"}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <select
                    value={calendarProvider}
                    onChange={(e) =>
                      setCalendarProvider(e.target.value as typeof calendarProvider)
                    }
                    className="studio-input h-8 rounded-lg px-2.5 text-xs"
                  >
                    <option value="Google Calendar">Google Calendar</option>
                    <option value="iCloud Calendar">iCloud Calendar</option>
                    <option value="Outlook Calendar">Outlook Calendar</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleConnectCalendar}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#00D4FF]/40 bg-[#00D4FF]/15 px-3 text-xs font-medium text-[#00D4FF]"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    {calendarConnected ? "Re-Sync Calendar" : "Connect Calendar"}
                  </button>
                </div>

                <form onSubmit={handleScheduleCalendarMeeting} className="mt-3.5 space-y-2.5">
                  <div>
                    <label className="block text-[10px] font-medium text-zinc-400">
                      Meeting Title
                    </label>
                    <input
                      type="text"
                      required
                      value={calTitle}
                      onChange={(e) => setCalTitle(e.target.value)}
                      placeholder="e.g. Senior AI Engineer Technical Interview"
                      className="studio-input mt-1 h-8 w-full rounded-lg px-3 text-xs"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] font-medium text-zinc-400">
                        Date &amp; Time
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={calDateTime}
                        onChange={(e) => setCalDateTime(e.target.value)}
                        className="studio-input mt-1 h-8 w-full rounded-lg px-2.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-zinc-400">
                        Meeting Link (Zoom / Meet / Teams)
                      </label>
                      <input
                        type="text"
                        value={calUrl}
                        onChange={(e) => setCalUrl(e.target.value)}
                        placeholder="https://meet.google.com/..."
                        className="studio-input mt-1 h-8 w-full rounded-lg px-2.5 text-xs"
                      />
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs text-zinc-200">
                    <input
                      type="checkbox"
                      checked={calAutoJoin}
                      onChange={(e) => setCalAutoJoin(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[#00D4FF]"
                    />
                    <span>
                      Notify me at meeting time &amp; enable NohbyAI to{" "}
                      <strong className="text-[#00D4FF]">
                        Auto-Join, Auto-Record &amp; Auto-Take Notes
                      </strong>
                    </span>
                  </label>
                  <button
                    type="submit"
                    className="btn-ivory inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    Save Meeting to Calendar
                  </button>
                </form>
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-[#101624] p-4">
                <h3 className="font-display text-xs font-semibold text-white">
                  Upcoming Calendar Meetings &amp; Auto-Join Queue
                </h3>
                <div className="mt-2.5 max-h-60 space-y-2 overflow-y-auto">
                  {scheduledMeetings.length === 0 ? (
                    <p className="py-8 text-center text-xs text-zinc-400">
                      No calendar meetings scheduled yet. Add one on the left to enable automatic notifications and auto-recording.
                    </p>
                  ) : (
                    scheduledMeetings.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-white/[0.07] bg-[#141C2E] p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-white">{item.title}</p>
                            <p className="mt-0.5 text-[11px] text-[#00D4FF]">
                              {new Date(item.scheduledAt).toLocaleString([], {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}{" "}
                              • {item.provider}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                              item.autoJoinAndRecord
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-amber-500/15 text-amber-300"
                            }`}
                          >
                            {item.autoJoinAndRecord ? "Auto-Join & Record ON" : "Alert Only"}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleTriggerScheduledMeetingNow(item)}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#00D4FF]/40 bg-[#00D4FF]/15 px-2.5 text-[10px] font-medium text-[#00D4FF]"
                          >
                            <Play className="h-2.5 w-2.5 fill-current" /> Join &amp; Record Now
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCalendarMeeting(item.id)}
                            className="rounded-lg p-1 text-zinc-400 hover:bg-rose-500/15 hover:text-rose-400"
                            title="Delete scheduled meeting"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: ACTION ITEMS */}
          {activeTab === "actions" && (
            <div className="space-y-2">
              {selected.actionItems.length === 0 ? (
                <div className="rounded-xl border border-white/[0.08] bg-[#101624] p-4 text-xs text-zinc-400">
                  No action items extracted yet. End &amp; Summarise the session to extract follow-ups.
                </div>
              ) : (
                selected.actionItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2.5 rounded-xl border border-white/[0.07] bg-[#101624] px-4 py-3 text-xs text-zinc-200"
                  >
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      <span>{cleanDisplayText(item)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================================================
          FLOATING STEALTH MEETING & INTERVIEW ANSWER CARD MODAL
          (Freely Draggable Anywhere, Large & Resizable, Screen-Share Invisible)
          ============================================================ */}
      {showStealthCard && selected && (
        <motion.div
          drag
          dragMomentum={false}
          style={{
            resize: stealthCardMinimized ? "none" : "both",
            overflow: stealthCardMinimized ? "visible" : "auto",
          }}
          className={`dropdown-surface fixed bottom-12 left-4 z-50 rounded-2xl border border-[#00D4FF]/65 shadow-[0_16px_55px_rgba(0,180,255,0.35)] backdrop-blur-xl lg:bottom-5 lg:left-6 ${
            stealthCardMinimized
              ? "w-80 p-3"
              : stealthCardExpanded
                ? "min-h-[340px] w-[96vw] sm:w-[700px] md:w-[780px] p-5"
                : "min-h-[260px] w-[92vw] sm:w-[540px] md:w-[620px] p-4 sm:p-5"
          }`}
        >
          {/* Draggable Header Bar */}
          <div
            title="Drag this Stealth Card anywhere on your screen"
            className="flex cursor-grab items-center justify-between gap-2 select-none active:cursor-grabbing"
          >
            <div className="flex items-center gap-2">
              <GripHorizontal className="h-4 w-4 shrink-0 text-zinc-400" />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/45 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                <Shield className="h-3 w-3" />
                Stealth Card • Screen-Share Invisible
              </span>
              <span className="hidden text-[10px] text-zinc-400 sm:inline">
                Drag anywhere • Resize corner
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleExternalStealthCardWindow}
                title="Float Stealth Card outside browser on device background"
                className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.08] hover:text-[#00D4FF]"
              >
                <PictureInPicture2 className="h-4 w-4" />
              </button>
              {!stealthCardMinimized && (
                <button
                  type="button"
                  onClick={() => setStealthCardExpanded((v) => !v)}
                  title={stealthCardExpanded ? "Standard Large Size" : "Expand to XL Teleprompter Size"}
                  className={`rounded-lg p-1.5 transition ${
                    stealthCardExpanded
                      ? "bg-[#00D4FF]/20 text-[#00D4FF]"
                      : "text-zinc-400 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setStealthCardMinimized((v) => !v)}
                title={stealthCardMinimized ? "Expand Stealth Card" : "Minimize Stealth Card"}
                className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowStealthCard(false)}
                title="Close Stealth Card"
                className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-rose-500/15 hover:text-rose-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!stealthCardMinimized && (
            <div className="mt-3.5 space-y-3">
              {/* Caught Question Box */}
              <div className="rounded-xl border border-white/[0.1] bg-[#0E1525]/95 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Caught Question ({isListening ? "Listening Live" : "Ready"})
                </p>
                <p className="mt-1 text-sm font-medium leading-snug text-zinc-100">
                  {liveCaption ||
                    (latestSegment
                      ? cleanDisplayText(latestSegment.content)
                      : "Speak or let the interviewer ask a question — NohbyAI will catch it automatically.")}
                </p>
              </div>

              {/* First-Person Teleprompter Answer Box */}
              <div className="rounded-xl border border-[#00D4FF]/45 bg-gradient-to-br from-[#00D4FF]/14 to-violet-500/14 px-4 py-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#00D4FF]">
                    Your Answer (Read Aloud in First Person)
                  </p>
                  {latestSegment?.aiHint && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard
                            .writeText(cleanFirstPersonAnswer(latestSegment.aiHint))
                            .then(() => showToast("info", "Answer copied."))
                            .catch(() => null);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-300 hover:text-white"
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
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#00D4FF] hover:underline"
                      >
                        <Volume2 className="h-3.5 w-3.5" /> Whisper
                      </button>
                    </div>
                  )}
                </div>
                <p
                  className={`mt-1.5 overflow-y-auto font-medium leading-relaxed text-white ${
                    stealthCardExpanded ? "max-h-72 text-base" : "max-h-48 text-sm sm:text-[15px]"
                  }`}
                >
                  {latestSegment?.aiHint
                    ? cleanFirstPersonAnswer(latestSegment.aiHint)
                    : `I'm ${user?.name || "ready"}, and I'm prepared to walk through my architecture, engineering experience, and project impact as soon as a question is asked.`}
                </p>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
