import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  Copy,
  History,
  Loader2,
  MessageSquarePlus,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

import { ConfirmationDialog, LoadingState } from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import { RealtimeClient } from "../lib/realtime";
import { useAppStore } from "../store/useAppStore";
import type { Conversation, InterpretationResult, Message } from "../types/api";

const STARTER_PROMPTS = [
  "Open Chrome and search for the best cloud hosting providers",
  "Prepare a LinkedIn announcement for Nohby ONE",
  "Find available time on my calendar for a team sync tomorrow",
  "Summarise the key security principles of local-first execution",
];

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function AssistantScreen() {
  const { currentDeviceId, showToast } = useAppStore();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [latestInterpretation, setLatestInterpretation] = useState<InterpretationResult | null>(null);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const realtimeRef = useRef<RealtimeClient | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  activeIdRef.current = activeId;

  const loadConversations = useCallback(async (query?: string) => {
    try {
      const res = await apiClient.listConversations({ limit: 50, search: query || undefined });
      setConversations(res.data.conversations);
      if (!activeIdRef.current && res.data.conversations.length > 0) {
        setActiveId(res.data.conversations[0].id);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to load conversations.";
      showToast("error", msg);
    } finally {
      setLoadingList(false);
    }
  }, [showToast]);

  const loadConversationMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    setLatestInterpretation(null);
    setStreamingText("");
    try {
      const res = await apiClient.getConversation(conversationId);
      setMessages(res.data.messages);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to load messages.";
      showToast("error", msg);
    } finally {
      setLoadingMessages(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (activeId) {
      loadConversationMessages(activeId);
    } else {
      setMessages([]);
    }
  }, [activeId, loadConversationMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  // Connect authenticated realtime WebSocket
  useEffect(() => {
    const client = new RealtimeClient({
      onStatusChange: (status) => setWsStatus(status),
      onMessageDelta: ({ conversationId, delta }) => {
        if (conversationId === activeIdRef.current) {
          setStreamingText((prev) => prev + delta);
        }
      },
      onMessageCompleted: ({ conversationId, conversationTitle, message, interpretation }) => {
        if (conversationId === activeIdRef.current) {
          setStreamingText("");
          setSending(false);
          setMessages((prev) => {
            if (prev.some((m) => m.id === message.id)) return prev;
            return [...prev, message];
          });
          if (interpretation) {
            setLatestInterpretation(interpretation);
          }
        }
        if (conversationTitle) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId ? { ...c, title: conversationTitle } : c
            )
          );
        }
      },
      onError: ({ message }) => {
        setSending(false);
        setStreamingText("");
        showToast("error", message);
      },
    });

    realtimeRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      realtimeRef.current = null;
    };
  }, [showToast]);

  const handleCreateConversation = async () => {
    try {
      const res = await apiClient.createConversation({ mode: "general" });
      const created = res.data.conversation;
      setConversations((prev) => [created, ...prev]);
      setActiveId(created.id);
      setMessages([]);
      setLatestInterpretation(null);
      setMobileHistoryOpen(false);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Unable to create conversation.");
    }
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? composer).trim();
    if (!text || sending) return;

    setSending(true);
    setComposer("");
    setStreamingText("");
    setLatestInterpretation(null);

    let targetId = activeId;
    try {
      if (!targetId) {
        const createdRes = await apiClient.createConversation({ mode: "general" });
        const created = createdRes.data.conversation;
        targetId = created.id;
        activeIdRef.current = created.id;
        setActiveId(created.id);
        setConversations((prev) => [created, ...prev]);
      }

      const optimisticUserMsg: Message = {
        id: `temp-${Date.now()}`,
        conversationId: targetId,
        userId: "",
        role: "user",
        content: text,
        inputType: "text",
        attachments: [],
        modelProvider: null,
        modelName: null,
        tokenUsage: {},
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUserMsg]);

      // Prefer WebSocket streaming when connected; gracefully fall back to REST
      if (realtimeRef.current?.isConnected()) {
        const sent = realtimeRef.current.sendConversationMessage(targetId, text, "text");
        if (sent) return;
      }

      const res = await apiClient.sendMessage(targetId, {
        content: text,
        inputType: "text",
        deviceId: currentDeviceId,
      });

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUserMsg.id),
        res.data.userMessage,
        res.data.assistantMessage,
      ]);
      setLatestInterpretation(res.data.interpretation);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetId ? { ...c, title: res.data.conversationTitle } : c
        )
      );
      setSending(false);
    } catch (err) {
      setSending(false);
      setStreamingText("");
      showToast("error", err instanceof ApiError ? err.message : "Failed to send message.");
    }
  };

  const handleDeleteConversation = async () => {
    if (!pendingDelete) return;
    const toDelete = pendingDelete;
    try {
      await apiClient.deleteConversation(toDelete.id);
      const remaining = conversations.filter((c) => c.id !== toDelete.id);
      setConversations(remaining);
      if (activeId === toDelete.id) {
        setActiveId(remaining[0]?.id || null);
      }
      showToast("info", "Conversation deleted.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Delete failed.");
    } finally {
      setPendingDelete(null);
    }
  };

  const handleCopy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard unavailable
    }
  };

  const filteredConversations = search.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(search.trim().toLowerCase())
      )
    : conversations;

  const conversationListPanel = (
    <div className="flex h-full flex-col border-r border-white/[0.08] bg-[#0D0F13]">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] p-3">
        <button
          type="button"
          onClick={handleCreateConversation}
          className="flex min-h-[38px] flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          New Chat
        </button>
        {mobileHistoryOpen && (
          <button
            type="button"
            onClick={() => setMobileHistoryOpen(false)}
            className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.06] hover:text-white md:hidden"
            aria-label="Close conversation list"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full rounded-lg border border-white/[0.08] bg-[#111318] py-1.5 pr-3 pl-8 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {loadingList ? (
          <div className="py-8 text-center text-xs text-zinc-500">Loading history...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-zinc-500">
            No conversations yet.
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = conv.id === activeId;
            return (
              <div
                key={conv.id}
                className={`group flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition ${
                  isSelected
                    ? "bg-white/[0.08] text-white"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(conv.id);
                    setMobileHistoryOpen(false);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-xs font-medium">{conv.title}</p>
                  {conv.lastMessagePreview && (
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                      {conv.lastMessagePreview}
                    </p>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(conv)}
                  aria-label="Delete conversation"
                  className="shrink-0 rounded p-1 text-zinc-500 opacity-0 transition hover:bg-rose-500/15 hover:text-rose-400 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="relative flex h-[calc(100vh-8.5rem)] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111318] md:h-[calc(100vh-6.5rem)]">
      {/* Desktop & Tablet conversation sidebar */}
      <div className="hidden w-68 shrink-0 md:block">{conversationListPanel}</div>

      {/* Mobile slide-over conversation drawer */}
      <AnimatePresence>
        {mobileHistoryOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileHistoryOpen(false)}
              className="fixed inset-0 bg-black/65"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 h-full w-72"
            >
              {conversationListPanel}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Main conversation workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Workspace header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileHistoryOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-[#171A21] text-zinc-300 md:hidden"
              aria-label="Open conversations"
            >
              <History className="h-4 w-4" />
            </button>
            <h2 className="truncate text-sm font-semibold text-white">
              {conversations.find((c) => c.id === activeId)?.title || "Assistant"}
            </h2>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium ${
                wsStatus === "connected"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                  : "border-white/[0.08] bg-white/[0.03] text-zinc-400"
              }`}
            >
              {wsStatus === "connected" ? (
                <Wifi className="h-3 w-3" />
              ) : (
                <WifiOff className="h-3 w-3" />
              )}
              <span>{wsStatus === "connected" ? "Realtime Stream" : "REST Mode"}</span>
            </span>
          </div>
        </div>

        {/* Messages stream */}
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {loadingMessages ? (
            <LoadingState message="Loading conversation..." />
          ) : messages.length === 0 && !streamingText ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
              <h3 className="text-base font-semibold text-white">
                How can Nohby ONE help today?
              </h3>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-zinc-400">
                Ask a question, draft content, or propose a local workflow. Sensitive operations
                always show an execution plan before anything runs.
              </p>

              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => handleSend(prompt)}
                    className="rounded-xl border border-white/[0.08] bg-[#171A21] p-3.5 text-left text-xs leading-relaxed text-zinc-300 transition hover:border-indigo-500/40 hover:text-white"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[82%] ${
                        isUser
                          ? "bg-indigo-600 text-white"
                          : "border border-white/[0.08] bg-[#171A21] text-zinc-200"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    <div className="mt-1 flex items-center gap-2 px-1 text-[11px] text-zinc-500">
                      <span>{isUser ? "You" : msg.modelName || "Nohby ONE"}</span>
                      <span>·</span>
                      <span>{formatTime(msg.createdAt)}</span>
                      {!isUser && (
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="ml-1 inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-300"
                        >
                          {copiedId === msg.id ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {streamingText && (
                <div className="flex flex-col items-start">
                  <div className="max-w-[90%] rounded-2xl border border-indigo-500/30 bg-[#171A21] px-4 py-3 text-sm leading-relaxed text-zinc-200 sm:max-w-[82%]">
                    <p className="whitespace-pre-wrap">
                      {streamingText}
                      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-400 align-middle" />
                    </p>
                  </div>
                </div>
              )}

              {latestInterpretation?.requiresExecution &&
                latestInterpretation.proposedPlan.length > 0 && (
                  <div className="rounded-xl border border-white/[0.1] bg-[#0D0F13] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-white">
                        <ShieldAlert className="h-4 w-4 text-indigo-400" />
                        <span>Proposed Execution Plan (Not Yet Executed)</span>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${
                          latestInterpretation.riskLevel === "high"
                            ? "bg-rose-500/15 text-rose-300"
                            : latestInterpretation.riskLevel === "medium"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-emerald-500/15 text-emerald-300"
                        }`}
                      >
                        {latestInterpretation.riskLevel} risk
                      </span>
                    </div>

                    <ol className="mt-3 space-y-2">
                      {latestInterpretation.proposedPlan.map((step) => (
                        <li
                          key={step.step}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-[#111318] px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-zinc-500">{step.step}.</span>
                            <code className="text-indigo-300">{step.tool}</code>
                            <span className="text-zinc-300">{step.description}</span>
                          </div>
                          {step.requiresApproval && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                              <AlertCircle className="h-3 w-3" />
                              Approval Required
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-white/[0.08] bg-[#0D0F13] p-3 sm:p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="mx-auto flex max-w-3xl items-end gap-2"
          >
            <textarea
              rows={1}
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask Nohby ONE or describe a task..."
              className="max-h-36 min-h-[42px] flex-1 resize-none rounded-xl border border-white/[0.1] bg-[#111318] px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={sending || !composer.trim()}
              aria-label="Send message"
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:opacity-40"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </form>
        </div>
      </div>

      <ConfirmationDialog
        open={pendingDelete !== null}
        title="Delete conversation?"
        description={
          pendingDelete
            ? `Permanently delete "${pendingDelete.title}" and all of its messages?`
            : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteConversation}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
