import { useEffect, useState } from "react";
import { Loader2, LogOut, Mic, Monitor, Moon, Save, Shield, Sun, Volume2 } from "lucide-react";

import { applyTheme, getStoredTheme, type ThemePreference } from "../lib/theme";
import { speakText, stopSpeaking } from "../lib/voice";
import { useAppStore } from "../store/useAppStore";

export function SettingsScreen() {
  const {
    user,
    voiceSettings,
    updateProfile,
    loadVoiceSettings,
    updateVoiceSettings,
    setIsSpeaking,
    logout,
    busy,
    error,
  } = useAppStore();

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
  const [ttsRate, setTtsRate] = useState(1.0);
  const [autoSpeakResponses, setAutoSpeakResponses] = useState(false);
  const [inputLanguage, setInputLanguage] = useState("en-US");
  const [themePref, setThemePref] = useState<ThemePreference>(() => getStoredTheme());

  const handleSelectTheme = (pref: ThemePreference) => {
    setThemePref(pref);
    applyTheme(pref);
    window.dispatchEvent(new Event("nohby-theme-change"));
  };

  useEffect(() => {
    if (!voiceSettings) {
      loadVoiceSettings();
    }
  }, [voiceSettings, loadVoiceSettings]);

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

  const handleSaveVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateVoiceSettings({
        voiceEnabled,
        wakeWordEnabled,
        wakeWordPhrase: wakeWordPhrase.trim() || "Hey Nohby",
        sttStrategy,
        ttsStrategy,
        ttsRate,
        autoSpeakResponses,
        inputLanguage,
      });
    } catch {
      // Handled in store
    }
  };

  const handleTestVoice = () => {
    stopSpeaking();
    speakText("Nohby ONE voice output is active and ready.", {
      rate: ttsRate,
      language: inputLanguage,
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
    });
  };

  return (
    <div className="w-full max-w-5xl space-y-4">
      {/* Appearance */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#111318] p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-white">Appearance</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Choose Light, Dark, or follow your operating system theme across all screens.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {(
            [
              { id: "light", label: "Light", icon: Sun },
              { id: "dark", label: "Dark", icon: Moon },
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
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-xs font-medium transition ${
                  selected
                    ? "btn-ivory border-transparent"
                    : "border-white/[0.1] bg-[#0A0B0E] text-zinc-300 hover:border-white/[0.2]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Account Profile */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#111318] p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-white">Account Profile</h2>
        <p className="mt-1 text-xs text-zinc-400">
          Manage your display identity and regional preferences.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0B0E] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
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
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0B0E] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
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
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0B0E] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">Locale</label>
              <input
                type="text"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0B0E] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">Language</label>
              <input
                type="text"
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0B0E] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={busy}
              className="btn-ivory inline-flex min-h-[38px] items-center gap-2 rounded-lg px-4 py-2 text-xs"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Profile
            </button>
          </div>
        </form>
      </section>

      {/* Voice & Wake Word Settings (Phase 3) */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#111318] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Mic className="h-4 w-4 text-indigo-400" />
            <div>
              <h2 className="text-sm font-semibold text-white">Voice &amp; Wake Word</h2>
              <p className="text-xs text-zinc-400">
                Microphone activation is always explicit and visibly indicated.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleTestVoice}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#171A21] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08]"
          >
            <Volume2 className="h-3.5 w-3.5 text-indigo-400" />
            Test Voice Output
          </button>
        </div>

        <form onSubmit={handleSaveVoice} className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.08] bg-[#0A0B0E] p-3.5">
              <div>
                <p className="text-xs font-medium text-white">Voice Interaction</p>
                <p className="text-[11px] text-zinc-500">Allow microphone commands in Assistant</p>
              </div>
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.08] bg-[#0A0B0E] p-3.5">
              <div>
                <p className="text-xs font-medium text-white">Wake-Word Filter</p>
                <p className="text-[11px] text-zinc-500">Require wake phrase before sending</p>
              </div>
              <input
                type="checkbox"
                checked={wakeWordEnabled}
                onChange={(e) => setWakeWordEnabled(e.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Wake Word Phrase
              </label>
              <input
                type="text"
                value={wakeWordPhrase}
                onChange={(e) => setWakeWordPhrase(e.target.value)}
                placeholder="Hey Nohby"
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0B0E] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                Recognition Language
              </label>
              <select
                value={inputLanguage}
                onChange={(e) => setInputLanguage(e.target.value)}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0B0E] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              >
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="fr-FR">French</option>
                <option value="es-ES">Spanish</option>
                <option value="de-DE">German</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                STT Engine
              </label>
              <select
                value={sttStrategy}
                onChange={(e) => setSttStrategy(e.target.value as "local" | "cloud")}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0B0E] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              >
                <option value="local">Local-First</option>
                <option value="cloud">Cloud Whisper</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                TTS Engine
              </label>
              <select
                value={ttsStrategy}
                onChange={(e) => setTtsStrategy(e.target.value as "local" | "cloud")}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0B0E] px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
              >
                <option value="local">Local Speech</option>
                <option value="cloud">Cloud TTS</option>
              </select>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-zinc-300">
                <label>Speech Rate</label>
                <span className="font-mono text-zinc-400">{ttsRate.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={ttsRate}
                onChange={(e) => setTtsRate(parseFloat(e.target.value))}
                className="mt-2 w-full accent-indigo-600"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.08] bg-[#0A0B0E] p-3.5">
            <div>
              <p className="text-xs font-medium text-white">Auto-Speak Assistant Responses</p>
              <p className="text-[11px] text-zinc-500">
                Read replies aloud automatically when a voice command is sent
              </p>
            </div>
            <input
              type="checkbox"
              checked={autoSpeakResponses}
              onChange={(e) => setAutoSpeakResponses(e.target.checked)}
              className="h-4 w-4 accent-indigo-600"
            />
          </label>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Voice Preferences
            </button>
          </div>
        </form>
      </section>

      {/* Session Security */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#111318] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-4 w-4 text-indigo-400" />
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
            className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </section>
    </div>
  );
}
