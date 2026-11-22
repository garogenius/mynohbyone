import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Send,
  ShieldAlert,
  User,
  XCircle,
} from "lucide-react";
import { ProviderLogo } from "./ProviderLogo";
import { apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";

export interface PluginActionPayload {
  type?: string;
  provider?: string;
  tool?: string;
  recipient?: string;
  content?: string;
  message?: string;
  subject?: string;
  directUrl?: string;
  webUrl?: string;
  actionLabel?: string;
  taskId?: string;
  approvalId?: string;
  stepId?: string;
  [key: string]: unknown;
}

interface PluginApprovalCardProps {
  action: PluginActionPayload;
  onExecuted?: (evidence: Record<string, unknown>) => void;
}

export function PluginApprovalCard({ action, onExecuted }: PluginApprovalCardProps) {
  const { showToast } = useAppStore();
  const isDirect = action.type === "plugin_direct_dispatched" || Boolean(action.executed);
  const [status, setStatus] = useState<"pending" | "executing" | "delivered" | "rejected" | "error">(
    isDirect ? "delivered" : "pending"
  );
  const [evidence, setEvidence] = useState<Record<string, unknown> | null>(() => {
    if (action.evidence && typeof action.evidence === "object") {
      return action.evidence as Record<string, unknown>;
    }
    return null;
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const provider = (action.provider || (action.tool ? action.tool.split(".")[0] : "whatsapp")).toLowerCase();
  const recipient = action.recipient || "Contact";
  const content = action.content || action.message || "";
  const directUrl = action.directUrl || (evidence?.directChatUrl as string) || "";

  const getProviderTitle = () => {
    switch (provider) {
      case "whatsapp":
      case "whatsapp_business":
        return "WhatsApp Message";
      case "email":
      case "gmail":
      case "outlook":
        return "Email Dispatch";
      case "google_calendar":
      case "calendar":
        return "Calendar Schedule";
      case "slack":
        return "Slack Message";
      case "github":
        return "GitHub Issue";
      default:
        return "Plugin Action";
    }
  };

  const handleApprove = async () => {
    setStatus("executing");
    setErrorMessage(null);

    try {
      let executionEvidence: Record<string, unknown> | null = null;

      // 1. If an approvalId exists, resolve the task approval (which also auto-executes the plugin on backend)
      if (action.approvalId) {
        const approvalRes = await apiClient.approveAction(action.approvalId);
        executionEvidence = (approvalRes.data as any)?.outputData || { approved: true };
      }

      // 2. Also directly execute the plugin action to guarantee real dispatch & get fresh evidence
      const toolAction = action.tool && action.tool.includes(".") ? action.tool.split(".")[1] : "send_message";
      const execRes = await apiClient.executeIntegrationAction(provider, {
        action: toolAction,
        data: {
          recipient,
          message: content,
          content,
          subject: action.subject || "Message from Nohby ONE",
          instruction: action.actionLabel || `Send to ${recipient}`,
        },
      });

      if (execRes.data) {
        executionEvidence = { ...executionEvidence, ...execRes.data.evidence };
      }

      setEvidence(executionEvidence);
      setStatus("delivered");
      showToast("success", `${getProviderTitle()} dispatched successfully.`);
      onExecuted?.(executionEvidence || {});

      // If WhatsApp web bridge and direct link is ready, open directly
      const finalUrl = (executionEvidence?.directChatUrl as string) || directUrl;
      if (finalUrl && executionEvidence?.deliveryMethod === "whatsapp_bridge") {
        window.open(finalUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err: any) {
      const msg = err?.message || "Execution failed. Please check plugin connection.";
      setErrorMessage(msg);
      setStatus("error");
      showToast("error", msg);
    }
  };

  const handleReject = async () => {
    setStatus("rejected");
    try {
      if (action.approvalId) {
        await apiClient.rejectAction(action.approvalId);
      }
      showToast("info", "Action request dismissed.");
    } catch {
      // Ignored
    }
  };

  const openDirectLink = () => {
    const url = (evidence?.directChatUrl as string) || directUrl;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="my-2.5 overflow-hidden rounded-xl border border-white/[0.12] bg-[#0c121e] shadow-xl backdrop-blur-md transition">
      {/* Card Header */}
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#121929]/90 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 p-1">
            <ProviderLogo provider={provider} className="h-5 w-5 object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-white">{getProviderTitle()}</span>
              {status === "pending" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.2 text-[9px] font-medium text-amber-300">
                  <ShieldAlert className="h-2.5 w-2.5" />
                  Requires Approval
                </span>
              )}
              {status === "delivered" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.2 text-[9px] font-medium text-emerald-300">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  {isDirect ? "Dispatched Directly" : "Dispatched"}
                </span>
              )}
              {status === "rejected" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.2 text-[9px] font-medium text-zinc-400">
                  <XCircle className="h-2.5 w-2.5" />
                  Dismissed
                </span>
              )}
            </div>
            <p className="text-[10px] text-zinc-400">
              Target: <span className="font-mono text-zinc-200">{recipient}</span>
            </p>
          </div>
        </div>

        {directUrl && status !== "rejected" && (
          <button
            type="button"
            onClick={openDirectLink}
            title="Open in WhatsApp / Native App"
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.1] bg-[#182136] px-2 py-1 text-[10px] font-medium text-[#00D4FF] transition hover:bg-[#1f2b45]"
          >
            <ExternalLink className="h-3 w-3" />
            <span className="hidden sm:inline">Open</span>
          </button>
        )}
      </div>

      {/* Message Preview Body */}
      <div className="p-3.5">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] text-zinc-400">
          <User className="h-3 w-3 text-zinc-500" />
          <span>Message Content to be Sent:</span>
        </div>

        <div className="rounded-lg border border-white/[0.08] bg-[#090d16] p-3 text-xs leading-relaxed text-zinc-100 font-sans shadow-inner">
          <p className="italic text-zinc-200 whitespace-pre-wrap">"{content}"</p>
        </div>

        {/* Evidence banner if delivered */}
        {status === "delivered" && evidence && (
          <div className="mt-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-200">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="font-semibold text-emerald-300">
                {provider === "whatsapp" || provider === "whatsapp_business"
                  ? evidence.deliveryMethod === "meta_cloud_api"
                    ? "✓ Dispatched via Meta WhatsApp Cloud API"
                    : "✓ Dispatched via WhatsApp Web Bridge"
                  : provider === "github"
                    ? `✓ GitHub Issue #${evidence.issueNumber || "created"} created on ${evidence.repo || "repository"}`
                    : ["email", "gmail", "outlook"].includes(provider)
                      ? `✓ Email dispatched to ${evidence.recipient || recipient}`
                      : ["google_calendar", "calendar"].includes(provider)
                        ? `✓ Calendar event '${evidence.title || "Meeting"}' created`
                        : provider === "slack"
                          ? `✓ Slack message posted to ${evidence.channel || "#general"}`
                          : `✓ Action completed via ${provider}`}
              </span>
              {typeof evidence.messageId === "string" && (
                <span className="font-mono text-[9px] text-emerald-400">ID: {evidence.messageId}</span>
              )}
            </div>

            {/* Direct Link Actions */}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {(provider === "whatsapp" || provider === "whatsapp_business") && Boolean(evidence.directChatUrl || directUrl) && (
                <button
                  type="button"
                  onClick={openDirectLink}
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/20 px-2 py-1 text-[10.5px] font-medium text-emerald-300 hover:bg-emerald-500/30"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open Chat in WhatsApp
                </button>
              )}

              {provider === "github" && Boolean(evidence.issueUrl) && (
                <a
                  href={evidence.issueUrl as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-[10.5px] font-medium text-white hover:bg-white/20"
                >
                  <ExternalLink className="h-3 w-3" />
                  View Issue on GitHub
                </a>
              )}
            </div>
          </div>
        )}

        {/* Error banner if execution failed */}
        {status === "error" && errorMessage && (
          <div className="mt-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] text-rose-200">
            <span className="font-medium">Execution Error:</span> {errorMessage}
          </div>
        )}

        {/* Action Controls */}
        {status === "pending" && (
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-white/[0.06] pt-2.5">
            <button
              type="button"
              onClick={handleReject}
              className="rounded-lg border border-white/[0.1] bg-transparent px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApprove}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-500 active:scale-95"
            >
              <Send className="h-3.5 w-3.5" />
              Approve & Send Now
            </button>
          </div>
        )}

        {status === "executing" && (
          <div className="mt-3 flex items-center justify-center gap-2 border-t border-white/[0.06] pt-2.5 text-xs text-[#00D4FF]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Sending message via {provider}...</span>
          </div>
        )}
      </div>
    </div>
  );
}
