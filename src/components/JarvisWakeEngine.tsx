import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, PictureInPicture2, Radio, X } from "lucide-react";

import { apiClient } from "../lib/api";
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

  // Sync Always-On-Top OS Desktop Overlay Window (Document Picture-in-Picture or Companion Popup)
  const syncOverlayDom = useCallback(() => {
    const win = overlayWindowRef.current;
    if (!win || win.closed) return;
    const doc = win.document;
    const orbImg = doc.getElementById("nohby-overlay-orb") as HTMLImageElement | null;
    const statusEl = doc.getElementById("nohby-overlay-status");
    const subEl = doc.getElementById("nohby-overlay-sub");
    const isAnim = status !== "standby" || speechDetected;
    const origin = window.location.origin;

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
      subEl.textContent = lastHeard || "Tap orb or speak wake phrase anywhere";
    }
  }, [lastHeard, orbStyle.gif, orbStyle.still, speechDetected, status, wakePhrase]);

  useEffect(() => {
    syncOverlayDom();
  }, [syncOverlayDom]);

  const toggleDeviceDesktopOverlay = async () => {
    // 1. Native Tauri Desktop App Always-On-Top background mode
    if (typeof window !== "undefined" && window.__TAURI__?.core?.invoke) {
      try {
        const next = !desktopPinned;
        await window.__TAURI__.core.invoke<boolean>("set_stealth_mode", { enabled: next });
        setDesktopPinned(next);
        showToast(
          "success",
          next
            ? "NohbyAI pinned on top of your device desktop background."
            : "Unpinned from device desktop background."
        );
        return;
      } catch {
        // Fall through to web PiP
      }
    }

    // 2. Close existing floating OS overlay if already open
    if (overlayWindowRef.current && !overlayWindowRef.current.closed) {
      overlayWindowRef.current.close();
      overlayWindowRef.current = null;
      setDesktopPinned(false);
      return;
    }

    try {
      let pipWin: Window | null = null;
      if (window.documentPictureInPicture?.requestWindow) {
        pipWin = await window.documentPictureInPicture.requestWindow({
          width: 340,
          height: 86,
        });
      } else {
        pipWin = window.open(
          "",
          "NohbyJarvisDesktopWidget",
          "width=350,height=105,menubar=no,toolbar=no,location=no,status=no,resizable=no"
        );
      }

      if (!pipWin) {
        showToast("error", "Allow popups to pin NohbyAI onto your device background.");
        return;
      }

      overlayWindowRef.current = pipWin;
      setDesktopPinned(true);

      const origin = window.location.origin;
      const initialOrb = `${origin}${orbStyle.still}`;
      pipWin.document.open();
      pipWin.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>NohbyAI — Device Background Assistant</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0B111E;
      color: #F8FAFC;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 100vh;
      padding: 10px 14px;
      overflow: hidden;
      user-select: none;
    }
    .pill {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      cursor: pointer;
    }
    .orb-wrap {
      width: 46px;
      height: 46px;
      border-radius: 999px;
      overflow: hidden;
      border: 1.5px solid rgba(0, 212, 255, 0.65);
      box-shadow: 0 0 18px rgba(0, 212, 255, 0.4);
      flex-shrink: 0;
    }
    .orb-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scale(1.25);
    }
    .meta {
      min-width: 0;
      flex: 1;
    }
    .title {
      font-size: 13px;
      font-weight: 700;
      color: #FFFFFF;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #00D4FF;
      box-shadow: 0 0 10px #00D4FF;
      display: inline-block;
    }
    .sub {
      font-size: 11px;
      color: #94A3B8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="pill" id="nohby-overlay-trigger" title="Click to talk to NohbyAI">
    <div class="orb-wrap">
      <img id="nohby-overlay-orb" src="${initialOrb}" alt="NohbyAI" />
    </div>
    <div class="meta">
      <div class="title">
        <span class="dot"></span>
        <span id="nohby-overlay-status">Say "${wakePhrase}"</span>
      </div>
      <div class="sub" id="nohby-overlay-sub">Floating on device background — click or speak</div>
    </div>
  </div>
</body>
</html>`);
      pipWin.document.close();

      const triggerEl = pipWin.document.getElementById("nohby-overlay-trigger");
      triggerEl?.addEventListener("click", () => {
        greetAndOpenListeningWindow();
      });

      pipWin.addEventListener("pagehide", () => {
        overlayWindowRef.current = null;
        setDesktopPinned(false);
      });

      syncOverlayDom();
      showToast(
        "success",
        "NohbyAI is now floating on your device desktop background above other apps."
      );
    } catch {
      showToast("error", "Could not open floating desktop overlay window.");
    }
  };

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
        onClick={toggleDeviceDesktopOverlay}
        className={`rounded-full p-1 transition ${
          desktopPinned
            ? "bg-[#00D4FF]/20 text-[#00D4FF]"
            : "text-zinc-400 hover:bg-black/[0.06] hover:text-[#00D4FF] dark:hover:bg-white/[0.08]"
        }`}
        title={
          desktopPinned
            ? "Unpin from device desktop background"
            : "Pin floating widget onto device desktop background (Always on top)"
        }
        aria-label="Pin widget onto device desktop background"
      >
        <PictureInPicture2 className="h-3.5 w-3.5" />
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
