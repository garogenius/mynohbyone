import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  ExternalLink,
  Loader2,
  LogOut,
  Mic,
  Monitor,
  Moon,
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
    <div className="w-full max-w-5xl space-y-4">
      {/* Device Background Floating Assistant & Screen-Share Stealth Privacy */}
      <section className="nohby-frame p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm font-semibold text-white">
                  Device Background Assistant &amp; Screen-Share Stealth Privacy
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Invisible in Screen Share
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400 max-w-2xl">
                Configure NohbyAI and Meeting Stealth Q&amp;A to float over any application across your whole device (always-on-top). Hardware-level capture protection ensures zero visibility on Zoom, Teams, Google Meet, and screen recordings.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleLaunchOverlay("assistant")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#00D4FF]/35 bg-[#00D4FF]/10 px-3 text-xs font-medium text-[#00D4FF] transition hover:bg-[#00D4FF]/20"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Float Assistant on Desktop</span>
            </button>

            <button
              type="button"
              onClick={() => handleLaunchOverlay("meeting")}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/20"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Float Meeting Stealth Card</span>
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 border-t border-white/[0.08] pt-4 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#0A0F1D] p-3 cursor-pointer hover:border-[#00D4FF]/30 transition">
            <div className="pr-3">
              <span className="text-xs font-medium text-white block">Auto-Float on Startup</span>
              <span className="text-[11px] text-zinc-400 block mt-0.5">
                Automatically float overlay on your device background when you launch Nohby ONE.
              </span>
            </div>
            <input
              type="checkbox"
              checked={deviceOverlayAutoLaunch}
              onChange={(e) => handleToggleAutoLaunch(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-700 text-[#00D4FF] focus:ring-0"
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#0A0F1D] p-3 cursor-pointer hover:border-emerald-500/30 transition">
            <div className="pr-3">
              <span className="text-xs font-medium text-white block">Hands-Free Hey Nohby (Jarvis Mode)</span>
              <span className="text-[11px] text-zinc-400 block mt-0.5">
                Background voice activation ({wakeWordPhrase || "Hey Nohby"}) without clicking.
              </span>
            </div>
            <input
              type="checkbox"
              checked={wakeWordEnabled}
              onChange={handleToggleJarvis}
              className="h-4 w-4 rounded border-zinc-700 text-emerald-500 focus:ring-0"
            />
          </label>
        </div>
      </section>

      {/* AI Chat Engine (Real LLM Connection) */}
      <section className="nohby-frame p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-4 w-4 text-[#00D4FF]" />
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                NohbyAI Chat Engine (Live LLM)
              </h2>
              <p className="text-xs text-zinc-400">
                Configure NohbyAI Core or connect a custom engine for real generative chat in English &amp; Hausa.
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
              aiConnected
                ? "border border-emerald-500/35 bg-emerald-500/10 text-emerald-400"
                : "border border-amber-500/35 bg-amber-500/10 text-amber-400"
            }`}
          >
            <CheckCircle2 className="h-3 w-3" />
            {aiConnected ? "Live LLM Connected" : "Connect API Key"}
          </span>
        </div>

        <form onSubmit={handleSaveAiConfig} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-300">Provider</label>
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
              <label className="mb-1 block text-xs font-medium text-zinc-300">Model Name</label>
              <input
                type="text"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="nohby-core-flash / gpt-4o-mini"
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-300">
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

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-zinc-500">
              Your API key is stored server-side on your profile and never exposed in responses.
            </p>
            <button
              type="submit"
              disabled={savingAi}
              className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs"
            >
              {savingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save AI Engine
            </button>
          </div>
        </form>
      </section>

      {/* Appearance */}
      <section className="nohby-frame p-5">
        <h2 className="font-display text-sm font-semibold text-white">Appearance</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Choose Dark, Light, or follow your operating system theme across all screens.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {(
            [
              { id: "dark", label: "Dark", icon: Moon },
              { id: "light", label: "Light", icon: Sun },
              { id: "system", label: "System", icon: Monitor },
            ] as const
          ).map((opt) => {
            const Icon = opt.icon;
            const selected = themePref === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectTheme(opt.id)}
                className={`flex min-h-[40px] items-center justify-center gap-2 rounded-xl border text-xs font-medium transition ${
                  selected
                    ? "nohby-nav-active text-white"
                    : "border-white/[0.1] bg-[#0C121E] text-zinc-300 hover:border-white/[0.2]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Voice Wave Orb Animation Picker (all 3 public GIFs) */}
        <div className="mt-5 border-t border-white/[0.07] pt-4">
          <h3 className="text-xs font-semibold text-white">Voice Wave Orb Style</h3>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            Select which animated voice wave appears in Active Session and Jarvis Mode when listening or speaking.
          </p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
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
                  className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${
                    active
                      ? "nohby-nav-active text-white"
                      : "border-white/[0.08] bg-[#0C121E] text-zinc-300 hover:border-[#00D4FF]/40"
                  }`}
                >
                  <div
                    className={`shrink-0 overflow-hidden border border-[#00D4FF]/40 ${
                      opt.shape === "wide" ? "h-11 w-20 rounded-lg" : "h-12 w-12 rounded-full"
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
                    <p className="truncate text-xs font-semibold text-white">{opt.label}</p>
                    <p className="truncate text-[10px] text-zinc-400">{opt.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Voice, Language (Hausa + Multilingual) & Voice Persona Type */}
      <section className="nohby-frame p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Mic className="h-4 w-4 text-[#00D4FF]" />
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                Voice Persona, Language &amp; Wake Word
              </h2>
              <p className="text-xs text-zinc-400">
                Choose Hausa or any supported language and configure Male, Female, Girl, Boy, or Young voice types.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleTestVoice()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-3 text-xs font-medium text-[#00D4FF] transition hover:bg-[#00D4FF]/20"
          >
            <Volume2 className="h-3.5 w-3.5" />
            Test Voice ({inputLanguage === "ha-NG" ? "Hausa" : inputLanguage})
          </button>
        </div>

        <form onSubmit={handleSaveVoice} className="mt-5 space-y-5">
          {/* Voice Persona / Type Grid */}
          <div>
            <label className="mb-2 block text-xs font-medium text-zinc-300">
              Assistant Voice Type (Male, Female, Girl, Boy, Young)
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
                    className={`rounded-xl border p-3 text-left transition ${
                      selected
                        ? "nohby-nav-active text-white"
                        : "border-white/[0.08] bg-[#0C121E] text-zinc-300 hover:border-[#00D4FF]/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-xs font-semibold text-white">{preset.label}</span>
                      <UserRound
                        className={`h-3.5 w-3.5 ${
                          selected ? "text-[#00D4FF]" : "text-zinc-500"
                        }`}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] text-zinc-400">{preset.tag}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language & Wake Word */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
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
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
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

          {/* Pitch, Rate & Engines */}
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-zinc-300">
                <label>Voice Pitch</label>
                <span className="font-mono text-[#00D4FF]">{ttsPitch.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.02}
                value={ttsPitch}
                onChange={(e) => setTtsPitch(parseFloat(e.target.value))}
                className="mt-2 w-full accent-[#0066FF]"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-zinc-300">
                <label>Speech Speed</label>
                <span className="font-mono text-[#00D4FF]">{ttsRate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={ttsRate}
                onChange={(e) => setTtsRate(parseFloat(e.target.value))}
                className="mt-2 w-full accent-[#0066FF]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">STT Engine</label>
              <select
                value={sttStrategy}
                onChange={(e) => setSttStrategy(e.target.value as "local" | "cloud")}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              >
                <option value="local">Local-First</option>
                <option value="cloud">Cloud Whisper</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">TTS Engine</label>
              <select
                value={ttsStrategy}
                onChange={(e) => setTtsStrategy(e.target.value as "local" | "cloud")}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              >
                <option value="local">Local Speech</option>
                <option value="cloud">Cloud TTS</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.08] bg-[#0C121E] p-3">
              <div>
                <p className="text-xs font-medium text-white">Voice Interaction</p>
                <p className="text-[10px] text-zinc-500">Enable mic commands</p>
              </div>
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
                className="h-4 w-4 accent-[#0066FF]"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.08] bg-[#0C121E] p-3">
              <div>
                <p className="text-xs font-medium text-white">Wake-Word Filter</p>
                <p className="text-[10px] text-zinc-500">Require wake phrase</p>
              </div>
              <input
                type="checkbox"
                checked={wakeWordEnabled}
                onChange={(e) => setWakeWordEnabled(e.target.checked)}
                className="h-4 w-4 accent-[#0066FF]"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.08] bg-[#0C121E] p-3">
              <div>
                <p className="text-xs font-medium text-white">Auto-Speak Replies</p>
                <p className="text-[10px] text-zinc-500">Read answers aloud</p>
              </div>
              <input
                type="checkbox"
                checked={autoSpeakResponses}
                onChange={(e) => setAutoSpeakResponses(e.target.checked)}
                className="h-4 w-4 accent-[#0066FF]"
              />
            </label>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={busy}
              className="btn-ivory inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Voice Preferences
            </button>
          </div>
        </form>
      </section>

      {/* Account Profile */}
      <section className="nohby-frame p-5">
        <h2 className="font-display text-sm font-semibold text-white">Account Profile</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Manage your display identity and regional preferences.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">Timezone</label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">Locale</label>
              <input
                type="text"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
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
              className="btn-ivory inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Profile
            </button>
          </div>
        </form>
      </section>

      {/* Session Security */}
      <section className="nohby-frame p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-4 w-4 text-[#00D4FF]" />
            <div>
              <h3 className="text-sm font-semibold text-white">Session Security</h3>
              <p className="mt-1 text-xs text-zinc-400">
                Signed in as <span className="text-zinc-200">{user?.email}</span> · Status:{" "}
                <span className="capitalize text-emerald-400">{user?.status}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </section>
    </div>
  );
}
