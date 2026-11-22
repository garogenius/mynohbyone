import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Unplug,
  X,
} from "lucide-react";

import { ProviderLogo } from "../components/ProviderLogo";
import { LoadingState } from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { IntegrationItem, IntegrationProviderSpec } from "../types/api";

const POPULAR_PLUGINS: IntegrationProviderSpec[] = [
  {
    provider: "gmail",
    displayName: "Gmail",
    category: "email",
    description: "Read and manage Gmail",
    defaultScopes: ["email.read", "email.draft", "email.send_approved"],
    authType: "oauth2",
    accountPlaceholder: "you@gmail.com",
  },
  {
    provider: "google_drive",
    displayName: "Google Drive",
    category: "plugins",
    description: "Drive, Docs, Sheets or Slides",
    defaultScopes: ["drive.read", "docs.read", "sheets.read"],
    authType: "oauth2",
    accountPlaceholder: "you@gmail.com",
  },
  {
    provider: "remote_desktop",
    displayName: "Remote Desktop Commander",
    category: "plugins",
    description: "Use your computer from chat",
    defaultScopes: ["desktop.inspect", "desktop.execute_approved"],
    authType: "local_agent",
    accountPlaceholder: "Local Desktop Node",
  },
  {
    provider: "health",
    displayName: "Health",
    category: "plugins",
    description: "Explore your health data",
    defaultScopes: ["health.metrics.read", "health.insights"],
    authType: "oauth2",
    accountPlaceholder: "Apple Health / Google Fit",
  },
  {
    provider: "github",
    displayName: "GitHub",
    category: "plugins",
    description: "Triage PRs, issues, CI, and publish flows",
    defaultScopes: ["repo.read", "issues.read"],
    authType: "oauth2",
    accountPlaceholder: "github.com/username",
  },
  {
    provider: "supabase",
    displayName: "Supabase",
    category: "plugins",
    description: "Manage and query databases",
    defaultScopes: ["db.read", "db.query", "projects.read"],
    authType: "api_key",
    accountPlaceholder: "project-ref.supabase.co",
  },
];

const EXTRA_NOTEWORTHY_PLUGINS: IntegrationProviderSpec[] = [
  {
    provider: "icloud_mail",
    displayName: "iCloud Mail",
    category: "email",
    description: "Read and manage iCloud email",
    defaultScopes: ["mail.read", "mail.draft"],
    authType: "oauth2",
    accountPlaceholder: "you@icloud.com",
  },
  {
    provider: "icloud_calendar",
    displayName: "iCloud Calendar",
    category: "calendar",
    description: "Read and manage iCloud events",
    defaultScopes: ["calendar.read", "calendar.write"],
    authType: "oauth2",
    accountPlaceholder: "you@icloud.com",
  },
];

const SHORT_SUBTITLES: Record<string, string> = {
  gmail: "Read and manage Gmail",
  google_drive: "Drive, Docs, Sheets or Slides",
  remote_desktop: "Use your computer from chat",
  health: "Explore your health data",
  github: "Triage PRs, issues, CI, and publish flows",
  supabase: "Manage and query databases",
  icloud_mail: "Read and manage iCloud email",
  icloud_calendar: "Read and manage iCloud events",
  outlook: "Read and manage Outlook email & calendar",
  zoom: "Sync Zoom calls and stealth interview coaching",
  google_meet: "Capture Google Meet transcripts & coaching hints",
  microsoft_teams: "Connect Teams meetings and channels",
  google_calendar: "Check availability and schedule events",
  slack: "Summarize team channels and draft replies",
  notion: "Sync workspace pages and project databases",
  whatsapp: "Draft replies and send approved WhatsApp updates",
  linkedin: "Draft executive posts and manage profile updates",
  x_twitter: "Draft threads and publish scheduled posts",
  instagram: "Prepare captions and creator content calendars",
  facebook: "Manage page announcements and campaigns",
  youtube: "Summarize videos and manage channel metadata",
};

export function IntegrationsScreen() {
  const { showToast } = useAppStore();

  const [providers, setProviders] = useState<IntegrationProviderSpec[]>([]);
  const [connected, setConnected] = useState<IntegrationItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [menuOpenProvider, setMenuOpenProvider] = useState<string | null>(null);

  // Connect modal state
  const [connectingProvider, setConnectingProvider] = useState<IntegrationProviderSpec | null>(null);
  const [accountLabel, setAccountLabel] = useState("");
  const [configWaPhoneId, setConfigWaPhoneId] = useState("");
  const [configWaToken, setConfigWaToken] = useState("");
  const [configSmtpHost, setConfigSmtpHost] = useState("");
  const [configSmtpPass, setConfigSmtpPass] = useState("");
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
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
      showToast("error", err instanceof ApiError ? err.message : "Failed to load plugins.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Merge backend catalog with Popular & Noteworthy items so all plugins always appear
  const mergedMap = new Map<string, IntegrationProviderSpec>();
  for (const p of [...POPULAR_PLUGINS, ...EXTRA_NOTEWORTHY_PLUGINS, ...providers]) {
    const existing = mergedMap.get(p.provider);
    mergedMap.set(p.provider, {
      ...(existing || p),
      ...p,
      description: SHORT_SUBTITLES[p.provider] || p.description,
    });
  }
  const allCatalog = Array.from(mergedMap.values());
  const connectedByProvider = new Map(connected.map((c) => [c.provider, c]));

  const query = search.trim().toLowerCase();
  const matchesSearch = (p: IntegrationProviderSpec) =>
    !query ||
    p.displayName.toLowerCase().includes(query) ||
    p.description.toLowerCase().includes(query) ||
    p.category.toLowerCase().includes(query);

  const popularIds = new Set(POPULAR_PLUGINS.map((p) => p.provider));
  const popularList = POPULAR_PLUGINS.map((p) => mergedMap.get(p.provider) || p).filter(
    matchesSearch
  );
  const noteworthyList = allCatalog
    .filter((p) => !popularIds.has(p.provider))
    .filter(matchesSearch);

  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectingProvider || !accountLabel.trim() || submitting) return;

    const configPayload: Record<string, unknown> = {};
    if (connectingProvider.provider === "whatsapp") {
      if (configWaPhoneId.trim()) configPayload.phoneNumberId = configWaPhoneId.trim();
      if (configWaToken.trim()) configPayload.accessToken = configWaToken.trim();
    } else if (["gmail", "email", "outlook"].includes(connectingProvider.provider)) {
      if (configSmtpHost.trim()) configPayload.smtpHost = configSmtpHost.trim();
      if (configSmtpPass.trim()) configPayload.smtpPassword = configSmtpPass.trim();
    }

    setSubmitting(true);
    try {
      await apiClient.connectIntegration(connectingProvider.provider, {
        accountLabel: accountLabel.trim(),
        scopes: connectingProvider.defaultScopes,
        config: Object.keys(configPayload).length > 0 ? configPayload : undefined,
      });
      showToast("success", `${connectingProvider.displayName} connected.`);
      setConnectingProvider(null);
      setAccountLabel("");
      setConfigWaPhoneId("");
      setConfigWaToken("");
      setConfigSmtpHost("");
      setConfigSmtpPass("");
      setShowAdvancedConfig(false);
      await loadAll();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Connection failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSync = async (item: IntegrationItem) => {
    setActingId(item.id);
    setMenuOpenProvider(null);
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
    setMenuOpenProvider(null);
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

  const handleTestPlugin = async (item: IntegrationItem) => {
    setActingId(item.id);
    setMenuOpenProvider(null);
    try {
      const res = await apiClient.testIntegrationConnection(item.provider);
      showToast("success", res.message || `${item.displayName} verified: online and responsive.`);
      await loadAll();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Plugin verification failed.");
    } finally {
      setActingId(null);
    }
  };

  const renderPluginRow = (spec: IntegrationProviderSpec) => {
    const conn = connectedByProvider.get(spec.provider);
    const isConnected = Boolean(conn && conn.status === "connected");
    const isBusy = Boolean(conn && actingId === conn.id);
    const isMenuOpen = menuOpenProvider === spec.provider;

    return (
      <div
        key={spec.provider}
        className="group relative flex items-center justify-between gap-3.5 rounded-2xl px-3 py-2.5 transition hover:bg-white/[0.04]"
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.1] bg-[#141B2D]/80 p-1 shadow-xs">
            <ProviderLogo provider={spec.provider} className="h-full w-full" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-[13.5px] font-semibold text-white">
                {spec.displayName}
              </p>
              {isConnected && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.2 text-[9.5px] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Connected
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-zinc-400">
              {isConnected && conn?.accountLabel
                ? `${spec.description} · ${conn.accountLabel}`
                : spec.description}
            </p>
          </div>
        </div>

        {/* Right Action Button: + when disconnected, ••• when connected */}
        <div className="relative shrink-0">
          {isConnected && conn ? (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  setMenuOpenProvider((cur) => (cur === spec.provider ? null : spec.provider))
                }
                aria-label={`Manage ${spec.displayName}`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
              >
                {isBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-[#00D4FF]" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </button>

              {isMenuOpen && (
                <div className="dropdown-surface absolute right-0 top-full z-30 mt-1 w-44 rounded-xl p-1.5 shadow-xl">
                  <button
                    type="button"
                    onClick={() => handleTestPlugin(conn)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-emerald-300 transition hover:bg-emerald-500/10"
                  >
                    <Play className="h-3.5 w-3.5 text-emerald-400" />
                    Test Connection
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSync(conn)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-[#00D4FF]" />
                    Sync Now
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisconnect(conn)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-rose-400 transition hover:bg-rose-500/10"
                  >
                    <Unplug className="h-3.5 w-3.5" />
                    Disconnect
                  </button>
                </div>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setConnectingProvider(spec);
                setAccountLabel("");
              }}
              aria-label={`Connect ${spec.displayName}`}
              title={`Connect ${spec.displayName}`}
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-2 py-2 sm:px-4">
      {/* Top Plugins Header matching reference screenshot */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-xl font-semibold text-white">Plugins</h1>
            {connected.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                {connected.length} active
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Connect plugins to let NohbyAI work across your tools
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plugins"
            className="studio-input h-9 w-full rounded-full pl-9 pr-4 text-xs"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading plugins directory..." />
      ) : (
        <div className="space-y-8">
          {/* Popular Section */}
          {popularList.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-1 px-2">
                <h2 className="font-display text-sm font-semibold text-white">Popular</h2>
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </div>

              <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
                {popularList.map(renderPluginRow)}
              </div>
            </section>
          )}

          {/* New & Noteworthy Section */}
          {noteworthyList.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-1 px-2">
                <h2 className="font-display text-sm font-semibold text-white">
                  New &amp; Noteworthy
                </h2>
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </div>

              <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2">
                {noteworthyList.map(renderPluginRow)}
              </div>
            </section>
          )}

          {popularList.length === 0 && noteworthyList.length === 0 && (
            <div className="py-12 text-center text-xs text-zinc-400">
              No plugins matching &ldquo;{search}&rdquo;.
            </div>
          )}
        </div>
      )}

      {/* Connect Plugin Modal */}
      {connectingProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="dropdown-surface w-full max-w-md rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <ProviderLogo provider={connectingProvider.provider} className="h-10 w-10" />
                <div>
                  <h3 className="font-display text-sm font-semibold text-white">
                    Connect {connectingProvider.displayName}
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    Scoped {connectingProvider.authType.toUpperCase()} Authorization
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConnectingProvider(null)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleConnectSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-300">
                  Account / Workspace Identifier
                </label>
                <input
                  type="text"
                  required
                  value={accountLabel}
                  onChange={(e) => setAccountLabel(e.target.value)}
                  placeholder={connectingProvider.accountPlaceholder}
                  autoFocus
                  className="studio-input h-9 w-full rounded-lg px-3 text-xs"
                />
              </div>

              {/* Optional Advanced API / Gateway Configuration */}
              {(connectingProvider.provider === "whatsapp" ||
                ["gmail", "email", "outlook"].includes(connectingProvider.provider)) && (
                <div className="rounded-xl border border-white/[0.08] bg-[#101726]/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-zinc-300">
                      {connectingProvider.provider === "whatsapp"
                        ? "Meta WhatsApp Cloud API (Optional)"
                        : "Custom SMTP Dispatch Gateway (Optional)"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedConfig((v) => !v)}
                      className="text-[10px] font-medium text-[#00D4FF] hover:underline"
                    >
                      {showAdvancedConfig ? "Hide" : "Configure"}
                    </button>
                  </div>

                  {!showAdvancedConfig && (
                    <p className="mt-1 text-[10px] text-zinc-400">
                      {connectingProvider.provider === "whatsapp"
                        ? "Nohby ONE will use the Direct WhatsApp Bridge (wa.me) for 1-click messaging."
                        : "Nohby ONE will use the secure Cloud Mail Gateway."}
                    </p>
                  )}

                  {showAdvancedConfig && connectingProvider.provider === "whatsapp" && (
                    <div className="mt-2.5 space-y-2">
                      <div>
                        <label className="mb-1 block text-[10px] text-zinc-400">
                          Meta Phone Number ID
                        </label>
                        <input
                          type="text"
                          value={configWaPhoneId}
                          onChange={(e) => setConfigWaPhoneId(e.target.value)}
                          placeholder="e.g. 104829104819482"
                          className="studio-input h-7 w-full rounded-md px-2.5 text-[11px]"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-zinc-400">
                          System User Access Token
                        </label>
                        <input
                          type="password"
                          value={configWaToken}
                          onChange={(e) => setConfigWaToken(e.target.value)}
                          placeholder="EAAB..."
                          className="studio-input h-7 w-full rounded-md px-2.5 text-[11px]"
                        />
                      </div>
                    </div>
                  )}

                  {showAdvancedConfig &&
                    ["gmail", "email", "outlook"].includes(connectingProvider.provider) && (
                      <div className="mt-2.5 space-y-2">
                        <div>
                          <label className="mb-1 block text-[10px] text-zinc-400">SMTP Host</label>
                          <input
                            type="text"
                            value={configSmtpHost}
                            onChange={(e) => setConfigSmtpHost(e.target.value)}
                            placeholder={
                              connectingProvider.provider === "gmail"
                                ? "smtp.gmail.com"
                                : "smtp-mail.outlook.com"
                            }
                            className="studio-input h-7 w-full rounded-md px-2.5 text-[11px]"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] text-zinc-400">
                            App Password / Token
                          </label>
                          <input
                            type="password"
                            value={configSmtpPass}
                            onChange={(e) => setConfigSmtpPass(e.target.value)}
                            placeholder="App-specific password"
                            className="studio-input h-7 w-full rounded-md px-2.5 text-[11px]"
                          />
                        </div>
                      </div>
                    )}
                </div>
              )}

              <div className="rounded-xl border border-white/[0.08] bg-[#141B2D]/70 p-3">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#00D4FF]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Granted Scopes (Approval-Gated)</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {connectingProvider.defaultScopes.map((scope) => (
                    <span
                      key={scope}
                      className="rounded-md border border-white/[0.1] bg-[#161E30] px-2 py-0.5 font-mono text-[10px] text-zinc-300"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setConnectingProvider(null)}
                  className="h-8 rounded-lg border border-white/[0.1] px-3 text-xs text-zinc-300 hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !accountLabel.trim()}
                  className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-4 text-xs"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plug className="h-3.5 w-3.5" />
                  )}
                  Authorize &amp; Connect
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
