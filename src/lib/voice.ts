export interface SpeechRecognitionResultEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [altIndex: number]: { transcript: string };
    };
  };
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export function isSpeechRecognitionSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Checks whether a spoken transcript starts with (or contains) the configured wake word.
 * Returns { matched, command } so wake-word mode only forwards intentional commands.
 */
export function extractWakeWordCommand(
  transcript: string,
  wakeWordPhrase: string
): { matched: boolean; command: string } {
  const normalizedTranscript = transcript.trim();
  const normalizedWake = wakeWordPhrase.trim().toLowerCase();
  if (!normalizedWake) {
    return { matched: true, command: normalizedTranscript };
  }

  const lower = normalizedTranscript.toLowerCase();
  const idx = lower.indexOf(normalizedWake);
  if (idx === -1) {
    return { matched: false, command: "" };
  }

  const after = normalizedTranscript
    .slice(idx + normalizedWake.length)
    .replace(/^[\s,.:;!?-]+/, "")
    .trim();

  return { matched: true, command: after };
}

export interface VoiceSessionHandle {
  stop: () => void;
  cancel: () => void;
}

export function startLocalVoiceRecognition(options: {
  language: string;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (error: string) => void;
  onEnd: () => void;
}): VoiceSessionHandle | null {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = options.language || "en-US";

  let cancelled = false;
  let accumulatedFinal = "";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      const text = res[0]?.transcript || "";
      if (res.isFinal) {
        accumulatedFinal = `${accumulatedFinal} ${text}`.trim();
        options.onFinal(accumulatedFinal);
      } else {
        interim += text;
      }
    }
    const combined = `${accumulatedFinal} ${interim}`.trim();
    if (combined) {
      options.onInterim(combined);
    }
  };

  recognition.onerror = (evt) => {
    if (!cancelled) {
      options.onError(evt.error || "speech_recognition_error");
    }
  };

  recognition.onend = () => {
    options.onEnd();
  };

  recognition.start();

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // Ignore stop on already-stopped recognition
      }
    },
    cancel: () => {
      cancelled = true;
      try {
        recognition.abort();
      } catch {
        // Ignore abort errors
      }
    },
  };
}

export async function startMicLevelMonitor(
  onLevels: (bars: number[]) => void
): Promise<() => void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return () => {};
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 64;
  source.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);
  let rafId = 0;
  let active = true;

  const loop = () => {
    if (!active) return;
    analyser.getByteFrequencyData(data);
    const bars = Array.from({ length: 12 }, (_, i) => {
      const raw = data[i + 1] ?? 0;
      return Math.max(0.12, Math.min(1, raw / 180));
    });
    onLevels(bars);
    rafId = window.requestAnimationFrame(loop);
  };
  loop();

  return () => {
    active = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    stream.getTracks().forEach((t) => t.stop());
    audioCtx.close().catch(() => {});
  };
}

export function speakText(
  text: string,
  options: {
    rate?: number;
    language?: string;
    onStart?: () => void;
    onEnd?: () => void;
  } = {}
): void {
  if (!isSpeechSynthesisSupported()) {
    options.onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate ?? 1.0;
  utterance.lang = options.language || "en-US";
  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = () => options.onEnd?.();
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}
