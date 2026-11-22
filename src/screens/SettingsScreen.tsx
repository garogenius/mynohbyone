import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Loader2,
  LogOut,
  Mic,
  Monitor,
  Moon,
  Palette,
  Save,
  Shield,
  ShieldCheck,
  Sun,
  UserRound,
  Volume2,
} from "lucide-react";

import { ApiError, apiClient } from "../lib/api";
import {
  ORB_STYLE_OPTIONS,
  getSelectedOrbStyle,
  setSelectedOrbStyle,
  type OrbStyleOption,
} from "../lib/orbStyle";
import { applyTheme, getStoredTheme, type ThemePreference } from "../lib/theme";
import {
  SUPPORTED_LANGUAGES,
  VOICE_PERSONA_PRESETS,
  speakText,
  stopSpeaking,
} from "../lib/voice";
import { useAppStore } from "../store/useAppStore";
import type { VoicePersonaId } from "../types/api";

const AI_PROVIDER_OPTIONS = [
  { id: "gemini", label: "NohbyAI Core (Primary)", defaultModel: "nohby-core-flash", baseUrl: "https://generativelanguage.googleapis.com/v1beta" },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
  { id: "groq", label: "Groq (Ultra-Fast)", defaultModel: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1" },
  { id: "openrouter", label: "OpenRouter", defaultModel: "openai/gpt-4o-mini", baseUrl: "https://openrouter.ai/api/v1" },
  { id: "deepseek", label: "DeepSeek", defaultModel: "deepseek-chat", baseUrl: "https://api.deepseek.com/v1" },
  { id: "custom", label: "Custom OpenAI-Compatible", defaultModel: "gpt-4o-mini", baseUrl: "" },
] as const;

/**
 * Standard tactile iOS/Linear-style toggle switch component
 */
function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#0066FF] focus:ring-offset-1 ${
        checked
          ? "bg-[#0066FF]"
          : "bg-zinc-300 dark:bg-zinc-700"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function SettingsScreen() {
  const {
    user,
    voiceSettings,
    updateProfile,
    loadVoiceSettings,
    updateVoiceSettings,
    setIsSpeaking,
    showToast,
    logout,
    busy,
    error,
  } = useAppStore();

  // AI Chat Engine state
  const [aiProvider, setAiProvider] = useState("gemini");
  const [aiModel, setAiModel] = useState("nohby-core-flash");
  const [aiBaseUrl, setAiBaseUrl] = useState("https://generativelanguage.googleapis.com/v1beta");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiConnected, setAiConnected] = useState(false);
  const [aiMaskedKey, setAiMaskedKey] = useState("");
  const [savingAi, setSavingAi] = useState(false);

  const [name, setName] = useState(user?.name || "");
  const [displayName, setDisplayName] = useState(user?.profile?.displayName || "");
  const [timezone, setTimezone] = useState(user?.profile?.timezone || "UTC");
  const [locale, setLocale] = useState(user?.profile?.locale || "en-US");
  const [preferredLanguage, setPreferredLanguage] = useState(
    user?.profile?.preferredLanguage || "en"
  );

  // Voice & Wake Word state
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [wakeWordPhrase, setWakeWordPhrase] = useState("Hey Nohby");
  const [sttStrategy, setSttStrategy] = useState<"local" | "cloud">("local");
  const [ttsStrategy, setTtsStrategy] = useState<"local" | "cloud">("local");
  const [voiceType, setVoiceType] = useState<VoicePersonaId>("female");
  const [ttsPitch, setTtsPitch] = useState(1.08);
  const [ttsRate, setTtsRate] = useState(1.0);
  const [autoSpeakResponses, setAutoSpeakResponses] = useState(false);
  const [inputLanguage, setInputLanguage] = useState("en-US");
  const [themePref, setThemePref] = useState<ThemePreference>(() => getStoredTheme());
  const [selectedOrb, setSelectedOrb] = useState<OrbStyleOption>(() => getSelectedOrbStyle());

  const handleSelectTheme = (pref: ThemePreference) => {
    setThemePref(pref);
    applyTheme(pref);
    window.dispatchEvent(new Event("nohby-theme-change"));
  };

  const [deviceOverlayAutoLaunch, setDeviceOverlayAutoLaunch] = useState(() => {
    try {
      return localStorage.getItem("nohby_device_overlay_auto_launch") === "true";
    } catch {
      return false;
    }
  });

  const handleToggleAutoLaunch = (val: boolean) => {
    setDeviceOverlayAutoLaunch(val);
    try {
      localStorage.setItem("nohby_device_overlay_auto_launch", val ? "true" : "false");
      showToast(
        "info",
        val
          ? "Always-on-top desktop overlay will automatically launch on startup."
          : "Auto-launch on startup disabled."
      );
    } catch {}
  };

  const handleLaunchOverlay = (mode: "assistant" | "meeting") => {
    window.dispatchEvent(
      new CustomEvent("nohby-launch-device-overlay", {
        detail: { mode },
      })
    );
    showToast(
      "success",
      mode === "assistant"
        ? "NohbyAI floating on device background (Invisible to Screen Share)."
        : "Meeting Stealth Card floating on device background (Invisible to Screen Share)."
    );
  };

  useEffect(() => {
    if (!voiceSettings) {
      loadVoiceSettings();
    }
    apiClient
      .getAiConfig()
      .then((res) => {
        const cfg = res.data.config;
        if (cfg.provider && cfg.provider !== "nohby_assistant") setAiProvider(cfg.provider);
        if (cfg.model && cfg.model !== "nohby-one-assistant-v1") {
          setAiModel(cfg.model.toLowerCase().startsWith("gemini") ? "nohby-core-flash" : cfg.model);
        }
        if (cfg.baseUrl) setAiBaseUrl(cfg.baseUrl);
        setAiConnected(cfg.connected);
        setAiMaskedKey(cfg.maskedKey);
      })
      .catch(() => null);
  }, [voiceSettings, loadVoiceSettings]);

  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAi(true);
    try {
      const payload: { provider: string; model: string; baseUrl: string; apiKey?: string } = {
        provider: aiProvider,
        model: aiModel.trim(),
        baseUrl: aiBaseUrl.trim(),
      };
      if (aiApiKey.trim()) {
        payload.apiKey = aiApiKey.trim();
      }
      const res = await apiClient.updateAiConfig(payload);
      setAiConnected(res.data.config.connected);
      setAiMaskedKey(res.data.config.maskedKey);
      setAiApiKey("");
      showToast(
        "success",
        res.data.config.connected
          ? `Real AI chat connected (${res.data.config.provider} · ${res.data.config.model}).`
          : "AI engine preferences saved."
      );
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to save AI config.");
    } finally {
      setSavingAi(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setDisplayName(user.profile?.displayName || user.name);
    setTimezone(user.profile?.timezone || "UTC");
    setLocale(user.profile?.locale || "en-US");
    setPreferredLanguage(user.profile?.preferredLanguage || "en");
  }, [user]);

  useEffect(() => {
    if (!voiceSettings) return;
    setVoiceEnabled(voiceSettings.voiceEnabled);
    setWakeWordEnabled(voiceSettings.wakeWordEnabled);
    setWakeWordPhrase(voiceSettings.wakeWordPhrase);
    setSttStrategy(voiceSettings.sttStrategy);
    setTtsStrategy(voiceSettings.ttsStrategy);
    setVoiceType(voiceSettings.voiceType || "female");
    setTtsPitch(voiceSettings.ttsPitch ?? 1.08);
    setTtsRate(voiceSettings.ttsRate);
    setAutoSpeakResponses(voiceSettings.autoSpeakResponses);
    setInputLanguage(voiceSettings.inputLanguage);
  }, [voiceSettings]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({
        name: name.trim(),
        displayName: displayName.trim(),
        timezone: timezone.trim(),
        locale: locale.trim(),
        preferredLanguage: preferredLanguage.trim(),
      });
    } catch {
      // Handled in store
    }
  };

  const handleSelectPersona = (presetId: VoicePersonaId) => {
    setVoiceType(presetId);
    const preset = VOICE_PERSONA_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setTtsPitch(preset.pitch);
      setTtsRate(preset.rate);
    }
  };

  const handleSaveVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateVoiceSettings({
        voiceEnabled,
        wakeWordEnabled,
        wakeWordPhrase: wakeWordPhrase.trim() || "Hey Nohby",
        sttStrategy,
        ttsStrategy,
        voiceType,
        ttsPitch,
        ttsRate,
        autoSpeakResponses,
        inputLanguage,
      });
    } catch {
      // Handled in store
    }
  };

  const handleTestVoice = (overridePersona?: VoicePersonaId) => {
    stopSpeaking();
    const activePersona = overridePersona || voiceType;
    const preset = VOICE_PERSONA_PRESETS.find((p) => p.id === activePersona);
    const langSpec = SUPPORTED_LANGUAGES.find((l) => l.code === inputLanguage);
    const sampleText =
      langSpec?.sample || "Nohby ONE voice output is active and ready.";

    speakText(sampleText, {
      voiceType: activePersona,
      pitch: overridePersona ? preset?.pitch : ttsPitch,
      rate: overridePersona ? preset?.rate : ttsRate,
      language: inputLanguage,
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
    });
  };

  const handleToggleJarvis = async () => {
    const next = !wakeWordEnabled;
    try {
      if (next && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
      setWakeWordEnabled(next);
      setAutoSpeakResponses(true);
      await updateVoiceSettings({
        wakeWordEnabled: next,
        autoSpeakResponses: true,
        wakeWordPhrase: wakeWordPhrase.trim() || "Hey Nohby",
      });
      showToast(
        "success",
        next
          ? `Jarvis Mode ON — say "${wakeWordPhrase.trim() || "Hey Nohby"}" anytime in the background.`
          : "Jarvis Mode turned off."
      );
    } catch {
      showToast("error", "Allow microphone permission to enable hands-free 'Hey Nohby' mode.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-12 pt-2">
      {/* Page Title */}
      <div className="border-b border-zinc-200/80 pb-4 dark:border-white/[0.08]">
        <h1 className="font-display text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Manage your personal AI operating system, stealth privacy, voice engine, and appearance.
        </p>
      </div>

      {/* 1. Device Background Floating Assistant & Screen-Share Stealth Privacy */}
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/[0.08] dark:bg-[#101624]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Device Background Assistant &amp; Screen Stealth
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Invisible in Screen Share
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Float over any app on your device. Zero visibility on Zoom, Teams, and recordings.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleLaunchOverlay("assistant")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#0066FF]/30 bg-[#0066FF]/10 px-3 text-xs font-medium text-[#0066FF] transition hover:bg-[#0066FF]/20 dark:border-[#00D4FF]/35 dark:bg-[#00D4FF]/10 dark:text-[#00D4FF]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Float Assistant</span>
            </button>

            <button
              type="button"
              onClick={() => handleLaunchOverlay("meeting")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-600 transition hover:bg-emerald-500/20 dark:border-emerald-500/35 dark:text-emerald-400"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Float Stealth Card</span>
            </button>
          </div>
        </div>

        {/* Grouped Toggles with iOS ToggleSwitch */}
        <div className="divide-y divide-zinc-100 pt-1 dark:divide-white/[0.06]">
          <div className="flex items-center justify-between py-3.5">
            <div className="pr-4">
              <span className="text-xs font-semibold text-zinc-900 dark:text-white block">
                Auto-Float on Startup
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
                Automatically float the overlay on your device background when you launch Nohby ONE.
              </span>
            </div>
            <ToggleSwitch
              checked={deviceOverlayAutoLaunch}
              onChange={handleToggleAutoLaunch}
              label="Auto-Float on Startup"
            />
          </div>

          <div className="flex items-center justify-between py-3.5">
            <div className="pr-4">
              <span className="text-xs font-semibold text-zinc-900 dark:text-white block">
                Hands-Free Wake Detection (Jarvis Mode)
              </span>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
                Listen continuously in the background for "{wakeWordPhrase || "Hey Nohby"}" without clicking.
              </span>
            </div>
            <ToggleSwitch
              checked={wakeWordEnabled}
              onChange={handleToggleJarvis}
              label="Hands-Free Wake Word"
            />
          </div>
        </div>
      </section>

      {/* 2. Appearance & Voice Wave Orb */}
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/[0.08] dark:bg-[#101624]">
        <div className="flex items-center gap-3 border-b border-zinc-100 pb-4 dark:border-white/[0.06]">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Appearance</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Choose your interface theme and personalize the animated voice wave orb.
            </p>
          </div>
        </div>

        {/* Theme Options */}
        <div className="pt-4">
          <label className="mb-2 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Interface Theme
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                { id: "dark", label: "Dark Mode", icon: Moon, desc: "Deep obsidian slate" },
                { id: "light", label: "Light Mode", icon: Sun, desc: "Crisp white clarity" },
                { id: "system", label: "System Sync", icon: Monitor, desc: "Match device OS" },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const selected = themePref === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectTheme(opt.id)}
                  className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                    selected
                      ? "border-[#0066FF] bg-[#0066FF]/5 ring-2 ring-[#0066FF]/20 dark:border-[#00D4FF] dark:bg-[#00D4FF]/10 dark:ring-[#00D4FF]/30"
                      : "border-zinc-200 bg-zinc-50/70 hover:border-zinc-300 dark:border-white/[0.08] dark:bg-[#141B2D]/70 dark:hover:border-white/[0.16]"
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <Icon className={`h-4 w-4 ${selected ? "text-[#0066FF] dark:text-[#00D4FF]" : "text-zinc-500"}`} />
                    {selected && <Check className="h-3.5 w-3.5 text-[#0066FF] dark:text-[#00D4FF]" />}
                  </div>
                  <span className={`mt-2 text-xs font-semibold ${selected ? "text-[#0066FF] dark:text-white" : "text-zinc-800 dark:text-zinc-200"}`}>
                    {opt.label}
                  </span>
                  <span className="text-[10px] text-zinc-400">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Voice Wave Orb Style */}
        <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-white/[0.06]">
          <div className="mb-2">
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-white">Voice Wave Animation</h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Active Session and Jarvis listening animation style.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {ORB_STYLE_OPTIONS.map((opt) => {
              const active = selectedOrb.id === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    const next = setSelectedOrbStyle(opt.id);
                    setSelectedOrb(next);
                    showToast("success", `Voice wave switched to ${next.label}.`);
                  }}
                  className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                    active
                      ? "border-[#0066FF] bg-[#0066FF]/5 ring-2 ring-[#0066FF]/20 dark:border-[#00D4FF] dark:bg-[#00D4FF]/10"
                      : "border-zinc-200 bg-zinc-50/70 hover:border-zinc-300 dark:border-white/[0.08] dark:bg-[#141B2D]/70 dark:hover:border-white/[0.16]"
                  }`}
                >
                  <div
                    className={`shrink-0 overflow-hidden border border-[#0066FF]/30 dark:border-[#00D4FF]/40 ${
                      opt.shape === "wide" ? "h-10 w-16 rounded-lg" : "h-11 w-11 rounded-full"
                    }`}
                  >
                    <img
                      src={opt.gif}
                      alt={opt.label}
                      className={`h-full w-full object-cover ${
                        opt.shape === "wide" ? "" : "scale-[1.34]"
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-xs font-semibold ${active ? "text-[#0066FF] dark:text-white" : "text-zinc-800 dark:text-zinc-200"}`}>
                      {opt.label}
                    </p>
                    <p className="truncate text-[10px] text-zinc-400">{opt.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. NohbyAI Chat Engine (Live LLM) */}
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/[0.08] dark:bg-[#101624]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
                NohbyAI Chat Engine (Live LLM)
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Generative AI engine configuration supporting English and native Hausa.
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
              aiConnected
                ? "border border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            }`}
          >
            <CheckCircle2 className="h-3 w-3" />
            {aiConnected ? "Live LLM Connected" : "Connect API Key"}
          </span>
        </div>

        <form onSubmit={handleSaveAiConfig} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Provider</label>
              <select
                value={aiProvider}
                onChange={(e) => {
                  const id = e.target.value;
                  setAiProvider(id);
                  const found = AI_PROVIDER_OPTIONS.find((p) => p.id === id);
                  if (found) {
                    setAiModel(found.defaultModel);
                    setAiBaseUrl(found.baseUrl);
                  }
                }}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              >
                {AI_PROVIDER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Model Name</label>
              <input
                type="text"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="nohby-core-flash / gpt-4o-mini"
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                API Key {aiMaskedKey ? `(Saved: ${aiMaskedKey})` : ""}
              </label>
              <input
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder={aiMaskedKey ? "Enter new key to replace" : "Paste your API key..."}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 dark:border-white/[0.06]">
            <p className="text-[11px] text-zinc-400">
              Keys are securely stored on your account profile and never exposed to clients.
            </p>
            <button
              type="submit"
              disabled={savingAi}
              className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs"
            >
              {savingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Engine
            </button>
          </div>
        </form>
      </section>

      {/* 4. Voice Persona, Language & Wake Word */}
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/[0.08] dark:bg-[#101624]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4 dark:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400">
              <Mic className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
                Voice Persona &amp; Language
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Native Hausa and multilingual voice synthesis with customizable pitch and personas.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleTestVoice()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 text-xs font-medium text-violet-600 transition hover:bg-violet-500/20 dark:border-violet-500/40 dark:text-violet-300"
          >
            <Volume2 className="h-3.5 w-3.5" />
            Test Voice ({inputLanguage === "ha-NG" ? "Hausa" : inputLanguage})
          </button>
        </div>

        <form onSubmit={handleSaveVoice} className="mt-4 space-y-4">
          {/* Persona Presets */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Assistant Voice Persona
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {VOICE_PERSONA_PRESETS.map((preset) => {
                const selected = voiceType === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      handleSelectPersona(preset.id);
                      handleTestVoice(preset.id);
                    }}
                    className={`rounded-xl border p-2.5 text-left transition ${
                      selected
                        ? "border-[#0066FF] bg-[#0066FF]/5 ring-2 ring-[#0066FF]/20 dark:border-[#00D4FF] dark:bg-[#00D4FF]/10"
                        : "border-zinc-200 bg-zinc-50/70 hover:border-zinc-300 dark:border-white/[0.08] dark:bg-[#141B2D]/70 dark:hover:border-white/[0.16]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className={`text-xs font-semibold ${selected ? "text-[#0066FF] dark:text-white" : "text-zinc-800 dark:text-zinc-200"}`}>
                        {preset.label}
                      </span>
                      <UserRound className={`h-3.5 w-3.5 ${selected ? "text-[#0066FF] dark:text-[#00D4FF]" : "text-zinc-400"}`} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-zinc-400">{preset.tag}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language & Wake Word */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Voice &amp; Assistant Language
              </label>
              <select
                value={inputLanguage}
                onChange={(e) => setInputLanguage(e.target.value)}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Wake Word Phrase
              </label>
              <input
                type="text"
                value={wakeWordPhrase}
                onChange={(e) => setWakeWordPhrase(e.target.value)}
                placeholder="Hey Nohby / Sannu Nohby"
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
            </div>
          </div>

          {/* Sliders for Pitch and Speed */}
          <div className="grid gap-4 sm:grid-cols-2 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3.5 dark:border-white/[0.06] dark:bg-[#141B2D]/40">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <span>Voice Pitch</span>
                <span className="font-mono font-semibold text-[#0066FF] dark:text-[#00D4FF]">{ttsPitch.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.02}
                value={ttsPitch}
                onChange={(e) => setTtsPitch(parseFloat(e.target.value))}
                className="w-full accent-[#0066FF]"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <span>Speech Speed</span>
                <span className="font-mono font-semibold text-[#0066FF] dark:text-[#00D4FF]">{ttsRate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={ttsRate}
                onChange={(e) => setTtsRate(parseFloat(e.target.value))}
                className="w-full accent-[#0066FF]"
              />
            </div>
          </div>

          {/* STT and TTS Engines */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Speech-to-Text (STT)</label>
              <select
                value={sttStrategy}
                onChange={(e) => setSttStrategy(e.target.value as "local" | "cloud")}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              >
                <option value="local">Local-First (Fast on device)</option>
                <option value="cloud">Cloud Whisper Engine</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Text-to-Speech (TTS)</label>
              <select
                value={ttsStrategy}
                onChange={(e) => setTtsStrategy(e.target.value as "local" | "cloud")}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              >
                <option value="local">Local Speech Engine</option>
                <option value="cloud">Cloud Neural TTS</option>
              </select>
            </div>
          </div>

          {/* Grouped Toggles */}
          <div className="divide-y divide-zinc-100 border-t border-zinc-100 pt-1 dark:divide-white/[0.06] dark:border-white/[0.06]">
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-xs font-semibold text-zinc-900 dark:text-white">Voice Interaction</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Accept microphone audio commands in chat</p>
              </div>
              <ToggleSwitch
                checked={voiceEnabled}
                onChange={setVoiceEnabled}
                label="Voice Interaction"
              />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-xs font-semibold text-zinc-900 dark:text-white">Wake-Word Filter</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Require wake phrase before executing voice commands</p>
              </div>
              <ToggleSwitch
                checked={wakeWordEnabled}
                onChange={setWakeWordEnabled}
                label="Wake-Word Filter"
              />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-xs font-semibold text-zinc-900 dark:text-white">Auto-Speak Replies</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Read assistant responses aloud automatically</p>
              </div>
              <ToggleSwitch
                checked={autoSpeakResponses}
                onChange={setAutoSpeakResponses}
                label="Auto-Speak Replies"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={busy}
              className="btn-ivory inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-semibold"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Voice Preferences
            </button>
          </div>
        </form>
      </section>

      {/* 5. Account Profile */}
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/[0.08] dark:bg-[#101624]">
        <div className="flex items-center gap-3 border-b border-zinc-100 pb-4 dark:border-white/[0.06]">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Account Profile</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Manage your display identity and regional localization.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Timezone</label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Locale</label>
              <input
                type="text"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Preferred Language
              </label>
              <select
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              >
                <option value="ha">Hausa</option>
                <option value="en">English</option>
                <option value="ar">Arabic</option>
                <option value="fr">French</option>
                <option value="yo">Yoruba</option>
                <option value="ig">Igbo</option>
                <option value="sw">Swahili</option>
                <option value="es">Spanish</option>
                <option value="de">German</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={busy}
              className="btn-ivory inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-semibold"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Profile
            </button>
          </div>
        </form>
      </section>

      {/* 6. Session Security & Sign Out */}
      <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs dark:border-white/[0.08] dark:bg-[#101624]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 dark:bg-white/5 dark:text-zinc-300">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Session Security</h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Signed in as <span className="font-medium text-zinc-800 dark:text-zinc-200">{user?.email}</span> · Status:{" "}
                <span className="capitalize font-semibold text-emerald-600 dark:text-emerald-400">{user?.status}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20 disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </section>
    </div>
  );
}
