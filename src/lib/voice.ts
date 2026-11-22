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

export const SUPPORTED_LANGUAGES = [
  { code: "ha-NG", label: "Hausa (Nijeriya)", sample: "Sannu! Nohby ONE yana aiki kuma a shirye yake ya taimake ka." },
  { code: "en-US", label: "English (US)", sample: "Hello! Nohby ONE voice output is active and ready." },
  { code: "en-GB", label: "English (UK)", sample: "Hello! Nohby ONE voice output is active and ready." },
  { code: "en-NG", label: "English (Nigeria)", sample: "Hello! Nohby ONE voice output is active and ready." },
  { code: "ar-SA", label: "Arabic (العربية)", sample: "مرحباً! نوهبي وان جاهز لمساعدتك الآن." },
  { code: "fr-FR", label: "French (Français)", sample: "Bonjour ! Nohby ONE est actif et prêt à vous aider." },
  { code: "yo-NG", label: "Yoruba (Yorùbá)", sample: "Bawo ni! Nohby ONE ti ṣetan lati ran ọ lọwọ." },
  { code: "ig-NG", label: "Igbo (Nigeria)", sample: "Ndewo! Nohby ONE dị njikere inyere gị aka." },
  { code: "sw-KE", label: "Swahili (Kiswahili)", sample: "Habari! Nohby ONE iko tayari kukusaidia." },
  { code: "es-ES", label: "Spanish (Español)", sample: "¡Hola! Nohby ONE está activo y listo para ayudarte." },
  { code: "de-DE", label: "German (Deutsch)", sample: "Hallo! Nohby ONE ist aktiv und bereit zu helfen." },
] as const;

export interface VoicePersonaPreset {
  id: "female" | "male" | "girl" | "boy" | "young_woman" | "young_man" | "calm_female" | "deep_male";
  label: string;
  tag: string;
  genderHint: "female" | "male";
  pitch: number;
  rate: number;
}

export const VOICE_PERSONA_PRESETS: VoicePersonaPreset[] = [
  { id: "female", label: "Female", tag: "Warm & Clear", genderHint: "female", pitch: 1.08, rate: 1.0 },
  { id: "male", label: "Male", tag: "Confident & Natural", genderHint: "male", pitch: 0.86, rate: 0.98 },
  { id: "girl", label: "Girl", tag: "Bright & Youthful", genderHint: "female", pitch: 1.42, rate: 1.06 },
  { id: "boy", label: "Boy", tag: "Energetic & Young", genderHint: "male", pitch: 1.28, rate: 1.05 },
  { id: "young_woman", label: "Young Woman", tag: "Modern & Crisp", genderHint: "female", pitch: 1.18, rate: 1.03 },
  { id: "young_man", label: "Young Man", tag: "Friendly & Dynamic", genderHint: "male", pitch: 0.95, rate: 1.02 },
  { id: "calm_female", label: "Calm Female", tag: "Soft Assistant", genderHint: "female", pitch: 1.02, rate: 0.94 },
  { id: "deep_male", label: "Deep Male", tag: "Executive Tone", genderHint: "male", pitch: 0.74, rate: 0.93 },
];

const FEMALE_VOICE_HINTS = ["female", "samantha", "victoria", "zira", "aria", "jenny", "sara", "susan", "karen", "moira", "tessa", "veena", "google uk english female"];
const MALE_VOICE_HINTS = ["male", "david", "mark", "guy", "daniel", "alex", "fred", "george", "ryan", "christopher", "google uk english male"];

function pickBestSpeechVoice(language: string, voiceType?: string): SpeechSynthesisVoice | null {
  if (!isSpeechSynthesisSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const langPrefix = (language || "en-US").toLowerCase().split("-")[0];
  const preset = VOICE_PERSONA_PRESETS.find((p) => p.id === voiceType);
  const genderHints = preset?.genderHint === "male" ? MALE_VOICE_HINTS : FEMALE_VOICE_HINTS;

  const langMatches = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  const pool = langMatches.length > 0 ? langMatches : voices;

  const genderMatch = pool.find((v) =>
    genderHints.some((hint) => v.name.toLowerCase().includes(hint))
  );
  return genderMatch || pool[0] || null;
}

export function speakText(
  text: string,
  options: {
    rate?: number;
    pitch?: number;
    voiceType?: string;
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
  const preset = VOICE_PERSONA_PRESETS.find((p) => p.id === options.voiceType);
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.rate ?? preset?.rate ?? 1.0;
  utterance.pitch = options.pitch ?? preset?.pitch ?? 1.0;
  utterance.lang = options.language || "en-US";

  const matchedVoice = pickBestSpeechVoice(utterance.lang, options.voiceType);
  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

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
