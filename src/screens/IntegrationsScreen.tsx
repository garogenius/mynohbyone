import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  Plug,
  RefreshCw,
  ShieldCheck,
  Unplug,
  X,
} from "lucide-react";

import { ProviderLogo } from "../components/ProviderLogo";
import { LoadingState } from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { IntegrationItem, IntegrationProviderSpec } from "../types/api";

const CATEGORIES = [
  { id: "all", label: "All Platforms" },
  { id: "social", label: "Social Media" },
  { id: "meetings", label: "Meetings" },
  { id: "email", label: "Email" },
  { id: "calendar", label: "Calendar" },
  { id: "plugins", label: "Plugins" },
] as const;

export function IntegrationsScreen() {
  const { showToast } = useAppStore();

  const [providers, setProviders] = useState<IntegrationProviderSpec[]>([]);
  const [connected, setConnected] = useState<IntegrationItem[]>([]);
  const [category, setCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  // Connect modal state
  const [connectingProvider, setConnectingProvider] = useState<IntegrationProviderSpec | null>(null);
  const [accountLabel, setAccountLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [availRes, connRes] = await Promise.all([
        apiClient.listAvailableIntegrations(),
        apiClient.listIntegrations(),
      ]);
      setProviders(availRes.data.providers);
      setConnected(connRes.data.integrations);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to load integrations.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const connectedByProvider = new Map(connected.map((c) => [c.provider, c]));

  const filteredProviders =
    category === "all" ? providers : providers.filter((p) => p.category === category);

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectingProvider || !accountLabel.trim() || submitting) return;

    setSubmitting(true);
    try {
      await apiClient.connectIntegration(connectingProvider.provider, {
        accountLabel: accountLabel.trim(),
        scopes: connectingProvider.defaultScopes,
      });
      showToast("success", `${connectingProvider.displayName} connected successfully.`);
      setConnectingProvider(null);
      setAccountLabel("");
      await loadAll();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Connection failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSync = async (item: IntegrationItem) => {
    setActingId(item.id);
    try {
      await apiClient.syncIntegration(item.id);
      showToast("success", `${item.displayName} synced.`);
      await loadAll();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Sync failed.");
    } finally {
      setActingId(null);
    }
  };

  const handleDisconnect = async (item: IntegrationItem) => {
    setActingId(item.id);
    try {
      await apiClient.disconnectIntegration(item.id);
      showToast("info", `${item.displayName} disconnected.`);
      await loadAll();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Disconnect failed.");
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Header Banner */}
      <section className="nohby-frame flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h2 className="font-display text-base font-semibold text-white">
            Connected Platforms &amp; Plugins
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Connect Social Media, Meeting apps, Emails, Calendar, and productivity plugins with scoped permissions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {connected.length} Connected
          </span>
          <button
            type="button"
            onClick={loadAll}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#101624] px-3 text-xs text-zinc-300 hover:border-[#00D4FF]/40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </section>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              category === cat.id
                ? "nohby-nav-active text-white"
                : "border-white/[0.08] bg-[#101624] text-zinc-400 hover:text-white"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {loading && providers.length === 0 ? (
        <LoadingState message="Loading integrations catalog..." />
      ) : (
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 lg:grid-cols-4">
          {filteredProviders.map((spec) => {
            const activeConn = connectedByProvider.get(spec.provider);
            const isConnected = Boolean(activeConn);

            return (
              <div
                key={spec.provider}
                className="nohby-frame flex flex-col justify-between p-2.5 sm:p-3.5 transition hover:-translate-y-0.5"
              >
                <div>
                  <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-start">
                    <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                      <ProviderLogo provider={spec.provider} className="h-8 w-8 shrink-0 rounded-lg shadow sm:h-9 sm:w-9" />
                      <div className="min-w-0">
                        <h3 className="truncate text-xs font-semibold text-white sm:text-[13px]">
                          {spec.displayName}
                        </h3>
                        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                          {spec.category}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium ${
                        isConnected
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-white/[0.06] text-zinc-400"
                      }`}
                    >
                      {isConnected ? "Connected" : "Available"}
                    </span>
                  </div>

                  <p className="mt-2 hidden text-[11px] leading-relaxed text-zinc-400 sm:line-clamp-2 sm:block">
                    {spec.description}
                  </p>

                  {activeConn && (
                    <div className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1.5 text-[10px]">
                      <p className="truncate font-medium text-emerald-400">
                        {activeConn.accountLabel}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-2.5 flex items-center gap-1.5 border-t border-white/[0.06] pt-2.5 sm:mt-3">
                  {activeConn ? (
                    <>
                      <button
                        type="button"
                        disabled={actingId === activeConn.id}
                        onClick={() => handleSync(activeConn)}
                        className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-[#00D4FF]/35 bg-[#00D4FF]/10 px-2 text-[11px] font-medium text-[#00D4FF] transition hover:bg-[#00D4FF]/20"
                      >
                        {actingId === activeConn.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        <span className="hidden sm:inline">Sync</span>
                      </button>
                      <button
                        type="button"
                        disabled={actingId === activeConn.id}
                        onClick={() => handleDisconnect(activeConn)}
                        className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2 text-[11px] text-rose-400 transition hover:bg-rose-500/20"
                        title="Disconnect"
                      >
                        <Unplug className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setConnectingProvider(spec);
                        setAccountLabel("");
                      }}
                      className="btn-ivory inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg px-2 text-[11px]"
                    >
                      <Plug className="h-3 w-3 shrink-0" />
                      <span className="truncate">Connect</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Connect Provider Modal */}
      {connectingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="nohby-frame dropdown-surface w-full max-w-md p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <ProviderLogo provider={connectingProvider.provider} className="h-10 w-10 rounded-xl" />
                <div>
                  <h3 className="font-display text-sm font-semibold text-white">
                    Connect {connectingProvider.displayName}
                  </h3>
                  <p className="text-[11px] text-zinc-400">Authorise scoped access for Nohby ONE</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConnectingProvider(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/[0.08] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConnectSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                  Account Email / Handle / Workspace
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={accountLabel}
                  onChange={(e) => setAccountLabel(e.target.value)}
                  placeholder={connectingProvider.accountPlaceholder}
                  className="studio-input h-9 w-full rounded-lg px-3 text-xs"
                />
              </div>

              <div className="rounded-xl border border-white/[0.08] bg-[#0C121E] p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#00D4FF]" />
                  Requested Scopes
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {connectingProvider.defaultScopes.map((sc) => (
                    <span
                      key={sc}
                      className="rounded-full border border-[#00D4FF]/30 bg-[#00D4FF]/10 px-2 py-0.5 font-mono text-[10px] text-[#00D4FF]"
                    >
                      {sc}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-zinc-500">
                  Sending emails or publishing social posts still requires your explicit per-action approval.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConnectingProvider(null)}
                  className="h-9 rounded-lg border border-white/[0.1] px-3.5 text-xs text-zinc-300 hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !accountLabel.trim()}
                  className="btn-ivory inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Authorise &amp; Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
