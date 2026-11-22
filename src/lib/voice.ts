import { apiClient } from "./api";
import { cleanDisplayText } from "./formatText";

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

const NOHBY_PHONETIC_VARIANTS = [
  "hey nohby",
  "hey nobi",
  "hey noby",
  "hey nobby",
  "hey nobody",
  "hey no be",
  "hey know be",
  "hey know me",
  "hey novi",
  "hey nubi",
  "hey nobie",
  "hey nohbi",
  "hey nohbie",
  "hey noah",
  "hey obi",
  "hey toby",
  "hey ruby",
  "hey bobby",
  "hey kobe",
  "a nohby",
  "a nobi",
  "hay nohby",
  "hay nobi",
  "hi nohby",
  "hi nobi",
  "hi nobby",
  "hello nohby",
  "hello nobi",
  "hello nobby",
  "ok nohby",
  "ok nobi",
  "okay nohby",
  "okay nobi",
  "sannu nohby",
  "sannu nobi",
  "sannu nobby",
  "sannu nobody",
  "nohby",
  "nobi",
  "noby",
  "nobby",
];

/**
 * Checks whether a spoken transcript starts with (or contains) the configured wake word
 * or common browser STT phonetic variants of "Hey Nohby" / "Sannu Nohby".
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
  const candidates = [normalizedWake];
  if (
    normalizedWake.includes("nohby") ||
    normalizedWake.includes("nobi") ||
    normalizedWake.includes("noby")
  ) {
    for (const v of NOHBY_PHONETIC_VARIANTS) {
      if (!candidates.includes(v)) candidates.push(v);
    }
  }

  // Sort longest-first so "hey nobody" matches before "nohby"
  candidates.sort((a, b) => b.length - a.length);

  for (const phrase of candidates) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?:^|[\\s,.:;!?-])${escaped}(?=$|[\\s,.:;!?-])`, "i");
    const match = regex.exec(lower);
    if (match) {
      const endIndex = match.index + match[0].length;
      const after = normalizedTranscript
        .slice(endIndex)
        .replace(/^[\s,.:;!?-]+/, "")
        .trim();
      return { matched: true, command: after };
    }
  }

  return { matched: false, command: "" };
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
    if (cancelled) return;
    if (evt.error === "language-not-supported" && recognition.lang !== "en-US") {
      recognition.lang = "en-US";
      return;
    }
    options.onError(evt.error || "speech_recognition_error");
  };

  recognition.onend = () => {
    options.onEnd();
  };

  try {
    recognition.start();
  } catch {
    // Ignore start collision
  }

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
  onLevels: (bars: number[]) => void,
  barCount = 12
): Promise<() => void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return () => {};
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let rafId = 0;
    let active = true;

    const loop = () => {
      if (!active) return;
      analyser.getByteFrequencyData(data);
      const binCount = Math.max(8, Math.min(data.length - 2, 36));
      const bars = Array.from({ length: barCount }, (_, i) => {
        // Mirror across center for a natural symmetrical voice equalizer wave
        const distFromCenter = Math.abs(i - (barCount - 1) / 2) / Math.max(1, (barCount - 1) / 2);
        const binIndex = 1 + Math.floor(distFromCenter * (binCount - 2));
        const raw = data[binIndex] ?? 0;
        const neighbor = data[Math.min(data.length - 1, binIndex + 1)] ?? raw;
        const avg = (raw * 0.65 + neighbor * 0.35) / 155;
        return Math.max(0.14, Math.min(1, avg));
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
  } catch {
    return () => {};
  }
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

let activeUtterance: SpeechSynthesisUtterance | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeSpeechTimer: number | null = null;
let activeSpeechGeneration = 0;

const neuralAudioCache = new Map<string, string>();
const MAX_NEURAL_CACHE = 48;

export function isCurrentlySpeaking(): boolean {
  return Boolean(activeUtterance || activeAudio);
}

function speakWithBrowserFallback(
  spokenText: string,
  options: {
    rate?: number;
    pitch?: number;
    voiceType?: string;
    language?: string;
    onStart?: () => void;
    onEnd?: () => void;
  },
  finishOnce: () => void
): void {
  if (!isSpeechSynthesisSupported()) {
    finishOnce();
    return;
  }

  try {
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
  } catch {
    // Ignore synth reset errors
  }

  const preset = VOICE_PERSONA_PRESETS.find((p) => p.id === options.voiceType);
  const utterance = new SpeechSynthesisUtterance(spokenText);
  activeUtterance = utterance;
  utterance.rate = options.rate ?? preset?.rate ?? 1.0;
  utterance.pitch = options.pitch ?? preset?.pitch ?? 1.0;
  utterance.lang = options.language || "en-US";

  const matchedVoice = pickBestSpeechVoice(utterance.lang, options.voiceType);
  if (matchedVoice) {
    utterance.voice = matchedVoice;
    utterance.lang = matchedVoice.lang || utterance.lang;
  }

  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => finishOnce();
  utterance.onerror = () => finishOnce();

  const maxDurationMs = Math.max(3500, Math.min(26000, spokenText.length * 85));
  activeSpeechTimer = window.setTimeout(finishOnce, maxDurationMs);

  try {
    window.speechSynthesis.speak(utterance);
  } catch {
    finishOnce();
  }
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
  const spokenText = cleanDisplayText(text);
  if (!spokenText) {
    options.onEnd?.();
    return;
  }

  stopSpeaking();
  const gen = ++activeSpeechGeneration;

  let finished = false;
  const finishOnce = () => {
    if (finished || gen !== activeSpeechGeneration) return;
    finished = true;
    if (activeSpeechTimer) {
      window.clearTimeout(activeSpeechTimer);
      activeSpeechTimer = null;
    }
    activeUtterance = null;
    activeAudio = null;
    options.onEnd?.();
  };

  const voiceType = options.voiceType || "female";
  const language = options.language || "en-US";
  const preset = VOICE_PERSONA_PRESETS.find((p) => p.id === voiceType);
  const rate = options.rate ?? preset?.rate ?? 1.0;
  const pitch = options.pitch ?? preset?.pitch ?? 1.0;
  const cacheKey = `${language}|${voiceType}|${rate.toFixed(2)}|${spokenText.slice(0, 320)}`;

  const playDataUrl = async (dataUrl: string): Promise<boolean> => {
    if (gen !== activeSpeechGeneration || typeof Audio === "undefined") return false;
    try {
      const audio = new Audio(dataUrl);
      activeAudio = audio;
      audio.onplay = () => {
        if (gen === activeSpeechGeneration) options.onStart?.();
      };
      audio.onended = () => finishOnce();
      audio.onerror = () => finishOnce();

      const maxDurationMs = Math.max(4500, Math.min(32000, spokenText.length * 95));
      activeSpeechTimer = window.setTimeout(finishOnce, maxDurationMs);
      await audio.play();
      return true;
    } catch {
      activeAudio = null;
      return false;
    }
  };

  // Signal immediate visual speaking state while fetching or playing cached neural audio
  options.onStart?.();

  const cachedUrl = neuralAudioCache.get(cacheKey);
  if (cachedUrl) {
    void playDataUrl(cachedUrl).then((ok) => {
      if (!ok && gen === activeSpeechGeneration) {
        speakWithBrowserFallback(spokenText, options, finishOnce);
      }
    });
    return;
  }

  void apiClient
    .synthesizeSpeech({
      text: spokenText,
      voiceType,
      pitch,
      rate,
      language,
    })
    .then(async (res) => {
      if (gen !== activeSpeechGeneration) return;
      const speech = res.data.speech;
      if (speech.strategy === "cloud_audio" && speech.audioBase64) {
        const mime = speech.mimeType || "audio/mpeg";
        const dataUrl = `data:${mime};base64,${speech.audioBase64}`;
        neuralAudioCache.set(cacheKey, dataUrl);
        if (neuralAudioCache.size > MAX_NEURAL_CACHE) {
          const oldestKey = neuralAudioCache.keys().next().value;
          if (oldestKey) neuralAudioCache.delete(oldestKey);
        }
        const played = await playDataUrl(dataUrl);
        if (played) return;
      }
      speakWithBrowserFallback(spokenText, options, finishOnce);
    })
    .catch(() => {
      if (gen !== activeSpeechGeneration) return;
      speakWithBrowserFallback(spokenText, options, finishOnce);
    });
}

export function stopSpeaking(): void {
  activeSpeechGeneration++;
  if (activeSpeechTimer) {
    window.clearTimeout(activeSpeechTimer);
    activeSpeechTimer = null;
  }
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      // Ignore
    }
    activeAudio = null;
  }
  activeUtterance = null;
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
  }
}

