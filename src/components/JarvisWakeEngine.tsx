import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Radio, X } from "lucide-react";

import { apiClient } from "../lib/api";
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
    activeRoute,
    currentDeviceId,
    voiceSettings,
    loadVoiceSettings,
    updateVoiceSettings,
    setIsSpeaking,
    showToast,
  } = useAppStore();

  const [status, setStatus] = useState<"standby" | "awake" | "thinking" | "speaking">("standby");
  const [lastHeard, setLastHeard] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [orbStyle, setOrbStyle] = useState<OrbStyleOption>(() => getSelectedOrbStyle());
  const [speechDetected, setSpeechDetected] = useState(false);

  const handleRef = useRef<VoiceSessionHandle | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const speechPulseTimerRef = useRef<number | null>(null);
  const awakeUntilRef = useRef<number>(0);
  const busyRef = useRef<boolean>(false);
  const lastProcessedRef = useRef<string>("");
  const convIdRef = useRef<string | null>(null);

  const enabled = phase === "ready" && Boolean(voiceSettings?.wakeWordEnabled);
  const wakePhrase = voiceSettings?.wakeWordPhrase || "Hey Nohby";
  const lang = voiceSettings?.inputLanguage || "en-US";
  const isHausa = lang.toLowerCase().startsWith("ha");

  useEffect(() => {
    const onOrbChange = () => setOrbStyle(getSelectedOrbStyle());
    window.addEventListener("nohby-orb-style-change", onOrbChange);
    return () => window.removeEventListener("nohby-orb-style-change", onOrbChange);
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

  const processCommand = useCallback(
    async (commandText: string) => {
      const clean = commandText.trim();
      if (!clean || busyRef.current) return;

      busyRef.current = true;
      setLastHeard(clean);
      emitJarvisState("thinking");

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

        const reply = res.data.assistantMessage.content;
        window.dispatchEvent(
          new CustomEvent("nohby-jarvis-reply", {
            detail: {
              userMessage: res.data.userMessage,
              assistantMessage: res.data.assistantMessage,
            },
          })
        );

        // Send background desktop notification if user is in another tab/window
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
        speakText(reply.slice(0, 340), {
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
            emitJarvisState("standby");
          },
        });
      } catch {
        busyRef.current = false;
        emitJarvisState("standby");
      }
    },
    [currentDeviceId, emitJarvisState, lang, setIsSpeaking, voiceSettings]
  );

  useEffect(() => {
    if (!enabled) {
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      handleRef.current?.cancel();
      handleRef.current = null;
      emitJarvisState("standby");
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      return;
    }

    // Request non-blocking notification permission for background replies
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    let unmounted = false;

    const startLoop = () => {
      if (unmounted) return;
      lastProcessedRef.current = "";
      handleRef.current = startLocalVoiceRecognition({
        language: lang,
        onInterim: (text: string) => {
          if (text.trim()) {
            triggerSpeechPulse();
          }
          const check = extractWakeWordCommand(text, wakePhrase);
          const altCheck = !check.matched ? extractWakeWordCommand(text, "Sannu Nohby") : check;
          if (altCheck.matched) {
            emitJarvisState("awake");
            setLastHeard(altCheck.command || wakePhrase);
          }
        },
        onFinal: (fullText: string) => {
          if (busyRef.current) return;
          const prev = lastProcessedRef.current;
          const delta = fullText.startsWith(prev)
            ? fullText.slice(prev.length).trim()
            : fullText.trim();
          lastProcessedRef.current = fullText;
          if (!delta) return;

          const primary = extractWakeWordCommand(delta, wakePhrase);
          const hausaWake = !primary.matched ? extractWakeWordCommand(delta, "Sannu Nohby") : primary;
          const shortWake = !hausaWake.matched ? extractWakeWordCommand(delta, "Hey Nobi") : hausaWake;

          if (shortWake.matched) {
            playJarvisChime();
            if (shortWake.command) {
              awakeUntilRef.current = 0;
              processCommand(shortWake.command);
            } else {
              // User said just "Hey Nohby" — greet & open 12s command window
              awakeUntilRef.current = Date.now() + 12000;
              emitJarvisState("speaking");
              const ack = isHausa ? "Na'am, ina ji." : "Yes, I'm listening.";
              speakText(ack, {
                language: lang,
                voiceType: voiceSettings?.voiceType || "female",
                pitch: voiceSettings?.ttsPitch,
                rate: voiceSettings?.ttsRate ?? 1.0,
                onStart: () => emitJarvisState("speaking"),
                onEnd: () => emitJarvisState("awake"),
              });
            }
            return;
          }

          // If inside awake window after saying "Hey Nohby", accept command directly
          if (Date.now() < awakeUntilRef.current) {
            awakeUntilRef.current = 0;
            processCommand(delta);
          }
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
          if (!unmounted && enabled) {
            restartTimerRef.current = window.setTimeout(startLoop, 450);
          }
        },
      });
    };

    startLoop();

    return () => {
      unmounted = true;
      if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current);
      if (speechPulseTimerRef.current) window.clearTimeout(speechPulseTimerRef.current);
      handleRef.current?.cancel();
      handleRef.current = null;
    };
  }, [
    enabled,
    isHausa,
    lang,
    processCommand,
    showToast,
    triggerSpeechPulse,
    updateVoiceSettings,
    voiceSettings?.ttsPitch,
    voiceSettings?.ttsRate,
    voiceSettings?.voiceType,
    wakePhrase,
    emitJarvisState,
  ]);

  if (!enabled || activeRoute === "home") {
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
        className={`dropdown-surface fixed bottom-16 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full p-1 transition duration-300 lg:bottom-4 ${
          isAnimating
            ? "scale-105 border-[#00D4FF]/80 shadow-[0_0_24px_rgba(0,212,255,0.55)] ring-2 ring-[#00D4FF]/30"
            : "hover:scale-105 hover:border-[#00D4FF]/60"
        }`}
      >
        <span className="relative h-full w-full overflow-hidden rounded-full">
          <img
            src={isAnimating ? orbStyle.gif : orbStyle.still}
            alt="NohbyAI Jarvis Mode"
            className="h-full w-full scale-[1.34] rounded-full object-cover"
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
        className={`relative h-8 w-8 shrink-0 overflow-hidden rounded-full border transition ${
          isAnimating
            ? "border-[#00D4FF] shadow-[0_0_14px_rgba(0,212,255,0.55)]"
            : "border-[#00D4FF]/45 hover:border-[#00D4FF]"
        }`}
      >
        <img
          src={isAnimating ? orbStyle.gif : orbStyle.still}
          alt="NohbyAI Jarvis Mode"
          className="h-full w-full scale-[1.34] rounded-full object-cover"
        />
      </button>

      <div className="min-w-0 pr-0.5">
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
      </div>

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
