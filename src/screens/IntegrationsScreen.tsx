import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  MessageSquare,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Unplug,
  X,
} from "lucide-react";

import { ProviderLogo } from "../components/ProviderLogo";
import { LoadingState } from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { IntegrationItem, IntegrationProviderSpec } from "../types/api";

interface PluginMetadata {
  publisher: string;
  categoryName: string;
  verified: boolean;
  capabilities: string[];
  samplePrompts: string[];
  ctaLabel: string;
  accountPrompt: string;
  accountPlaceholder: string;
  authTypeLabel: string;
}

const PLUGIN_METADATA: Record<string, PluginMetadata> = {
  whatsapp: {
    publisher: "Meta Platforms",
    categoryName: "Messaging & Social",
    verified: true,
    capabilities: [
      "Send WhatsApp messages directly to contacts or phone numbers from chat",
      "Draft messages from voice commands or chat prompts",
      "Strict human-in-the-loop approval card before every message dispatch",
      "Direct WhatsApp Web & App 1-click bridge (wa.me) or Meta Cloud API",
    ],
    samplePrompts: [
      "Send a message to Abubakar on WhatsApp saying I'll be 15 minutes late",
      "Draft a WhatsApp follow-up for the project team",
      "Tell Alex on WhatsApp that the client signed the agreement",
    ],
    ctaLabel: "Connect WhatsApp Account",
    accountPrompt: "Your WhatsApp Phone Number (with Country Code)",
    accountPlaceholder: "+234 801 234 5678 or +44 7700 900000",
    authTypeLabel: "Direct Bridge & Meta Cloud API",
  },
  gmail: {
    publisher: "Google LLC",
    categoryName: "Email & Communication",
    verified: true,
    capabilities: [
      "Draft professional email replies based on conversation context",
      "Send emails after your explicit preview, editing, and approval",
      "Read relevant email threads, briefs, and client inquiries",
    ],
    samplePrompts: [
      "Draft an email to client@example.com with the meeting notes",
      "Send a project update email to the marketing team",
    ],
    ctaLabel: "Continue with Google",
    accountPrompt: "Google Email Address",
    accountPlaceholder: "you@gmail.com",
    authTypeLabel: "Google OAuth 2.0",
  },
  google_drive: {
    publisher: "Google LLC",
    categoryName: "Cloud Storage & Docs",
    verified: true,
    capabilities: [
      "Access Google Docs, Sheets, and Slides for conversation context",
      "Summarize cloud documents, research spreadsheets, and slides",
      "Export research notes and meeting briefs directly to Google Drive",
    ],
    samplePrompts: [
      "Summarize the latest strategy doc from my Google Drive",
      "Export this interview debrief to Google Docs",
    ],
    ctaLabel: "Continue with Google Drive",
    accountPrompt: "Google Account Email",
    accountPlaceholder: "you@gmail.com",
    authTypeLabel: "Google OAuth 2.0",
  },
  google_calendar: {
    publisher: "Google LLC",
    categoryName: "Productivity & Scheduling",
    verified: true,
    capabilities: [
      "Check schedule availability and upcoming calendar meetings",
      "Create calendar events and team meetings directly from chat",
      "Pre-call briefing notes and conflict detection",
    ],
    samplePrompts: [
      "Schedule a 30-min sync with Alex tomorrow at 2 PM",
      "What is on my calendar for Friday afternoon?",
    ],
    ctaLabel: "Continue with Google Calendar",
    accountPrompt: "Google Calendar Email",
    accountPlaceholder: "you@gmail.com",
    authTypeLabel: "Google OAuth 2.0",
  },
  github: {
    publisher: "GitHub, Inc.",
    categoryName: "Developer Tools & CI/CD",
    verified: true,
    capabilities: [
      "Triage pull requests, issues, and workflow runs",
      "Create bug issues directly from chat with code snippets and reproduction steps",
      "Inspect repository commits, PR reviews, and deployment status",
    ],
    samplePrompts: [
      "Create a GitHub issue titled 'Fix dark theme contrast on task calendar'",
      "Check the status of recent pull requests",
    ],
    ctaLabel: "Authorize with GitHub",
    accountPrompt: "GitHub Username or Organization",
    accountPlaceholder: "github.com/username",
    authTypeLabel: "GitHub OAuth / Token",
  },
  slack: {
    publisher: "Salesforce / Slack",
    categoryName: "Team Collaboration",
    verified: true,
    capabilities: [
      "Post channel announcements and status updates with approval",
      "Draft team replies and summarize unread discussions",
      "Send urgent alerts to #general or dedicated project channels",
    ],
    samplePrompts: [
      "Post an update to #general saying the new build is deployed",
      "Summarize the unread discussions in #team-dev",
    ],
    ctaLabel: "Add to Slack",
    accountPrompt: "Slack Workspace Domain",
    accountPlaceholder: "your-workspace.slack.com",
    authTypeLabel: "Slack OAuth 2.0",
  },
  notion: {
    publisher: "Notion Labs",
    categoryName: "Knowledge & Project Management",
    verified: true,
    capabilities: [
      "Sync workspace pages, task boards, and structured databases",
      "Create new meeting notes and action items inside Notion databases",
      "Search documentation and technical specifications",
    ],
    samplePrompts: [
      "Add these action items to my Notion Project Board",
      "Find the architecture notes in Notion",
    ],
    ctaLabel: "Connect Notion Workspace",
    accountPrompt: "Notion Workspace Name",
    accountPlaceholder: "Company Notion Workspace",
    authTypeLabel: "Notion OAuth 2.0",
  },
  outlook: {
    publisher: "Microsoft Corporation",
    categoryName: "Workplace & Communications",
    verified: true,
    capabilities: [
      "Sync Outlook emails and Microsoft 365 calendar schedules",
      "Draft approval-gated messages and meeting invitations",
      "Summarize corporate email threads and attachments",
    ],
    samplePrompts: [
      "Draft an Outlook email to finance regarding the invoice",
    ],
    ctaLabel: "Sign in with Microsoft",
    accountPrompt: "Microsoft 365 / Outlook Email",
    accountPlaceholder: "you@company.com",
    authTypeLabel: "Microsoft OAuth 2.0",
  },
  zoom: {
    publisher: "Zoom Video Communications",
    categoryName: "Video Meetings",
    verified: true,
    capabilities: [
      "Detect active Zoom calls and trigger stealth Q&A copilot",
      "Generate post-call summaries, action items, and follow-ups",
    ],
    samplePrompts: [
      "Start stealth interview copilot for my upcoming Zoom call",
    ],
    ctaLabel: "Connect Zoom Account",
    accountPrompt: "Zoom Account Email",
    accountPlaceholder: "you@company.com",
    authTypeLabel: "Zoom OAuth 2.0",
  },
  supabase: {
    publisher: "Supabase, Inc.",
    categoryName: "Database & Backend",
    verified: true,
    capabilities: [
      "Inspect database tables, schema, and project status",
      "Run read-only analytical queries with explicit approval",
    ],
    samplePrompts: [
      "Check active users table in Supabase",
    ],
    ctaLabel: "Connect Supabase Project",
    accountPrompt: "Supabase Project URL or Reference",
    accountPlaceholder: "project-ref.supabase.co",
    authTypeLabel: "Supabase API Key",
  },
  remote_desktop: {
    publisher: "Nohby Technologies",
    categoryName: "Local OS Runtime",
    verified: true,
    capabilities: [
      "Use your local computer directly from chat commands",
      "Open local applications, search files, and trigger background tasks",
      "Hardware-isolated local node execution",
    ],
    samplePrompts: [
      "Open my browser to GitHub",
      "Launch screen-share invisible meeting mode",
    ],
    ctaLabel: "Pair Desktop Node",
    accountPrompt: "Desktop Device Name",
    accountPlaceholder: "Primary Desktop Runtime",
    authTypeLabel: "Local Node Token",
  },
  health: {
    publisher: "Apple & Google Health",
    categoryName: "Personal Wellbeing",
    verified: true,
    capabilities: [
      "Explore sleep, step count, and physical wellbeing metrics",
      "Correlate deep work sessions with recovery data",
    ],
    samplePrompts: [
      "Show my weekly sleep and focus hours correlation",
    ],
    ctaLabel: "Connect Health Sync",
    accountPrompt: "Apple Health / Google Fit Account",
    accountPlaceholder: "Apple Health Node",
    authTypeLabel: "Encrypted Health Bridge",
  },
};

const POPULAR_PLUGINS: IntegrationProviderSpec[] = [
  {
    provider: "whatsapp",
    displayName: "WhatsApp",
    category: "social",
    description: "Send WhatsApp messages and status updates directly from chat",
    defaultScopes: ["messages.draft", "messages.send_approved"],
    authType: "api_bridge",
    accountPlaceholder: "+234 801 234 5678",
  },
  {
    provider: "gmail",
    displayName: "Gmail",
    category: "email",
    description: "Read, draft, and send emails with approval",
    defaultScopes: ["email.read", "email.draft", "email.send_approved"],
    authType: "oauth2",
    accountPlaceholder: "you@gmail.com",
  },
  {
    provider: "google_drive",
    displayName: "Google Drive",
    category: "plugins",
    description: "Drive, Docs, Sheets or Slides context & exports",
    defaultScopes: ["drive.read", "docs.read", "sheets.read"],
    authType: "oauth2",
    accountPlaceholder: "you@gmail.com",
  },
  {
    provider: "google_calendar",
    displayName: "Google Calendar",
    category: "calendar",
    description: "Check schedule and book meetings from chat",
    defaultScopes: ["calendar.read", "calendar.write"],
    authType: "oauth2",
    accountPlaceholder: "you@gmail.com",
  },
  {
    provider: "github",
    displayName: "GitHub",
    category: "plugins",
    description: "Triage PRs, create issues, and inspect repository health",
    defaultScopes: ["repo.read", "issues.read", "issues.write_approved"],
    authType: "oauth2",
    accountPlaceholder: "github.com/username",
  },
  {
    provider: "slack",
    displayName: "Slack",
    category: "plugins",
    description: "Summarize team channels and post updates",
    defaultScopes: ["channels.read", "messages.draft", "messages.post_approved"],
    authType: "oauth2",
    accountPlaceholder: "workspace.slack.com",
  },
  {
    provider: "notion",
    displayName: "Notion",
    category: "plugins",
    description: "Sync workspace pages, databases, and meeting notes",
    defaultScopes: ["pages.read", "pages.write"],
    authType: "oauth2",
    accountPlaceholder: "Notion Workspace",
  },
  {
    provider: "remote_desktop",
    displayName: "Remote Desktop Commander",
    category: "plugins",
    description: "Control your computer and launch native apps from chat",
    defaultScopes: ["desktop.inspect", "desktop.execute_approved"],
    authType: "local_agent",
    accountPlaceholder: "Local Desktop Node",
  },
];

const EXTRA_NOTEWORTHY_PLUGINS: IntegrationProviderSpec[] = [
  {
    provider: "outlook",
    displayName: "Microsoft Outlook",
    category: "email",
    description: "Read and manage Outlook email & calendar",
    defaultScopes: ["mail.read", "mail.draft", "calendar.read"],
    authType: "oauth2",
    accountPlaceholder: "you@company.com",
  },
  {
    provider: "zoom",
    displayName: "Zoom",
    category: "meetings",
    description: "Detect Zoom calls and trigger stealth interview copilot",
    defaultScopes: ["meeting.read", "transcript.local"],
    authType: "oauth2",
    accountPlaceholder: "you@company.com",
  },
  {
    provider: "supabase",
    displayName: "Supabase",
    category: "plugins",
    description: "Manage, inspect, and query databases",
    defaultScopes: ["db.read", "db.query", "projects.read"],
    authType: "api_key",
    accountPlaceholder: "project-ref.supabase.co",
  },
  {
    provider: "health",
    displayName: "Health",
    category: "plugins",
    description: "Explore sleep, focus, and physical wellbeing metrics",
    defaultScopes: ["health.metrics.read", "health.insights"],
    authType: "oauth2",
    accountPlaceholder: "Apple Health / Google Fit",
  },
  {
    provider: "linkedin",
    displayName: "LinkedIn",
    category: "social",
    description: "Draft executive posts and manage profile updates",
    defaultScopes: ["profile.read", "posts.publish_approved"],
    authType: "oauth2",
    accountPlaceholder: "linkedin.com/in/yourprofile",
  },
  {
    provider: "x_twitter",
    displayName: "X (Twitter)",
    category: "social",
    description: "Draft threads and publish scheduled posts",
    defaultScopes: ["posts.draft", "posts.publish_approved"],
    authType: "oauth2",
    accountPlaceholder: "@yourhandle",
  },
];

export function IntegrationsScreen() {
  const { user, showToast, setRoute } = useAppStore();

  const [providers, setProviders] = useState<IntegrationProviderSpec[]>([]);
  const [connected, setConnected] = useState<IntegrationItem[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);

  // ChatGPT-style Plugin Modal State
  const [selectedSpec, setSelectedSpec] = useState<IntegrationProviderSpec | null>(null);
  const [accountLabel, setAccountLabel] = useState("");
  const [configWaPhoneId, setConfigWaPhoneId] = useState("");
  const [configWaToken, setConfigWaToken] = useState("");
  const [configSmtpHost, setConfigSmtpHost] = useState("");
  const [configSmtpPass, setConfigSmtpPass] = useState("");
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [testResult, setTestResult] = useState<{
    tested: boolean;
    success: boolean;
    message: string;
    checkedAt?: string;
  } | null>(null);
  const [testingPlugin, setTestingPlugin] = useState(false);

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

  // Catalog merge
  const mergedMap = new Map<string, IntegrationProviderSpec>();
  for (const p of [...POPULAR_PLUGINS, ...EXTRA_NOTEWORTHY_PLUGINS, ...providers]) {
    const existing = mergedMap.get(p.provider);
    mergedMap.set(p.provider, {
      ...(existing || p),
      ...p,
      description: PLUGIN_METADATA[p.provider]?.capabilities[0] || p.description,
    });
  }
  const allCatalog = Array.from(mergedMap.values());
  const connectedByProvider = new Map(connected.map((c) => [c.provider, c]));

  // Global event listener to open plugin modal from chat (e.g. from PluginApprovalCard shortcut)
  useEffect(() => {
    const onOpenModal = (e: Event) => {
      const detail = (e as CustomEvent<{ provider?: string }>).detail;
      if (detail?.provider) {
        const spec = allCatalog.find((p) => p.provider === detail.provider);
        if (spec) {
          const conn = connectedByProvider.get(spec.provider);
          setSelectedSpec(spec);
          setAccountLabel(conn?.accountLabel || user?.email || "");
          setTestResult(null);
        }
      }
    };
    window.addEventListener("nohby-open-plugin-modal", onOpenModal);
    return () => window.removeEventListener("nohby-open-plugin-modal", onOpenModal);
  }, [allCatalog, connectedByProvider, user?.email]);

  const query = search.trim().toLowerCase();
  const matchesSearch = (p: IntegrationProviderSpec) => {
    const meta = PLUGIN_METADATA[p.provider];
    const catMatch =
      categoryFilter === "all" ||
      p.category === categoryFilter ||
      (meta && meta.categoryName.toLowerCase().includes(categoryFilter));
    if (!catMatch) return false;
    if (!query) return true;
    return (
      p.displayName.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query) ||
      (meta && meta.publisher.toLowerCase().includes(query)) ||
      (meta && meta.capabilities.some((c) => c.toLowerCase().includes(query)))
    );
  };

  const popularIds = new Set(POPULAR_PLUGINS.map((p) => p.provider));
  const popularList = POPULAR_PLUGINS.map((p) => mergedMap.get(p.provider) || p).filter(matchesSearch);
  const noteworthyList = allCatalog.filter((p) => !popularIds.has(p.provider)).filter(matchesSearch);

  const handleOpenPlugin = (spec: IntegrationProviderSpec) => {
    const conn = connectedByProvider.get(spec.provider);
    setSelectedSpec(spec);
    setTestResult(null);
    setShowAdvancedConfig(false);
    if (conn) {
      setAccountLabel(conn.accountLabel || "");
    } else {
      // Friendly auto-fills based on user account
      if (spec.provider === "whatsapp") {
        setAccountLabel("");
      } else if (["gmail", "google_drive", "google_calendar"].includes(spec.provider)) {
        setAccountLabel(user?.email || "");
      } else if (spec.provider === "github") {
        setAccountLabel("github.com/myworkspace");
      } else {
        setAccountLabel("");
      }
    }
  };

  const handleConnectSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedSpec || submitting) return;

    const finalLabel = accountLabel.trim() || user?.email || selectedSpec.accountPlaceholder;

    const configPayload: Record<string, unknown> = {};
    if (selectedSpec.provider === "whatsapp") {
      if (configWaPhoneId.trim()) configPayload.phoneNumberId = configWaPhoneId.trim();
      if (configWaToken.trim()) configPayload.accessToken = configWaToken.trim();
    } else if (["gmail", "email", "outlook"].includes(selectedSpec.provider)) {
      if (configSmtpHost.trim()) configPayload.smtpHost = configSmtpHost.trim();
      if (configSmtpPass.trim()) configPayload.smtpPassword = configSmtpPass.trim();
    }

    setSubmitting(true);
    try {
      await apiClient.connectIntegration(selectedSpec.provider, {
        accountLabel: finalLabel,
        scopes: selectedSpec.defaultScopes,
        config: Object.keys(configPayload).length > 0 ? configPayload : undefined,
      });
      showToast("success", `${selectedSpec.displayName} connected successfully.`);
      await loadAll();
      setTestResult(null);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Connection failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestConnection = async (provider: string) => {
    setTestingPlugin(true);
    setTestResult(null);
    try {
      const res = await apiClient.testIntegrationConnection(provider);
      setTestResult({
        tested: true,
        success: true,
        message: res.message || `${selectedSpec?.displayName || provider} is online and responsive.`,
        checkedAt: new Date().toLocaleTimeString(),
      });
      showToast("success", `${selectedSpec?.displayName || provider} verified: online and responsive.`);
      await loadAll();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Connection test failed.";
      setTestResult({
        tested: true,
        success: false,
        message: msg,
      });
      showToast("error", msg);
    } finally {
      setTestingPlugin(false);
    }
  };

  const handleDisconnect = async (item: IntegrationItem) => {
    setActingId(item.id);
    try {
      await apiClient.disconnectIntegration(item.id);
      showToast("info", `${item.displayName} disconnected.`);
      setTestResult(null);
      await loadAll();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Disconnect failed.");
    } finally {
      setActingId(null);
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

  const renderPluginCard = (spec: IntegrationProviderSpec) => {
    const conn = connectedByProvider.get(spec.provider);
    const isConnected = Boolean(conn && conn.status === "connected");
    const meta = PLUGIN_METADATA[spec.provider];

    return (
      <div
        key={spec.provider}
        onClick={() => handleOpenPlugin(spec)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleOpenPlugin(spec);
          }
        }}
        className="group relative flex cursor-pointer flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#0c121e]/90 p-4 shadow-sm transition duration-200 hover:border-[#00D4FF]/40 hover:bg-[#11192a] hover:shadow-md"
      >
        <div>
          {/* Card Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.1] bg-[#141B2D]/90 p-1.5 shadow-inner">
              <ProviderLogo provider={spec.provider} className="h-full w-full object-contain" />
            </div>

            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-0.5 text-[10.5px] font-medium text-zinc-400 transition group-hover:border-[#00D4FF]/40 group-hover:text-[#00D4FF]">
                <Plus className="h-3 w-3" />
                Connect
              </span>
            )}
          </div>

          {/* Title & Publisher */}
          <div className="mt-3">
            <div className="flex items-center gap-1.5">
              <h3 className="font-display text-[14px] font-semibold text-white group-hover:text-[#00D4FF] transition">
                {spec.displayName}
              </h3>
              {meta?.verified && (
                <span title="Verified Plugin">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#00D4FF]" />
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              {meta ? `By ${meta.publisher}` : spec.category}
            </p>
          </div>

          {/* Description */}
          <p className="mt-2 text-xs leading-relaxed text-zinc-300 line-clamp-2">
            {spec.description}
          </p>
        </div>

        {/* Footer info / connected label */}
        <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-2.5 text-[11px]">
          {isConnected && conn ? (
            <span className="truncate font-mono text-[10px] text-emerald-300">
              {conn.accountLabel}
            </span>
          ) : (
            <span className="text-[10.5px] text-zinc-400">
              {meta?.authTypeLabel || spec.authType.toUpperCase()}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 group-hover:text-[#00D4FF]">
            Details
            <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    );
  };

  const activeConnectedCount = connected.filter((c) => c.status === "connected").length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-3 py-3 sm:px-6">
      {/* Top Header matching ChatGPT Plugin Store */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-white">
              Plugins &amp; Tools
            </h1>
            {activeConnectedCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {activeConnectedCount} Active
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Connect real integrations to let NohbyAI send WhatsApp messages, draft emails, schedule calendar events, and manage tasks.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all plugins..."
            className="studio-input h-9 w-full rounded-full pl-9 pr-4 text-xs"
          />
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: "all", label: "All Plugins" },
          { id: "social", label: "Messaging & Social" },
          { id: "email", label: "Email" },
          { id: "calendar", label: "Calendar & Scheduling" },
          { id: "plugins", label: "Productivity & Dev" },
          { id: "meetings", label: "Meetings" },
        ].map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategoryFilter(cat.id)}
            className={`rounded-full px-3.5 py-1 text-xs font-medium transition ${
              categoryFilter === cat.id
                ? "bg-[#00D4FF]/20 text-[#00D4FF] ring-1 ring-[#00D4FF]/50"
                : "bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState message="Loading plugins directory..." />
      ) : (
        <div className="space-y-8">
          {/* Popular Section */}
          {popularList.length > 0 && (
            <section className="space-y-3.5">
              <div className="flex items-center gap-1.5 px-1">
                <Sparkles className="h-4 w-4 text-[#00D4FF]" />
                <h2 className="font-display text-sm font-semibold tracking-wide text-white">
                  Popular &amp; Essential
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {popularList.map(renderPluginCard)}
              </div>
            </section>
          )}

          {/* New & Noteworthy Section */}
          {noteworthyList.length > 0 && (
            <section className="space-y-3.5">
              <div className="flex items-center gap-1.5 px-1">
                <h2 className="font-display text-sm font-semibold tracking-wide text-white">
                  Workplace &amp; Professional Tools
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {noteworthyList.map(renderPluginCard)}
              </div>
            </section>
          )}

          {popularList.length === 0 && noteworthyList.length === 0 && (
            <div className="py-16 text-center text-xs text-zinc-400">
              No plugins matching &ldquo;{search}&rdquo;.
            </div>
          )}
        </div>
      )}

      {/* ChatGPT-Style Plugin Detail & Connection Modal */}
      {selectedSpec && (() => {
        const conn = connectedByProvider.get(selectedSpec.provider);
        const isConnected = Boolean(conn && conn.status === "connected");
        const meta = PLUGIN_METADATA[selectedSpec.provider];
        const isBusy = Boolean(actingId && conn && actingId === conn.id);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
            <div className="dropdown-surface flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/[0.14] bg-[#0c121e] shadow-2xl">
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-white/[0.08] bg-[#111827]/80 p-5">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.1] bg-[#162035] p-2 shadow-md">
                    <ProviderLogo provider={selectedSpec.provider} className="h-full w-full object-contain" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-lg font-bold text-white">
                        {selectedSpec.displayName}
                      </h2>
                      {meta?.verified && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.2 text-[10px] font-medium text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Verified Action
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {meta ? `By ${meta.publisher} · ${meta.categoryName}` : selectedSpec.category}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedSpec(null)}
                  className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs text-zinc-200">
                {/* Description */}
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    About this Plugin
                  </h4>
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">
                    {selectedSpec.description}
                  </p>
                </div>

                {/* Capabilities Checklist */}
                {meta?.capabilities && meta.capabilities.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                      What NohbyAI Can Do
                    </h4>
                    <ul className="mt-2 space-y-1.5">
                      {meta.capabilities.map((cap, i) => (
                        <li key={i} className="flex items-start gap-2 text-zinc-300">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00D4FF]" />
                          <span>{cap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Sample Prompt Pills */}
                {meta?.samplePrompts && meta.samplePrompts.length > 0 && (
                  <div className="rounded-xl border border-white/[0.08] bg-[#111929] p-3.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
                      <MessageSquare className="h-3.5 w-3.5 text-[#00D4FF]" />
                      <span>Try asking NohbyAI in chat:</span>
                    </div>
                    <div className="mt-2.5 flex flex-col gap-1.5">
                      {meta.samplePrompts.map((prompt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedSpec(null);
                            setRoute("assistant");
                            window.dispatchEvent(
                              new CustomEvent("nohby-prefill-chat", { detail: { prompt } })
                            );
                          }}
                          className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#0c121e] px-3 py-2 text-left text-[11.5px] text-zinc-300 transition hover:border-[#00D4FF]/40 hover:bg-[#141d30] hover:text-white"
                        >
                          <span className="italic">&ldquo;{prompt}&rdquo;</span>
                          <span className="ml-2 shrink-0 text-[10px] text-[#00D4FF]">Try in Chat &rarr;</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Security & Scopes Guarantee */}
                <div className="rounded-xl border border-white/[0.08] bg-[#0e1526] p-3.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
                    <ShieldCheck className="h-4 w-4" />
                    <span>Human-in-the-Loop Security Guarantee</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                    NohbyAI will always show an interactive confirmation card before dispatching messages, sending emails, or modifying data. Actions will only execute when you explicitly click Approve.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {selectedSpec.defaultScopes.map((scope) => (
                      <span
                        key={scope}
                        className="rounded-md border border-white/[0.08] bg-[#162035] px-2 py-0.5 font-mono text-[9.5px] text-zinc-300"
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Connection Status & Action Section */}
                {isConnected && conn ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="font-semibold text-emerald-300">
                          Connected &amp; Verified
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-emerald-400">
                        {conn.accountLabel}
                      </span>
                    </div>

                    {testResult && (
                      <div
                        className={`mt-3 rounded-lg border p-2.5 text-[11px] ${
                          testResult.success
                            ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-200"
                            : "border-rose-500/40 bg-rose-500/20 text-rose-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">
                            {testResult.success ? "✓ Verification Ping Passed" : "✕ Test Failed"}
                          </span>
                          {testResult.checkedAt && (
                            <span className="font-mono text-[10px] opacity-80">
                              {testResult.checkedAt}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5">{testResult.message}</p>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-500/20 pt-3">
                      <button
                        type="button"
                        disabled={testingPlugin}
                        onClick={() => handleTestConnection(selectedSpec.provider)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30"
                      >
                        {testingPlugin ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        Test Connection (Ping)
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleSync(conn)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] px-2.5 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.08]"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Sync
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDisconnect(conn)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
                        >
                          <Unplug className="h-3 w-3" />
                          Disconnect
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleConnectSubmit} className="space-y-4">
                    <div>
                      <label className="mb-1.5 block font-semibold text-zinc-200">
                        {meta?.accountPrompt || "Account Identifier"}
                      </label>
                      <input
                        type="text"
                        required
                        value={accountLabel}
                        onChange={(e) => setAccountLabel(e.target.value)}
                        placeholder={meta?.accountPlaceholder || selectedSpec.accountPlaceholder}
                        autoFocus
                        className="studio-input h-10 w-full rounded-xl px-3.5 text-xs"
                      />
                    </div>

                    {/* WhatsApp Custom Meta Gateway */}
                    {selectedSpec.provider === "whatsapp" && (
                      <div className="rounded-xl border border-white/[0.08] bg-[#111929] p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-zinc-300">
                            Meta WhatsApp Cloud API (Optional)
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowAdvancedConfig((v) => !v)}
                            className="text-[10.5px] font-medium text-[#00D4FF] hover:underline"
                          >
                            {showAdvancedConfig ? "Hide" : "Configure"}
                          </button>
                        </div>
                        {!showAdvancedConfig ? (
                          <p className="mt-1 text-[10.5px] text-zinc-400">
                            By default, Nohby ONE uses the Direct WhatsApp Bridge (wa.me) for instant 1-click messaging without complex API keys.
                          </p>
                        ) : (
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
                      </div>
                    )}

                    {/* Email SMTP Gateway */}
                    {["gmail", "email", "outlook"].includes(selectedSpec.provider) && (
                      <div className="rounded-xl border border-white/[0.08] bg-[#111929] p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-medium text-zinc-300">
                            Custom SMTP Dispatch Gateway (Optional)
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowAdvancedConfig((v) => !v)}
                            className="text-[10.5px] font-medium text-[#00D4FF] hover:underline"
                          >
                            {showAdvancedConfig ? "Hide" : "Configure"}
                          </button>
                        </div>
                        {!showAdvancedConfig ? (
                          <p className="mt-1 text-[10.5px] text-zinc-400">
                            Nohby ONE will use the secure Cloud Mail Gateway to prepare and dispatch your emails.
                          </p>
                        ) : (
                          <div className="mt-2.5 space-y-2">
                            <div>
                              <label className="mb-1 block text-[10px] text-zinc-400">SMTP Host</label>
                              <input
                                type="text"
                                value={configSmtpHost}
                                onChange={(e) => setConfigSmtpHost(e.target.value)}
                                placeholder={
                                  selectedSpec.provider === "gmail"
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

                    {/* Submit Button */}
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={submitting || !accountLabel.trim()}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#00D4FF] px-4 font-semibold text-[#070B14] shadow-lg shadow-[#00D4FF]/25 transition hover:bg-[#38e1ff] active:scale-[0.99] disabled:opacity-50"
                      >
                        {submitting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Plug className="h-4 w-4" />
                        )}
                        <span>{meta?.ctaLabel || `Connect ${selectedSpec.displayName}`}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
