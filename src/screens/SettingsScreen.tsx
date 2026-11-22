import { useEffect, useState } from "react";
import { Loader2, LogOut, Save, Shield } from "lucide-react";

import { useAppStore } from "../store/useAppStore";

export function SettingsScreen() {
  const { user, updateProfile, logout, busy, error } = useAppStore();

  const [name, setName] = useState(user?.name || "");
  const [displayName, setDisplayName] = useState(user?.profile?.displayName || "");
  const [timezone, setTimezone] = useState(user?.profile?.timezone || "UTC");
  const [locale, setLocale] = useState(user?.profile?.locale || "en-US");
  const [preferredLanguage, setPreferredLanguage] = useState(
    user?.profile?.preferredLanguage || "en"
  );

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setDisplayName(user.profile?.displayName || user.name);
    setTimezone(user.profile?.timezone || "UTC");
    setLocale(user.profile?.locale || "en-US");
    setPreferredLanguage(user.profile?.preferredLanguage || "en");
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border border-slate-800/80 bg-[#111622] p-6">
        <h2 className="text-base font-semibold text-slate-100">Account Profile</h2>
        <p className="mt-1 text-xs text-slate-400">
          Persisted directly to your Nohby ONE profile via <code className="text-indigo-300">PATCH /api/v1/auth/me</code>.
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Timezone</label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="UTC"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Locale</label>
              <input
                type="text"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                placeholder="en-US"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Language</label>
              <input
                type="text"
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value)}
                placeholder="en"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-800/80 bg-[#111622] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 text-indigo-400" />
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Session Security</h3>
              <p className="mt-1 text-xs text-slate-400">
                Account email: <span className="text-slate-200">{user?.email}</span> • Status:{" "}
                <span className="capitalize text-emerald-400">{user?.status}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </section>
    </div>
  );
}
