import { Layers } from "lucide-react";

import type { NavRoute } from "../types/api";

const PHASE_DETAILS: Record<
  Exclude<NavRoute, "home" | "devices" | "settings">,
  { phase: string; title: string; scope: string }
> = {
  assistant: {
    phase: "Phase 2",
    title: "AI Conversation & Streaming Workspace",
    scope:
      "Persistent conversations, multi-provider AI orchestration, and real-time WebSocket message streaming.",
  },
  tasks: {
    phase: "Phase 4",
    title: "Task Orchestration & Approval Centre",
    scope:
      "Structured multi-step execution plans, risk classification, scoped user approvals, and pause/cancel controls.",
  },
  meetings: {
    phase: "Phase 8",
    title: "Meeting Intelligence & Interview Prep",
    scope:
      "Consent-aware transcription, visible recording indicators, decision/action extraction, and profile-based prep.",
  },
  integrations: {
    phase: "Phase 7",
    title: "OAuth Integrations (Calendar, Email, LinkedIn)",
    scope:
      "Encrypted provider credentials, calendar availability checks, email draft approvals, and compliant social publishing.",
  },
  files: {
    phase: "Phase 6",
    title: "File & Document Intelligence",
    scope:
      "Authorised local directory access, document summarisation, structured extraction, and semantic indexing.",
  },
  memory: {
    phase: "Phase 9",
    title: "Personal Memory & Personalisation",
    scope:
      "User-confirmed persistent preferences and project context backed by pgvector with full edit/delete controls.",
  },
};

export function UpcomingModuleScreen({
  route,
}: {
  route: Exclude<NavRoute, "home" | "devices" | "settings">;
}) {
  const info = PHASE_DETAILS[route];

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center rounded-3xl border border-dashed border-slate-800 bg-[#111622]/60 px-8 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-400">
        <Layers className="h-6 w-6" />
      </div>
      <span className="mt-4 rounded-full bg-indigo-500/15 px-3 py-1 font-mono text-xs font-medium text-indigo-300 ring-1 ring-indigo-500/30">
        Scheduled for {info.phase}
      </span>
      <h2 className="mt-3 text-lg font-semibold text-slate-100">{info.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{info.scope}</p>
      <p className="mt-4 text-xs text-slate-500">
        Per Nohby ONE engineering governance, this screen will be activated once its backend APIs,
        permissions, and end-to-end tests are implemented.
      </p>
    </div>
  );
}
