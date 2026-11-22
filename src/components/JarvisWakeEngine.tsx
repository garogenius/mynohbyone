import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Radio, ShieldCheck, X } from "lucide-react";

import { apiClient } from "../lib/api";
import { cleanFirstPersonAnswer } from "../lib/formatText";
import {
  executeClientAction,
  finalizeAssistantExecution,
  resolveImmediateClientAction,
} from "../lib/localAgent";
import { getSelectedOrbStyle, type OrbStyleOption } from "../lib/orbStyle";
import {
  extractWakeWordCommand,
  isSpeechRecognitionSupported,
  speakText,
  startLocalVoiceRecognition,
  stopSpeaking,
  type VoiceSessionHandle,
} from "../lib/voice";
import { useAppStore } from "../store/useAppStore";
import type { Message } from "../types/api";

interface DocumentPictureInPicture {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
  window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

function playJarvisChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.14); // A5
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
    setTimeout(() => ctx.close().catch(() => {}), 350);
  } catch {
    // Ignore audio context restriction
  }
}

export function JarvisWakeEngine() {
  const {
    phase,
    user,
    currentDeviceId,
    voiceSettings,
    loadVoiceSettings,
    updateVoiceSettings,
    setIsSpeaking,
    setRoute,
    showToast,
  } = useAppStore();

  const [status, setStatus] = useState<"standby" | "awake" | "thinking" | "speaking">("standby");
  const [lastHeard, setLastHeard] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [orbStyle, setOrbStyle] = useState<OrbStyleOption>(() => getSelectedOrbStyle());
  const [speechDetected, setSpeechDetected] = useState(false);
  const [manualMicActive, setManualMicActive] = useState(false);
  const [desktopPinned, setDesktopPinned] = useState(false);

  const handleRef = useRef<VoiceSessionHandle | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const speechPulseTimerRef = useRef<number | null>(null);
  const interimCommitTimerRef = useRef<number | null>(null);
  const awakeExpireTimerRef = useRef<number | null>(null);
  const awakeUntilRef = useRef<number>(0);
  const busyRef = useRef<boolean>(false);
  const lastProcessedRef = useRef<string>("");
  const convIdRef = useRef<string | null>(null);
  const overlayWindowRef = useRef<Window | null>(null);
  const meetingSyncRef = useRef<{
    meetingId?: string;
    meetingTitle?: string;
    isListening?: boolean;
    question?: string;
    answer?: string;
  }>({
    meetingId: "",
    meetingTitle: "",
    isListening: false,
    question: "",
    answer: "",
  });
  const activeOverlayTabRef = useRef<"assistant" | "meeting">("assistant");
  const overlayVoiceHandleRef = useRef<VoiceSessionHandle | null>(null);
  const overlayMicActiveRef = useRef<boolean>(true);
  const overlayMeetingSessionIdRef = useRef<string | null>(null);
  const overlayGeneratingRef = useRef<boolean>(false);
  const overlayDebounceTimerRef = useRef<number | null>(null);
  const overlayCurrentQuestionRef = useRef<string>("");
  const overlayCurrentAnswerRef = useRef<string>("");
  const overlayAnswerLockedRef = useRef<boolean>(false);
  const overlayRestartTimerRef = useRef<number | null>(null);

  const enabled = phase === "ready" && Boolean(voiceSettings?.wakeWordEnabled);
  const wakePhrase = voiceSettings?.wakeWordPhrase || "Hey Nohby";
  const lang = voiceSettings?.inputLanguage || "en-US";
  const isHausa = lang.toLowerCase().startsWith("ha");
  const firstName =
    (user?.profile?.displayName || user?.name || "").trim().split(/\s+/)[0] || "";

  useEffect(() => {
    const onOrbChange = () => setOrbStyle(getSelectedOrbStyle());
    const onManualMic = (e: Event) => {
      const detail = (e as CustomEvent<{ active?: boolean }>).detail;
      setManualMicActive(Boolean(detail?.active));
    };
    window.addEventListener("nohby-orb-style-change", onOrbChange);
    window.addEventListener("nohby-manual-mic", onManualMic);
    return () => {
      window.removeEventListener("nohby-orb-style-change", onOrbChange);
      window.removeEventListener("nohby-manual-mic", onManualMic);
    };
  }, []);

  useEffect(() => {
    if (phase === "ready" && !voiceSettings) {
      loadVoiceSettings();
    }
  }, [phase, voiceSettings, loadVoiceSettings]);

  const triggerSpeechPulse = useCallback(() => {
    setSpeechDetected(true);
    if (speechPulseTimerRef.current) {
      window.clearTimeout(speechPulseTimerRef.current);
    }
    speechPulseTimerRef.current = window.setTimeout(() => {
      setSpeechDetected(false);
    }, 950);
  }, []);

  const emitJarvisState = useCallback((state: "standby" | "awake" | "thinking" | "speaking") => {
    setStatus(state);
    window.dispatchEvent(new CustomEvent("nohby-jarvis-state", { detail: { state } }));
  }, []);

  const scheduleAwakeWindow = useCallback(
    (durationMs = 20000) => {
      awakeUntilRef.current = Date.now() + durationMs;
      emitJarvisState("awake");
      if (awakeExpireTimerRef.current) {
        window.clearTimeout(awakeExpireTimerRef.current);
      }
      awakeExpireTimerRef.current = window.setTimeout(() => {
        if (!busyRef.current && Date.now() >= awakeUntilRef.current) {
          emitJarvisState("standby");
        }
      }, durationMs + 100);
    },
    [emitJarvisState]
  );

  const greetAndOpenListeningWindow = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    playJarvisChime();

    const ack = isHausa
      ? `Na'am${firstName ? ` ${firstName}` : ""}, ina ji. Me zan taimaka maka da shi?`
      : `Yes${firstName ? ` ${firstName}` : ""}, I'm listening. How can I help you?`;

    setLastHeard(wakePhrase);

    const nowIso = new Date().toISOString();
    const syntheticUser: Message = {
      id: `jarvis-wake-u-${Date.now()}`,
      conversationId: convIdRef.current || "jarvis",
      userId: user?.id || "",
      role: "user",
      content: wakePhrase,
      inputType: "voice",
      attachments: [],
      modelProvider: null,
      modelName: null,
      tokenUsage: {},
      createdAt: nowIso,
    };
    const syntheticAssistant: Message = {
      id: `jarvis-wake-a-${Date.now()}`,
      conversationId: convIdRef.current || "jarvis",
      userId: user?.id || "",
      role: "assistant",
      content: ack,
      inputType: "text",
      attachments: [],
      modelProvider: "nohby_assistant",
      modelName: "nohby-core",
      tokenUsage: {},
      createdAt: nowIso,
    };
    window.dispatchEvent(
      new CustomEvent("nohby-jarvis-reply", {
        detail: {
          userMessage: syntheticUser,
          assistantMessage: syntheticAssistant,
        },
      })
    );

    emitJarvisState("speaking");
    setIsSpeaking(true);
    speakText(ack, {
      language: lang,
      voiceType: voiceSettings?.voiceType || "female",
      pitch: voiceSettings?.ttsPitch,
      rate: voiceSettings?.ttsRate ?? 1.0,
      onStart: () => {
        emitJarvisState("speaking");
        setIsSpeaking(true);
      },
      onEnd: () => {
        setIsSpeaking(false);
        busyRef.current = false;
        scheduleAwakeWindow(20000);
      },
    });
  }, [
    emitJarvisState,
    firstName,
    isHausa,
    lang,
    scheduleAwakeWindow,
    setIsSpeaking,
    user?.id,
    voiceSettings?.ttsPitch,
    voiceSettings?.ttsRate,
    voiceSettings?.voiceType,
    wakePhrase,
  ]);

  const processCommand = useCallback(
    async (commandText: string) => {
      const clean = commandText.trim();
      if (!clean || busyRef.current) return;

      busyRef.current = true;
      setLastHeard(clean);
      emitJarvisState("thinking");

      // 1. Synchronously trigger local device action (browser open / search / route / theme)
      const immediateAction = resolveImmediateClientAction(clean);
      let executedImmediate = false;
      if (immediateAction) {
        executedImmediate = await executeClientAction(immediateAction, {
          setRoute,
          showToast,
        });
      }

      try {
        if (!convIdRef.current) {
          const list = await apiClient.listConversations({ limit: 1 }).catch(() => null);
          if (list && list.data.conversations.length > 0) {
            convIdRef.current = list.data.conversations[0].id;
          } else {
            const created = await apiClient.createConversation({
              title: clean.slice(0, 48),
              mode: "assistant",
            });
            convIdRef.current = created.data.conversation.id;
          }
        }

        const res = await apiClient.sendMessage(convIdRef.current, {
          content: clean,
          inputType: "voice",
          deviceId: currentDeviceId,
        });

        await finalizeAssistantExecution(res.data, {
          deviceId: currentDeviceId,
          alreadyExecutedImmediate: executedImmediate,
          setRoute,
          showToast,
        });

        const reply = res.data.assistantMessage.content;
        window.dispatchEvent(
          new CustomEvent("nohby-jarvis-reply", {
            detail: {
              userMessage: res.data.userMessage,
              assistantMessage: res.data.assistantMessage,
            },
          })
        );

        if (
          typeof document !== "undefined" &&
          document.hidden &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("NohbyAI", {
            body: reply.slice(0, 140),
            icon: "/icon-white.png",
          });
        }

        emitJarvisState("speaking");
        setIsSpeaking(true);
        speakText(reply.slice(0, 360), {
          language: lang,
          voiceType: voiceSettings?.voiceType || "female",
          pitch: voiceSettings?.ttsPitch,
          rate: voiceSettings?.ttsRate ?? 1.0,
          onStart: () => {
            emitJarvisState("speaking");
            setIsSpeaking(true);
          },
          onEnd: () => {
            setIsSpeaking(false);
            busyRef.current = false;
            scheduleAwakeWindow(18000);
          },
        });
      } catch {
        busyRef.current = false;
        emitJarvisState("standby");
      }
    },
    [
      currentDeviceId,
      emitJarvisState,
      lang,
      scheduleAwakeWindow,
      setIsSpeaking,
      setRoute,
      showToast,
      voiceSettings,
    ]
  );

  const handleUtteranceChunk = useCallback(
    (deltaText: string) => {
      const delta = deltaText.trim();
      if (!delta || busyRef.current) return;

      const lowerDelta = delta.toLowerCase();
      if (
        lowerDelta.includes("i'm listening") ||
        lowerDelta.includes("how can i help you") ||
        lowerDelta.includes("ina ji")
      ) {
        return;
      }

      const primary = extractWakeWordCommand(delta, wakePhrase);
      const wakeMatch = !primary.matched ? extractWakeWordCommand(delta, "Sannu Nohby") : primary;

      if (wakeMatch.matched) {
        if (wakeMatch.command && wakeMatch.command.length >= 2) {
          playJarvisChime();
          awakeUntilRef.current = 0;
          processCommand(wakeMatch.command);
        } else {
          greetAndOpenListeningWindow();
        }
        return;
      }

      if (Date.now() < awakeUntilRef.current) {
        awakeUntilRef.current = 0;
        processCommand(delta);
      }
    },
    [greetAndOpenListeningWindow, processCommand, wakePhrase]
  );

  // Autonomous Answer Generation for Device Overlay
  const generateOverlayAnswer = useCallback(
    async (questionText: string) => {
      const cleanQ = questionText.trim();
      if (!cleanQ || overlayGeneratingRef.current) return;
      overlayGeneratingRef.current = true;

      const doc = overlayWindowRef.current?.document;
      const badgeEl = doc?.getElementById("meeting-badge");
      const aEl = doc?.getElementById("nohby-stealth-answer");
      const statusBadge = doc?.getElementById("overlay-status-badge");

      if (badgeEl) {
        badgeEl.textContent = "⚡ GENERATING FIRST-PERSON ANSWER...";
        badgeEl.style.color = "#00D4FF";
      }
      if (statusBadge) {
        statusBadge.textContent = "● THINKING...";
        statusBadge.style.color = "#00D4FF";
      }

      try {
        let answerText = "";
        let activeMeetingId =
          meetingSyncRef.current.meetingId || overlayMeetingSessionIdRef.current;

        if (!activeMeetingId) {
          try {
            const newM = await apiClient.createMeeting({
              title: "Stealth Background Copilot",
              meetingType: "interview",
              provider: "local_audio",
              stealthMode: true,
            });
            activeMeetingId = newM.data.meeting.id;
            overlayMeetingSessionIdRef.current = activeMeetingId;
          } catch {
            // Fall back to direct conversation
          }
        }

        if (activeMeetingId) {
          try {
            const segRes = await apiClient.appendMeetingTranscript(activeMeetingId, {
              speaker: "Interviewer",
              content: cleanQ,
            });
            if (segRes.data.transcript?.aiHint) {
              answerText = cleanFirstPersonAnswer(segRes.data.transcript.aiHint);
            }
          } catch {
            // Fall back below
          }
        }

        if (!answerText) {
          if (!convIdRef.current) {
            const list = await apiClient.listConversations({ limit: 1 }).catch(() => null);
            if (list && list.data.conversations.length > 0) {
              convIdRef.current = list.data.conversations[0].id;
            } else {
              const created = await apiClient.createConversation({
                title: "Stealth Q&A Session",
                mode: "assistant",
              });
              convIdRef.current = created.data.conversation.id;
            }
          }
          const prompt = `Interview Question: "${cleanQ}". Provide a direct, confident 2-3 sentence first-person response suitable for the candidate to read aloud immediately. Do not include markdown headers, asterisks, pleasantries, or preamble.`;
          const res = await apiClient.sendMessage(convIdRef.current, {
            content: prompt,
            inputType: "text",
            deviceId: currentDeviceId,
          });
          answerText = cleanFirstPersonAnswer(res.data.assistantMessage.content);
        }

        overlayCurrentAnswerRef.current = answerText;
        overlayAnswerLockedRef.current = true;
        meetingSyncRef.current.answer = answerText;
        meetingSyncRef.current.question = cleanQ;

        if (aEl) {
          aEl.textContent = answerText;
          aEl.scrollTop = 0;
        }
        if (badgeEl) {
          badgeEl.textContent = "🔒 ANSWER READY (LOCKED)";
          badgeEl.style.color = "#10B981";
        }
        if (statusBadge) {
          statusBadge.textContent = "🔒 ANSWER LOCKED";
          statusBadge.style.color = "#10B981";
        }

        // Broadcast sync to dashboard
        window.dispatchEvent(
          new CustomEvent("nohby-meeting-stealth-sync", {
            detail: {
              meetingId: activeMeetingId,
              isListening: overlayMicActiveRef.current,
              question: cleanQ,
              answer: answerText,
            },
          })
        );
      } catch {
        if (badgeEl) {
          badgeEl.textContent = "COULD NOT GENERATE";
          badgeEl.style.color = "#EF4444";
        }
        if (statusBadge) {
          statusBadge.textContent = "● LISTENING";
          statusBadge.style.color = "#10B981";
        }
      } finally {
        overlayGeneratingRef.current = false;
      }
    },
    [currentDeviceId]
  );

  // Autonomous Overlay Speech Recognition Loop
  const startOverlayListeningLoop = useCallback(() => {
    if (!overlayWindowRef.current || overlayWindowRef.current.closed) return;
    if (!overlayMicActiveRef.current) return;
    if (!isSpeechRecognitionSupported()) return;

    if (overlayVoiceHandleRef.current) {
      overlayVoiceHandleRef.current.cancel();
      overlayVoiceHandleRef.current = null;
    }

    const doc = overlayWindowRef.current.document;
    const qEl = doc.getElementById("nohby-stealth-question");
    const aEl = doc.getElementById("nohby-stealth-answer");
    const badgeEl = doc.getElementById("meeting-badge");
    const statusBadge = doc.getElementById("overlay-status-badge");
    const subEl = doc.getElementById("nohby-overlay-sub");

    overlayVoiceHandleRef.current = startLocalVoiceRecognition({
      language: lang,
      onInterim: (text: string) => {
        if (!overlayWindowRef.current || overlayWindowRef.current.closed) return;
        const clean = text.trim();
        if (!clean) return;

        if (activeOverlayTabRef.current === "meeting") {
          // If answer is locked, candidate is reading aloud: only check for explicit unlock phrases
          if (overlayAnswerLockedRef.current) {
            const low = clean.toLowerCase();
            if (
              low.includes("next question") ||
              low.includes("new question") ||
              low.includes("clear answer") ||
              low.includes("clear question")
            ) {
              overlayAnswerLockedRef.current = false;
              overlayCurrentQuestionRef.current = "";
              overlayCurrentAnswerRef.current = "";
              if (qEl) qEl.textContent = "Listening to interviewer / speaker... speak now";
              if (aEl) aEl.textContent = "Your first-person response will generate automatically here.";
              if (badgeEl) {
                badgeEl.textContent = "● LISTENING FOR NEXT QUESTION";
                badgeEl.style.color = "#10B981";
              }
              if (statusBadge) {
                statusBadge.textContent = "● LIVE LISTENING";
                statusBadge.style.color = "#10B981";
              }
            }
            // Candidate is reading the answer or speaking: DO NOT overwrite answer or question!
            return;
          }

          if (qEl) qEl.textContent = clean;
          overlayCurrentQuestionRef.current = clean;
          if (badgeEl && !overlayGeneratingRef.current) {
            badgeEl.textContent = "● LISTENING (LIVE STT)";
            badgeEl.style.color = "#00D4FF";
          }
          if (statusBadge && !overlayGeneratingRef.current) {
            statusBadge.textContent = "● LIVE LISTENING";
            statusBadge.style.color = "#10B981";
          }

          if (overlayDebounceTimerRef.current) {
            window.clearTimeout(overlayDebounceTimerRef.current);
          }
          const words = clean.split(/\s+/).length;
          if (words >= 4 && !overlayGeneratingRef.current) {
            overlayDebounceTimerRef.current = window.setTimeout(() => {
              void generateOverlayAnswer(clean);
            }, 1400);
          }
        } else {
          if (subEl) subEl.textContent = clean;
        }
      },
      onFinal: (fullText: string) => {
        if (!overlayWindowRef.current || overlayWindowRef.current.closed) return;
        if (overlayDebounceTimerRef.current) {
          window.clearTimeout(overlayDebounceTimerRef.current);
          overlayDebounceTimerRef.current = null;
        }
        const clean = fullText.trim();
        if (!clean) return;

        if (activeOverlayTabRef.current === "meeting") {
          // If answer is locked, do not trigger new answers while candidate is speaking
          if (overlayAnswerLockedRef.current) {
            const low = clean.toLowerCase();
            if (
              low.includes("next question") ||
              low.includes("new question") ||
              low.includes("clear answer") ||
              low.includes("clear question")
            ) {
              overlayAnswerLockedRef.current = false;
              overlayCurrentQuestionRef.current = "";
              overlayCurrentAnswerRef.current = "";
              if (qEl) qEl.textContent = "Listening to interviewer / speaker... speak now";
              if (aEl) aEl.textContent = "Your first-person response will generate automatically here.";
              if (badgeEl) {
                badgeEl.textContent = "● LISTENING FOR NEXT QUESTION";
                badgeEl.style.color = "#10B981";
              }
              if (statusBadge) {
                statusBadge.textContent = "● LIVE LISTENING";
                statusBadge.style.color = "#10B981";
              }
            }
            return;
          }

          if (qEl) qEl.textContent = clean;
          overlayCurrentQuestionRef.current = clean;
          const words = clean.split(/\s+/).length;
          if (words >= 3) {
            void generateOverlayAnswer(clean);
          }
        } else {
          const check = extractWakeWordCommand(clean, wakePhrase);
          const alt = !check.matched ? extractWakeWordCommand(clean, "Sannu Nohby") : check;
          if (alt.matched && alt.command) {
            processCommand(alt.command);
          } else if (alt.matched) {
            greetAndOpenListeningWindow();
          } else {
            processCommand(clean);
          }
        }
      },
      onError: (err: string) => {
        if (!overlayWindowRef.current || overlayWindowRef.current.closed) return;
        if (badgeEl) {
          if (err === "not-allowed" || err === "service-not-allowed") {
            badgeEl.textContent = "MIC PERMISSION REQUIRED";
            badgeEl.style.color = "#EF4444";
          }
        }
      },
      onEnd: () => {
        if (
          overlayWindowRef.current &&
          !overlayWindowRef.current.closed &&
          overlayMicActiveRef.current
        ) {
          if (overlayRestartTimerRef.current) {
            window.clearTimeout(overlayRestartTimerRef.current);
          }
          overlayRestartTimerRef.current = window.setTimeout(startOverlayListeningLoop, 300);
        }
      },
    });
  }, [
    generateOverlayAnswer,
    greetAndOpenListeningWindow,
    lang,
    processCommand,
    wakePhrase,
  ]);

  // Sync Always-On-Top OS Desktop Overlay Window (Document Picture-in-Picture or Companion Popup)
  const syncOverlayDom = useCallback(() => {
    const win = overlayWindowRef.current;
    if (!win || win.closed) return;
    const doc = win.document;
    const origin = window.location.origin;
    const isAnim = status !== "standby" || speechDetected;

    // 1. Assistant Tab Elements
    const orbImg = doc.getElementById("nohby-overlay-orb") as HTMLImageElement | null;
    const statusEl = doc.getElementById("nohby-overlay-status");
    const subEl = doc.getElementById("nohby-overlay-sub");

    if (orbImg) {
      const srcPath = isAnim ? orbStyle.gif : orbStyle.still;
      const fullSrc = srcPath.startsWith("http") ? srcPath : `${origin}${srcPath}`;
      if (orbImg.src !== fullSrc) orbImg.src = fullSrc;
    }
    if (statusEl) {
      statusEl.textContent =
        status === "speaking"
          ? "NohbyAI Speaking"
          : status === "thinking"
            ? "Thinking..."
            : status === "awake" || speechDetected
              ? "Listening — speak now"
              : `Say "${wakePhrase}"`;
    }
    if (subEl) {
      subEl.textContent = lastHeard || "Floating on device background across all apps";
    }

    // 2. Meeting Stealth Tab Elements
    const qEl = doc.getElementById("nohby-stealth-question");
    const aEl = doc.getElementById("nohby-stealth-answer");
    const badgeEl = doc.getElementById("meeting-badge");
    const statusBadge = doc.getElementById("overlay-status-badge");
    const waveEl = doc.getElementById("overlay-audio-wave");

    const m = meetingSyncRef.current;
    const activeQ = m.question || overlayCurrentQuestionRef.current;
    const activeA = m.answer || overlayCurrentAnswerRef.current;

    if (qEl && activeQ) {
      qEl.textContent = activeQ;
    }
    if (aEl && activeA) {
      aEl.textContent = activeA;
    }
    if (badgeEl && !overlayGeneratingRef.current) {
      if (activeA) {
        badgeEl.textContent = "✓ READY TO SPEAK";
        badgeEl.style.color = "#10B981";
      } else {
        badgeEl.textContent = overlayMicActiveRef.current ? "● LISTENING" : "⏸ STANDBY";
        badgeEl.style.color = overlayMicActiveRef.current ? "#10B981" : "#F59E0B";
      }
    }
    if (statusBadge && !overlayGeneratingRef.current) {
      statusBadge.textContent = overlayMicActiveRef.current ? "● LIVE LISTENING" : "⏸ MIC PAUSED";
      statusBadge.style.color = overlayMicActiveRef.current ? "#10B981" : "#F59E0B";
    }
    if (waveEl) {
      if (overlayMicActiveRef.current) {
        waveEl.classList.add("active");
      } else {
        waveEl.classList.remove("active");
      }
    }

    // 3. Tab visibility sync
    const activeTab = activeOverlayTabRef.current;
    const tabAssistant = doc.getElementById("tab-assistant");
    const tabMeeting = doc.getElementById("tab-meeting");
    const viewAssistant = doc.getElementById("view-assistant");
    const viewMeeting = doc.getElementById("view-meeting");

    if (tabAssistant && tabMeeting && viewAssistant && viewMeeting) {
      if (activeTab === "meeting") {
        tabAssistant.classList.remove("active");
        tabMeeting.classList.add("active");
        viewAssistant.classList.remove("active");
        viewMeeting.classList.add("active");
      } else {
        tabMeeting.classList.remove("active");
        tabAssistant.classList.add("active");
        viewMeeting.classList.remove("active");
        viewAssistant.classList.add("active");
      }
    }
  }, [lastHeard, orbStyle.gif, orbStyle.still, speechDetected, status, wakePhrase]);

  useEffect(() => {
    syncOverlayDom();
  }, [syncOverlayDom]);

  const toggleDeviceDesktopOverlay = async (preferredMode?: "assistant" | "meeting") => {
    if (preferredMode) {
      activeOverlayTabRef.current = preferredMode;
    }

    // 1. Native Tauri Desktop App Always-On-Top background mode
    if (typeof window !== "undefined" && window.__TAURI__?.core?.invoke) {
      try {
        const next = !desktopPinned;
        await window.__TAURI__.core.invoke<boolean>("set_stealth_mode", { enabled: next });
        setDesktopPinned(next);
        showToast(
          "success",
          next
            ? "NohbyAI pinned on top of your device desktop background (Invisible in Screen Share)."
            : "Unpinned from device desktop background."
        );
        return;
      } catch {
        // Fall through to web PiP
      }
    }

    // 2. If already open and no mode switch requested, toggle off
    if (overlayWindowRef.current && !overlayWindowRef.current.closed) {
      if (!preferredMode || preferredMode === activeOverlayTabRef.current) {
        overlayVoiceHandleRef.current?.cancel();
        overlayVoiceHandleRef.current = null;
        overlayWindowRef.current.close();
        overlayWindowRef.current = null;
        setDesktopPinned(false);
        window.dispatchEvent(new CustomEvent("nohby-manual-mic", { detail: { active: false } }));
        return;
      } else {
        activeOverlayTabRef.current = preferredMode;
        syncOverlayDom();
        overlayWindowRef.current.focus?.();
        return;
      }
    }

    try {
      let pipWin: Window | null = null;
      if (window.documentPictureInPicture?.requestWindow) {
        pipWin = await window.documentPictureInPicture.requestWindow({
          width: 520,
          height: 340,
        });
      } else {
        pipWin = window.open(
          "",
          "NohbyDeviceOverlay",
          "width=520,height=340,menubar=no,toolbar=no,location=no,status=no,resizable=yes"
        );
      }

      if (!pipWin) {
        showToast("error", "Allow popups to pin NohbyAI onto your device background.");
        return;
      }

      overlayWindowRef.current = pipWin;
      overlayMicActiveRef.current = true;
      setDesktopPinned(true);
      window.dispatchEvent(new CustomEvent("nohby-manual-mic", { detail: { active: true } }));

      const origin = window.location.origin;
      const initialOrb = `${origin}${orbStyle.still}`;
      const activeTab = activeOverlayTabRef.current;
      const initialQ =
        meetingSyncRef.current.question ||
        overlayCurrentQuestionRef.current ||
        "Listening to interviewer / speaker... speak now";
      const initialA =
        meetingSyncRef.current.answer ||
        overlayCurrentAnswerRef.current ||
        "Your first-person response will generate automatically here.";

      pipWin.document.open();
      pipWin.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Nohby ONE — Device Stealth Copilot</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #070B14;
      color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      user-select: none;
      border: 1px solid rgba(0, 212, 255, 0.28);
    }
    .header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: #05080F;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      gap: 8px;
    }
    .tab-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: #94A3B8;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .tab-btn.active {
      background: rgba(0, 212, 255, 0.15);
      border-color: rgba(0, 212, 255, 0.4);
      color: #00D4FF;
    }
    .tab-btn:hover:not(.active) {
      color: #FFFFFF;
      background: rgba(255, 255, 255, 0.05);
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .audio-wave {
      display: flex;
      align-items: center;
      gap: 2.5px;
      height: 14px;
    }
    .audio-bar {
      width: 2.5px;
      height: 4px;
      background: #00D4FF;
      border-radius: 2px;
      transition: height 0.1s ease;
    }
    .audio-wave.active .audio-bar:nth-child(1) { animation: wave 0.8s ease-in-out infinite 0.1s; }
    .audio-wave.active .audio-bar:nth-child(2) { animation: wave 0.7s ease-in-out infinite 0.2s; }
    .audio-wave.active .audio-bar:nth-child(3) { animation: wave 0.9s ease-in-out infinite 0.05s; }
    .audio-wave.active .audio-bar:nth-child(4) { animation: wave 0.6s ease-in-out infinite 0.25s; }
    .audio-wave.active .audio-bar:nth-child(5) { animation: wave 0.85s ease-in-out infinite 0.15s; }
    .audio-wave.active .audio-bar:nth-child(6) { animation: wave 0.75s ease-in-out infinite 0.3s; }
    .audio-wave.active .audio-bar:nth-child(7) { animation: wave 0.95s ease-in-out infinite 0.1s; }
    .audio-wave.active .audio-bar:nth-child(8) { animation: wave 0.65s ease-in-out infinite 0.2s; }
    @keyframes wave {
      0%, 100% { height: 4px; opacity: 0.4; }
      50% { height: 14px; opacity: 1; }
    }
    .status-badge {
      font-size: 10px;
      font-weight: 700;
      color: #10B981;
      letter-spacing: 0.02em;
    }
    .shield-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.03em;
      color: #10B981;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 2px 7px;
      border-radius: 999px;
      text-transform: uppercase;
    }
    .btn-close {
      background: transparent;
      border: none;
      color: #64748B;
      cursor: pointer;
      font-size: 13px;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .btn-close:hover {
      color: #EF4444;
      background: rgba(239, 68, 68, 0.12);
    }
    .content-area {
      flex: 1;
      padding: 10px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }
    .view-panel {
      display: none;
      flex-direction: column;
      height: 100%;
    }
    .view-panel.active {
      display: flex;
    }

    /* Assistant View */
    .assistant-card {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #0D1424;
      border: 1px solid rgba(0, 212, 255, 0.22);
      border-radius: 12px;
      padding: 14px;
      cursor: pointer;
    }
    .orb-box {
      width: 52px;
      height: 52px;
      border-radius: 999px;
      overflow: hidden;
      border: 1.5px solid rgba(0, 212, 255, 0.7);
      box-shadow: 0 0 16px rgba(0, 212, 255, 0.35);
      flex-shrink: 0;
    }
    .orb-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scale(1.3);
    }
    .assistant-meta {
      flex: 1;
      min-width: 0;
    }
    .status-line {
      font-size: 13px;
      font-weight: 700;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .live-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10B981;
      box-shadow: 0 0 8px #10B981;
    }
    .heard-text {
      font-size: 11.5px;
      color: #94A3B8;
      margin-top: 4px;
      line-height: 1.35;
      max-height: 40px;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .assistant-quick-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }

    /* Meeting Stealth View */
    .meeting-box {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1;
    }
    .card-block {
      background: #0D1424;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 8px 10px;
    }
    .card-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748B;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .q-text {
      font-size: 12.5px;
      color: #CBD5E1;
      line-height: 1.45;
      max-height: 52px;
      overflow-y: auto;
    }
    .a-card {
      flex: 1;
      background: #0F182C;
      border: 1px solid rgba(0, 212, 255, 0.35);
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
    }
    .a-text {
      flex: 1;
      font-size: 13px;
      color: #FFFFFF;
      line-height: 1.5;
      overflow-y: auto;
      max-height: 115px;
    }
    .meeting-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      margin-top: 8px;
      flex-wrap: wrap;
    }
    .btn-action {
      background: rgba(0, 212, 255, 0.12);
      border: 1px solid rgba(0, 212, 255, 0.3);
      color: #00D4FF;
      font-size: 10.5px;
      font-weight: 600;
      padding: 5px 10px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 0.15s ease;
    }
    .btn-action:hover {
      background: rgba(0, 212, 255, 0.25);
    }
    .btn-action.copied {
      background: rgba(16, 185, 129, 0.2);
      border-color: rgba(16, 185, 129, 0.4);
      color: #10B981;
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="tab-group">
      <button id="tab-assistant" class="tab-btn ${activeTab === "assistant" ? "active" : ""}">🎙️ Assistant</button>
      <button id="tab-meeting" class="tab-btn ${activeTab === "meeting" ? "active" : ""}">🛡️ Stealth Q&A</button>
    </div>
    <div class="header-right">
      <div class="audio-wave active" id="overlay-audio-wave" title="Live audio activity">
        <span class="audio-bar"></span>
        <span class="audio-bar"></span>
        <span class="audio-bar"></span>
        <span class="audio-bar"></span>
        <span class="audio-bar"></span>
        <span class="audio-bar"></span>
        <span class="audio-bar"></span>
        <span class="audio-bar"></span>
      </div>
      <span class="status-badge" id="overlay-status-badge">● LIVE LISTENING</span>
      <span class="shield-badge" title="Window excluded from screen share / recordings">🛡️ STEALTH</span>
      <button id="btn-close" class="btn-close" title="Close floating desktop overlay">✕</button>
    </div>
  </div>

  <div class="content-area">
    <!-- Assistant View -->
    <div id="view-assistant" class="view-panel ${activeTab === "assistant" ? "active" : ""}">
      <div class="assistant-card" id="assistant-trigger" title="Click to speak or say Hey Nohby">
        <div class="orb-box">
          <img id="nohby-overlay-orb" src="${initialOrb}" alt="NohbyAI" />
        </div>
        <div class="assistant-meta">
          <div class="status-line">
            <span class="live-dot" id="nohby-live-dot"></span>
            <span id="nohby-overlay-status">Say "${wakePhrase}" or tap to speak</span>
          </div>
          <div class="heard-text" id="nohby-overlay-sub">Floating on device background across all apps</div>
        </div>
      </div>
      <div class="assistant-quick-actions">
        <button id="btn-assistant-speak" class="btn-action">🎙️ Tap to Speak</button>
        <button id="btn-assistant-tasks" class="btn-action">📋 Tasks</button>
        <button id="btn-assistant-notes" class="btn-action">📝 Notes</button>
      </div>
    </div>

    <!-- Meeting Stealth View -->
    <div id="view-meeting" class="view-panel ${activeTab === "meeting" ? "active" : ""}">
      <div class="meeting-box">
        <div class="card-block">
          <div class="card-label">
            <span>Caught Question (Live)</span>
            <span style="color: #64748B;">INTERVIEWER / SPEAKER</span>
          </div>
          <div class="q-text" id="nohby-stealth-question">${initialQ}</div>
        </div>
        <div class="a-card">
          <div class="card-label">
            <span>Your First-Person Response</span>
            <span id="meeting-badge" style="color: #10B981;">NohbyAI Core</span>
          </div>
          <div class="a-text" id="nohby-stealth-answer">${initialA}</div>
          <div class="meeting-actions">
            <button id="btn-next-question" class="btn-action" style="border-color: rgba(16, 185, 129, 0.5); color: #10B981; font-weight: 700;">🔄 Next Question</button>
            <button id="btn-whisper" class="btn-action">🔊 Whisper</button>
            <button id="btn-copy-answer" class="btn-action">📋 Copy</button>
            <button id="btn-toggle-mic" class="btn-action">🎙️ Pause Mic</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`);
      pipWin.document.close();

      // Setup tab handlers
      const tabAssistant = pipWin.document.getElementById("tab-assistant");
      const tabMeeting = pipWin.document.getElementById("tab-meeting");
      const viewAssistant = pipWin.document.getElementById("view-assistant");
      const viewMeeting = pipWin.document.getElementById("view-meeting");

      tabAssistant?.addEventListener("click", () => {
        activeOverlayTabRef.current = "assistant";
        tabAssistant.classList.add("active");
        tabMeeting?.classList.remove("active");
        viewAssistant?.classList.add("active");
        viewMeeting?.classList.remove("active");
      });

      tabMeeting?.addEventListener("click", () => {
        activeOverlayTabRef.current = "meeting";
        tabMeeting.classList.add("active");
        tabAssistant?.classList.remove("active");
        viewMeeting?.classList.add("active");
        viewAssistant?.classList.remove("active");
      });

      // Setup assistant triggers
      const triggerEl = pipWin.document.getElementById("assistant-trigger");
      triggerEl?.addEventListener("click", () => {
        greetAndOpenListeningWindow();
      });
      const speakBtn = pipWin.document.getElementById("btn-assistant-speak");
      speakBtn?.addEventListener("click", () => {
        greetAndOpenListeningWindow();
      });
      const tasksBtn = pipWin.document.getElementById("btn-assistant-tasks");
      tasksBtn?.addEventListener("click", () => {
        setRoute("tasks");
      });
      const notesBtn = pipWin.document.getElementById("btn-assistant-notes");
      notesBtn?.addEventListener("click", () => {
        setRoute("meetings");
      });

      // Setup Whisper / Read Aloud
      const whisperBtn = pipWin.document.getElementById("btn-whisper");
      whisperBtn?.addEventListener("click", () => {
        const text =
          overlayCurrentAnswerRef.current ||
          pipWin?.document.getElementById("nohby-stealth-answer")?.textContent;
        if (text && !text.startsWith("Your first-person response")) {
          if (whisperBtn) whisperBtn.textContent = "🔊 Whispering...";
          speakText(text, {
            language: lang,
            voiceType: voiceSettings?.voiceType || "female",
            pitch: voiceSettings?.ttsPitch,
            rate: voiceSettings?.ttsRate ?? 1.0,
            onEnd: () => {
              if (whisperBtn) whisperBtn.textContent = "🔊 Whisper Answer";
            },
          });
        }
      });

      // Setup copy answer
      const copyBtn = pipWin.document.getElementById("btn-copy-answer");
      copyBtn?.addEventListener("click", () => {
        const text =
          overlayCurrentAnswerRef.current ||
          pipWin?.document.getElementById("nohby-stealth-answer")?.textContent;
        if (text && !text.startsWith("Your first-person response")) {
          navigator.clipboard
            .writeText(text)
            .then(() => {
              if (copyBtn) {
                copyBtn.textContent = "✓ Copied!";
                copyBtn.classList.add("copied");
                setTimeout(() => {
                  if (copyBtn) {
                    copyBtn.textContent = "📋 Copy Answer";
                    copyBtn.classList.remove("copied");
                  }
                }, 1600);
              }
            })
            .catch(() => {});
        }
      });

      // Setup Next Question / Unlock
      const nextBtn = pipWin.document.getElementById("btn-next-question");
      nextBtn?.addEventListener("click", () => {
        overlayAnswerLockedRef.current = false;
        overlayCurrentQuestionRef.current = "";
        overlayCurrentAnswerRef.current = "";
        meetingSyncRef.current.question = "";
        meetingSyncRef.current.answer = "";
        const qEl = pipWin?.document.getElementById("nohby-stealth-question");
        const aEl = pipWin?.document.getElementById("nohby-stealth-answer");
        const badgeEl = pipWin?.document.getElementById("meeting-badge");
        const statusBadge = pipWin?.document.getElementById("overlay-status-badge");
        if (qEl) qEl.textContent = "Listening to interviewer / speaker... speak now";
        if (aEl)
          aEl.textContent = "Your first-person response will generate automatically here.";
        if (badgeEl) {
          badgeEl.textContent = "● LISTENING FOR NEXT QUESTION";
          badgeEl.style.color = "#10B981";
        }
        if (statusBadge) {
          statusBadge.textContent = "● LIVE LISTENING";
          statusBadge.style.color = "#10B981";
        }
      });

      // Setup mic toggle
      const micBtn = pipWin.document.getElementById("btn-toggle-mic");
      micBtn?.addEventListener("click", () => {
        overlayMicActiveRef.current = !overlayMicActiveRef.current;
        const statusBadge = pipWin?.document.getElementById("overlay-status-badge");
        const waveEl = pipWin?.document.getElementById("overlay-audio-wave");
        const badgeEl = pipWin?.document.getElementById("meeting-badge");

        if (overlayMicActiveRef.current) {
          startOverlayListeningLoop();
          if (micBtn) micBtn.textContent = "🎙️ Pause Mic";
          if (statusBadge) {
            statusBadge.textContent = "● LIVE LISTENING";
            statusBadge.style.color = "#10B981";
          }
          if (badgeEl && !overlayCurrentAnswerRef.current) {
            badgeEl.textContent = "● LISTENING";
            badgeEl.style.color = "#10B981";
          }
          waveEl?.classList.add("active");
        } else {
          overlayVoiceHandleRef.current?.cancel();
          overlayVoiceHandleRef.current = null;
          if (micBtn) micBtn.textContent = "🎙️ Resume Mic";
          if (statusBadge) {
            statusBadge.textContent = "⏸ MIC PAUSED";
            statusBadge.style.color = "#F59E0B";
          }
          if (badgeEl && !overlayCurrentAnswerRef.current) {
            badgeEl.textContent = "⏸ PAUSED";
            badgeEl.style.color = "#F59E0B";
          }
          waveEl?.classList.remove("active");
        }
      });

      // Setup close button
      const closeBtn = pipWin.document.getElementById("btn-close");
      closeBtn?.addEventListener("click", () => {
        overlayVoiceHandleRef.current?.cancel();
        overlayVoiceHandleRef.current = null;
        overlayWindowRef.current?.close();
        overlayWindowRef.current = null;
        setDesktopPinned(false);
        window.dispatchEvent(new CustomEvent("nohby-manual-mic", { detail: { active: false } }));
      });

      pipWin.addEventListener("pagehide", () => {
        overlayVoiceHandleRef.current?.cancel();
        overlayVoiceHandleRef.current = null;
        overlayWindowRef.current = null;
        setDesktopPinned(false);
        window.dispatchEvent(new CustomEvent("nohby-manual-mic", { detail: { active: false } }));
      });

      // Immediately launch live speech recognition loop for the overlay window
      startOverlayListeningLoop();
      syncOverlayDom();

      showToast(
        "success",
        "Nohby ONE is actively listening and floating on your device background (Invisible in Screen Share)."
      );
    } catch {
      showToast("error", "Could not open floating desktop overlay window.");
    }
  };

  useEffect(() => {
    const onMeetingSync = (e: Event) => {
      const detail = (e as CustomEvent<{
        meetingTitle?: string;
        isListening?: boolean;
        question?: string;
        answer?: string;
        autoSwitchToMeeting?: boolean;
      }>).detail;
      if (!detail) return;
      meetingSyncRef.current = {
        meetingTitle: detail.meetingTitle ?? meetingSyncRef.current.meetingTitle,
        isListening: detail.isListening ?? meetingSyncRef.current.isListening,
        question: detail.question ?? meetingSyncRef.current.question,
        answer: detail.answer ?? meetingSyncRef.current.answer,
      };
      if (detail.autoSwitchToMeeting || (detail.question && detail.question.length > 5)) {
        activeOverlayTabRef.current = "meeting";
      }
      syncOverlayDom();
    };

    const onLaunchOverlay = (e: Event) => {
      const detail = (e as CustomEvent<{ mode?: "assistant" | "meeting" }>).detail;
      const targetMode = detail?.mode || "assistant";
      activeOverlayTabRef.current = targetMode;
      if (!overlayWindowRef.current || overlayWindowRef.current.closed) {
        toggleDeviceDesktopOverlay(targetMode);
      } else {
        syncOverlayDom();
        overlayWindowRef.current.focus?.();
      }
    };

    window.addEventListener("nohby-meeting-stealth-sync", onMeetingSync);
    window.addEventListener("nohby-launch-device-overlay", onLaunchOverlay);

    // Auto-launch on startup if configured in settings
    try {
      if (
        enabled &&
        localStorage.getItem("nohby_device_overlay_auto_launch") === "true" &&
        (!overlayWindowRef.current || overlayWindowRef.current.closed)
      ) {
        toggleDeviceDesktopOverlay("assistant");
      }
    } catch {
      // ignore
    }

    return () => {
      window.removeEventListener("nohby-meeting-stealth-sync", onMeetingSync);
      window.removeEventListener("nohby-launch-device-overlay", onLaunchOverlay);
    };
  }, [enabled, syncOverlayDom]);

  useEffect(() => {
    if (!enabled || manualMicActive) {
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      if (interimCommitTimerRef.current) window.clearTimeout(interimCommitTimerRef.current);
      handleRef.current?.cancel();
      handleRef.current = null;
      if (!enabled) {
        emitJarvisState("standby");
      }
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      return;
    }

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    let unmounted = false;

    const startLoop = () => {
      if (unmounted || manualMicActive) return;
      lastProcessedRef.current = "";
      handleRef.current = startLocalVoiceRecognition({
        language: lang,
        onInterim: (text: string) => {
          if (busyRef.current) return;
          if (text.trim()) {
            triggerSpeechPulse();
          }

          const prev = lastProcessedRef.current;
          const pendingDelta = text.startsWith(prev)
            ? text.slice(prev.length).trim()
            : text.trim();
          if (!pendingDelta) return;

          const check = extractWakeWordCommand(pendingDelta, wakePhrase);
          const altCheck = !check.matched
            ? extractWakeWordCommand(pendingDelta, "Sannu Nohby")
            : check;
          const isAwakeWindow = Date.now() < awakeUntilRef.current;

          if (altCheck.matched || isAwakeWindow) {
            setLastHeard(altCheck.command || pendingDelta);
            if (interimCommitTimerRef.current) {
              window.clearTimeout(interimCommitTimerRef.current);
            }
            interimCommitTimerRef.current = window.setTimeout(() => {
              if (unmounted || busyRef.current) return;
              lastProcessedRef.current = text;
              handleUtteranceChunk(pendingDelta);
            }, 850);
          }
        },
        onFinal: (fullText: string) => {
          if (interimCommitTimerRef.current) {
            window.clearTimeout(interimCommitTimerRef.current);
            interimCommitTimerRef.current = null;
          }
          if (busyRef.current) return;
          const prev = lastProcessedRef.current;
          const delta = fullText.startsWith(prev)
            ? fullText.slice(prev.length).trim()
            : fullText.trim();
          lastProcessedRef.current = fullText;
          if (!delta) return;

          handleUtteranceChunk(delta);
        },
        onError: (err: string) => {
          if (err === "not-allowed" || err === "service-not-allowed") {
            showToast(
              "error",
              "Microphone permission is required for hands-free 'Hey Nohby' background listening."
            );
            updateVoiceSettings({ wakeWordEnabled: false }).catch(() => {});
          }
        },
        onEnd: () => {
          if (!unmounted && enabled && !manualMicActive) {
            restartTimerRef.current = window.setTimeout(startLoop, 400);
          }
        },
      });
    };

    startLoop();

    return () => {
      unmounted = true;
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      if (speechPulseTimerRef.current) window.clearTimeout(speechPulseTimerRef.current);
      if (interimCommitTimerRef.current) window.clearTimeout(interimCommitTimerRef.current);
      handleRef.current?.cancel();
      handleRef.current = null;
    };
  }, [
    emitJarvisState,
    enabled,
    handleUtteranceChunk,
    lang,
    manualMicActive,
    showToast,
    triggerSpeechPulse,
    updateVoiceSettings,
    wakePhrase,
  ]);

  if (!enabled) {
    return null;
  }

  const isActive = status !== "standby";
  const isAnimating = isActive || speechDetected;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title={`NohbyAI Jarvis Mode — Say "${wakePhrase}" (Click to expand)`}
        aria-label="Expand NohbyAI Jarvis Mode"
        className={`dropdown-surface fixed bottom-16 right-4 z-40 flex items-center justify-center rounded-full p-1 transition duration-300 lg:bottom-4 ${
          orbStyle.shape === "wide" ? "h-10 w-16" : "h-11 w-11"
        } ${
          isAnimating
            ? "scale-105 border-[#00D4FF]/80 shadow-[0_0_24px_rgba(0,212,255,0.55)] ring-2 ring-[#00D4FF]/30"
            : "hover:scale-105 hover:border-[#00D4FF]/60"
        }`}
      >
        <span className="relative h-full w-full overflow-hidden rounded-full">
          <img
            src={isAnimating ? orbStyle.gif : orbStyle.still}
            alt="NohbyAI Jarvis Mode"
            className={`h-full w-full rounded-full object-cover ${
              orbStyle.shape === "wide" ? "" : "scale-[1.34]"
            }`}
          />
        </span>
        <span
          className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-white/80 ${
            isAnimating ? "animate-ping bg-[#00D4FF]" : "bg-emerald-400"
          }`}
        />
      </button>
    );
  }

  return (
    <div
      className={`dropdown-surface fixed bottom-16 right-4 z-40 flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-2.5 backdrop-blur-md transition duration-300 lg:bottom-4 ${
        isAnimating
          ? "border-[#00D4FF]/70 shadow-[0_8px_30px_rgba(0,180,255,0.35)]"
          : "border-[#00D4FF]/35"
      }`}
    >
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        title="Minimize to icon"
        aria-label="Minimize NohbyAI Jarvis pill to icon"
        className={`relative shrink-0 overflow-hidden rounded-full border transition ${
          orbStyle.shape === "wide" ? "h-8 w-14" : "h-8 w-8"
        } ${
          isAnimating
            ? "border-[#00D4FF] shadow-[0_0_14px_rgba(0,212,255,0.55)]"
            : "border-[#00D4FF]/45 hover:border-[#00D4FF]"
        }`}
      >
        <img
          src={isAnimating ? orbStyle.gif : orbStyle.still}
          alt="NohbyAI Jarvis Mode"
          className={`h-full w-full rounded-full object-cover ${
            orbStyle.shape === "wide" ? "" : "scale-[1.34]"
          }`}
        />
      </button>

      <button
        type="button"
        onClick={greetAndOpenListeningWindow}
        title="Click or say 'Hey Nohby' to talk"
        className="min-w-0 pr-0.5 text-left"
      >
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
          <Radio
            className={`h-3 w-3 shrink-0 ${
              isAnimating ? "animate-pulse text-[#00D4FF]" : "text-emerald-500"
            }`}
          />
          <span className="truncate">
            {status === "speaking"
              ? "NohbyAI Speaking"
              : status === "thinking"
                ? "Thinking..."
                : status === "awake" || speechDetected
                  ? "Listening..."
                  : `Say "${wakePhrase}"`}
          </span>
        </p>
        {lastHeard && isActive && (
          <p className="max-w-[160px] truncate text-[10px] text-zinc-400">{lastHeard}</p>
        )}
      </button>

      <button
        type="button"
        onClick={() => toggleDeviceDesktopOverlay()}
        className={`relative rounded-full p-1.5 transition ${
          desktopPinned
            ? "bg-[#00D4FF]/25 text-[#00D4FF] ring-1 ring-[#00D4FF]/70 shadow-[0_0_12px_rgba(0,212,255,0.4)]"
            : "text-zinc-400 hover:bg-black/[0.06] hover:text-[#00D4FF] dark:hover:bg-white/[0.08]"
        }`}
        title={
          desktopPinned
            ? "Desktop Background Active (Invisible in Screen Share) — Click to dock"
            : "Float on Device Background (Always On Top across all apps • Invisible in Screen Share)"
        }
        aria-label="Float widget onto device desktop background"
      >
        <ShieldCheck className={`h-4 w-4 ${desktopPinned ? "text-[#00D4FF]" : ""}`} />
        {desktopPinned && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#0A0F1D]" />
        )}
      </button>

      <button
        type="button"
        onClick={() => setCollapsed(true)}
        className="rounded-full p-1 text-zinc-400 transition hover:bg-black/[0.06] hover:text-white dark:hover:bg-white/[0.08]"
        title="Collapse to icon only"
        aria-label="Collapse Jarvis widget"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => {
          stopSpeaking();
          if (overlayWindowRef.current && !overlayWindowRef.current.closed) {
            overlayWindowRef.current.close();
          }
          updateVoiceSettings({ wakeWordEnabled: false }).catch(() => {});
        }}
        className="rounded-full p-1 text-zinc-400 transition hover:bg-rose-500/15 hover:text-rose-500"
        title="Turn off hands-free Jarvis Mode"
        aria-label="Turn off Jarvis Mode"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
