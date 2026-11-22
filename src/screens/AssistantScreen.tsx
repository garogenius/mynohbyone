import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  Folder,
  FolderPlus,
  History,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Mic,
  MicOff,
  Pencil,
  Pin,
  PinOff,
  Search,
  Send,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import { ConfirmationDialog } from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import {
  loadChatWorkspaceMeta,
  PROJECT_COLORS,
  saveChatWorkspaceMeta,
  type ChatProject,
  type ChatWorkspaceMeta,
} from "../lib/chatWorkspace";
import { RealtimeClient } from "../lib/realtime";
import {
  isSpeechRecognitionSupported,
  speakText,
  startLocalVoiceRecognition,
  stopSpeaking,
  type VoiceSessionHandle,
} from "../lib/voice";
import { useAppStore } from "../store/useAppStore";
import type { Conversation, Message } from "../types/api";

const STARTER_PROMPTS = [
  {
    title: "Draft a message",
    prompt: "Write a concise, professional LinkedIn update announcing Nohby ONE.",
  },
  {
    title: "Summarize & explain",
    prompt: "Explain how local-first AI agents protect user privacy in 4 bullet points.",
  },
  {
    title: "Plan my day",
    prompt: "Help me structure a focused 3-hour deep work session for software engineering.",
  },
  {
    title: "Ask in Hausa",
    prompt: "Sannu Nohby, ka bayyana min yadda zan yi amfani da kai wajen aiki na yau da kullum.",
  },
];

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "Just now";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AssistantScreen() {
  const {
    user,
    currentDeviceId,
    voiceSettings,
    loadVoiceSettings,
    showToast,
  } = useAppStore();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [wsConnected, setWsConnected] = useState(false);

  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);

  // Chat Workspace: Pinned chats, inline rename, and Projects
  const [workspaceMeta, setWorkspaceMeta] = useState<ChatWorkspaceMeta>(() =>
    loadChatWorkspaceMeta(user?.id)
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState<ChatProject["color"]>("cyan");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [assigningProjectConvId, setAssigningProjectConvId] = useState<string | null>(null);

  const updateWorkspaceMeta = useCallback(
    (updater: (prev: ChatWorkspaceMeta) => ChatWorkspaceMeta) => {
      setWorkspaceMeta((prev) => saveChatWorkspaceMeta(updater(prev), user?.id));
    },
    [user?.id]
  );

  // Voice capture
  const [voiceActive, setVoiceActive] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const voiceHandleRef = useRef<VoiceSessionHandle | null>(null);

  const realtimeRef = useRef<RealtimeClient | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  activeIdRef.current = activeId;

  useEffect(() => {
    if (!voiceSettings) {
      loadVoiceSettings();
    } else {
      setAutoSpeak(Boolean(voiceSettings.autoSpeakResponses));
    }
  }, [loadVoiceSettings, voiceSettings]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [composer]);

  const loadConversations = useCallback(async (selectFirstIfNone = true) => {
    try {
      const res = await apiClient.listConversations({ limit: 50 });
      setConversations(res.data.conversations);
      if (selectFirstIfNone && !activeIdRef.current && res.data.conversations.length > 0) {
        const first = res.data.conversations[0];
        setActiveId(first.id);
        setLoadingMessages(true);
        const detail = await apiClient.getConversation(first.id).catch(() => null);
        if (detail) {
          setMessages(detail.data.messages);
        }
        setLoadingMessages(false);
      }
    } catch {
      // ignore transient error
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadConversations(true);
  }, [loadConversations]);

  // Realtime WebSocket for live token streaming
  useEffect(() => {
    const client = new RealtimeClient({
      onStatusChange: (status) => setWsConnected(status === "connected"),
      onMessageDelta: (payload) => {
        if (payload.conversationId === activeIdRef.current && payload.delta) {
          setStreamingText((prev) => prev + payload.delta);
        }
      },
      onMessageCompleted: (payload) => {
        if (payload.conversationId === activeIdRef.current) {
          setStreamingText("");
        }
      },
    });
    realtimeRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      voiceHandleRef.current?.cancel();
      stopSpeaking();
    };
  }, []);

  const handleSelectConversation = async (id: string) => {
    setActiveId(id);
    setStreamingText("");
    setMobileHistoryOpen(false);
    setLoadingMessages(true);
    try {
      const detail = await apiClient.getConversation(id);
      setMessages(detail.data.messages);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to load conversation.");
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleNewChat = async () => {
    stopSpeaking();
    setSpeakingMessageId(null);
    setStreamingText("");
    setActiveId(null);
    setMessages([]);
    setMobileHistoryOpen(false);
    textareaRef.current?.focus();
  };

  const handleDeleteConversation = async (conv: Conversation) => {
    try {
      await apiClient.deleteConversation(conv.id);
      const remaining = conversations.filter((c) => c.id !== conv.id);
      setConversations(remaining);
      if (activeId === conv.id) {
        if (remaining.length > 0) {
          handleSelectConversation(remaining[0].id);
        } else {
          setActiveId(null);
          setMessages([]);
        }
      }
      showToast("info", "Chat deleted.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to delete chat.");
    } finally {
      setPendingDelete(null);
    }
  };

  const handleSend = useCallback(
    async (textOverride?: string, inputType: "text" | "voice" = "text") => {
      const content = (textOverride ?? composer).trim();
      if (!content || sending) return;

      setSending(true);
      setStreamingText("");
      if (!textOverride) setComposer("");

      // Optimistic user bubble
      const tempUserId = `temp-${Date.now()}`;
      const optimisticUser: Message = {
        id: tempUserId,
        conversationId: activeIdRef.current || "pending",
        userId: user?.id || "",
        role: "user",
        content,
        inputType,
        attachments: [],
        modelProvider: null,
        modelName: null,
        tokenUsage: {},
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUser]);

      try {
        let targetId = activeIdRef.current;
        if (!targetId) {
          const created = await apiClient.createConversation({
            title: content.slice(0, 52),
            mode: "assistant",
          });
          targetId = created.data.conversation.id;
          setActiveId(targetId);
          activeIdRef.current = targetId;
          setConversations((prev) => [created.data.conversation, ...prev]);
          if (selectedProjectId) {
            const newId = targetId;
            updateWorkspaceMeta((prev) => ({
              ...prev,
              chatProjectMap: { ...prev.chatProjectMap, [newId]: selectedProjectId },
            }));
          }
        }

        const res = await apiClient.sendMessage(targetId, {
          content,
          inputType,
          deviceId: currentDeviceId,
        });

        setStreamingText("");
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUserId),
          res.data.userMessage,
          res.data.assistantMessage,
        ]);

        // Refresh sidebar list order/title
        apiClient
          .listConversations({ limit: 50 })
          .then((listRes) => setConversations(listRes.data.conversations))
          .catch(() => null);

        if ((inputType === "voice" || autoSpeak) && res.data.assistantMessage.content) {
          const msgId = res.data.assistantMessage.id;
          speakText(res.data.assistantMessage.content.slice(0, 320), {
            language: voiceSettings?.inputLanguage || "en-US",
            voiceType: voiceSettings?.voiceType || "female",
            pitch: voiceSettings?.ttsPitch,
            rate: voiceSettings?.ttsRate ?? 1.0,
            onStart: () => setSpeakingMessageId(msgId),
            onEnd: () => setSpeakingMessageId(null),
          });
        }
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== tempUserId));
        showToast("error", err instanceof ApiError ? err.message : "Failed to send message.");
      } finally {
        setSending(false);
      }
    },
    [autoSpeak, composer, currentDeviceId, selectedProjectId, sending, showToast, updateWorkspaceMeta, voiceSettings]
  );

  const toggleVoiceMic = () => {
    if (voiceActive) {
      voiceHandleRef.current?.stop();
      voiceHandleRef.current = null;
      setVoiceActive(false);
      setInterimTranscript("");
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      showToast("info", "Browser voice recognition unavailable — type your message below.");
      return;
    }

    setVoiceActive(true);
    setInterimTranscript("");
    voiceHandleRef.current = startLocalVoiceRecognition({
      language: voiceSettings?.inputLanguage || "en-US",
      onInterim: (text) => setInterimTranscript(text),
      onFinal: (text) => {
        if (text.trim()) {
          setInterimTranscript("");
          voiceHandleRef.current?.stop();
          voiceHandleRef.current = null;
          setVoiceActive(false);
          handleSend(text.trim(), "voice");
        }
      },
      onError: (msg) => {
        showToast("error", `Voice error: ${msg}`);
        setVoiceActive(false);
      },
      onEnd: () => setVoiceActive(false),
    });
  };

  const handleStopAudio = () => {
    voiceHandleRef.current?.cancel();
    voiceHandleRef.current = null;
    stopSpeaking();
    setVoiceActive(false);
    setSpeakingMessageId(null);
    setInterimTranscript("");
  };

  const handleCopy = async (msg: Message) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId((cur) => (cur === msg.id ? null : cur)), 1800);
    } catch {
      showToast("error", "Unable to copy message.");
    }
  };

  const handleSpeakMessage = (msg: Message) => {
    if (speakingMessageId === msg.id) {
      stopSpeaking();
      setSpeakingMessageId(null);
      return;
    }
    speakText(msg.content, {
      language: voiceSettings?.inputLanguage || "en-US",
      voiceType: voiceSettings?.voiceType || "female",
      pitch: voiceSettings?.ttsPitch,
      rate: voiceSettings?.ttsRate ?? 1.0,
      onStart: () => setSpeakingMessageId(msg.id),
      onEnd: () => setSpeakingMessageId(null),
    });
  };

  // ---- Pin / Rename / Project Handlers ----
  const handleTogglePin = (convId: string) => {
    const alreadyPinned = workspaceMeta.pinnedIds.includes(convId);
    updateWorkspaceMeta((prev) => ({
      ...prev,
      pinnedIds: alreadyPinned
        ? prev.pinnedIds.filter((id) => id !== convId)
        : [convId, ...prev.pinnedIds],
    }));
    showToast("info", alreadyPinned ? "Chat unpinned." : "Chat pinned to top.");
  };

  const handleStartRename = (conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameDraft(conv.title);
    setAssigningProjectConvId(null);
  };

  const handleCommitRename = async (conv: Conversation) => {
    const nextTitle = renameDraft.trim();
    setRenamingId(null);
    if (!nextTitle || nextTitle === conv.title) return;

    // Optimistic update
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, title: nextTitle } : c))
    );
    try {
      const res = await apiClient.updateConversation(conv.id, { title: nextTitle });
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? res.data.conversation : c))
      );
      showToast("success", "Chat renamed.");
    } catch (err) {
      // Revert on failure
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, title: conv.title } : c))
      );
      showToast("error", err instanceof ApiError ? err.message : "Failed to rename chat.");
    }
  };

  const handleCreateProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    const project: ChatProject = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      color: newProjectColor,
      createdAt: new Date().toISOString(),
    };
    updateWorkspaceMeta((prev) => ({
      ...prev,
      projects: [project, ...prev.projects],
    }));
    setSelectedProjectId(project.id);
    setNewProjectName("");
    setCreatingProject(false);
    showToast("success", `Project "${project.name}" created.`);
  };

  const handleDeleteProject = (projectId: string) => {
    updateWorkspaceMeta((prev) => {
      const nextMap = { ...prev.chatProjectMap };
      Object.keys(nextMap).forEach((cid) => {
        if (nextMap[cid] === projectId) delete nextMap[cid];
      });
      return {
        ...prev,
        projects: prev.projects.filter((p) => p.id !== projectId),
        chatProjectMap: nextMap,
      };
    });
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
    }
    showToast("info", "Project removed.");
  };

  const handleAssignProject = (convId: string, projectId: string | null) => {
    updateWorkspaceMeta((prev) => {
      const nextMap = { ...prev.chatProjectMap };
      if (projectId) nextMap[convId] = projectId;
      else delete nextMap[convId];
      return { ...prev, chatProjectMap: nextMap };
    });
    setAssigningProjectConvId(null);
    const proj = projectId ? workspaceMeta.projects.find((p) => p.id === projectId) : null;
    showToast("info", proj ? `Moved to "${proj.name}".` : "Removed from project.");
  };

  const filteredConversations = conversations.filter((c) => {
    const matchesSearch = c.title.toLowerCase().includes(search.trim().toLowerCase());
    if (!matchesSearch) return false;
    if (selectedProjectId) {
      return workspaceMeta.chatProjectMap[c.id] === selectedProjectId;
    }
    return true;
  });

  const pinnedSet = new Set(workspaceMeta.pinnedIds);
  const pinnedConversations = filteredConversations.filter((c) => pinnedSet.has(c.id));
  const recentConversations = filteredConversations.filter((c) => !pinnedSet.has(c.id));

  const activeConversation = conversations.find((c) => c.id === activeId) || null;
  const activeProject = selectedProjectId
    ? workspaceMeta.projects.find((p) => p.id === selectedProjectId) || null
    : null;

  const renderConversationRow = (conv: Conversation) => {
    const isSelected = conv.id === activeId;
    const isPinned = pinnedSet.has(conv.id);
    const isRenaming = renamingId === conv.id;
    const assignedProjectId = workspaceMeta.chatProjectMap[conv.id];
    const assignedProject = assignedProjectId
      ? workspaceMeta.projects.find((p) => p.id === assignedProjectId)
      : null;
    const projectColorObj = assignedProject
      ? PROJECT_COLORS.find((pc) => pc.id === assignedProject.color) || PROJECT_COLORS[0]
      : null;

    return (
      <div key={conv.id} className="space-y-1">
        <div
          onClick={() => {
            if (!isRenaming) handleSelectConversation(conv.id);
          }}
          className={`group flex cursor-pointer items-center justify-between gap-1 rounded-lg border px-2 py-1.5 transition ${
            isSelected
              ? "border-[#00D4FF]/55 bg-[#00D4FF]/12 text-white"
              : "border-white/[0.06] bg-[#141B2D]/70 text-zinc-300 hover:border-[#00D4FF]/35 hover:text-white"
          }`}
        >
          <div className="min-w-0 flex-1">
            {isRenaming ? (
              <div
                className="flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCommitRename(conv);
                    } else if (e.key === "Escape") {
                      setRenamingId(null);
                    }
                  }}
                  autoFocus
                  className="studio-input h-6 w-full rounded px-1.5 text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => handleCommitRename(conv)}
                  className="rounded p-1 text-emerald-400 hover:bg-emerald-500/15"
                  title="Save name"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setRenamingId(null)}
                  className="rounded p-1 text-zinc-400 hover:bg-white/[0.08]"
                  title="Cancel"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <>
                <p
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    handleStartRename(conv);
                  }}
                  className={`flex items-center gap-1 truncate text-[11px] font-medium ${
                    isSelected ? "text-[#00D4FF]" : "text-white"
                  }`}
                >
                  {isPinned && <Pin className="h-2.5 w-2.5 shrink-0 text-[#00D4FF]" />}
                  <span className="truncate">{conv.title}</span>
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-zinc-400">
                  <span>{formatTimeAgo(conv.updatedAt || conv.createdAt)}</span>
                  {assignedProject && projectColorObj && !selectedProjectId && (
                    <span className="inline-flex max-w-[90px] items-center gap-1 truncate rounded-full border border-white/[0.1] px-1.5 py-0 text-[8.5px]">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${projectColorObj.dotClass}`} />
                      <span className="truncate">{assignedProject.name}</span>
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {!isRenaming && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-75 transition group-hover:opacity-100">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleTogglePin(conv.id);
                }}
                aria-label={isPinned ? "Unpin chat" : "Pin chat"}
                title={isPinned ? "Unpin chat" : "Pin to top"}
                className={`rounded p-1 transition ${
                  isPinned
                    ? "text-[#00D4FF] hover:bg-[#00D4FF]/15"
                    : "text-zinc-500 hover:bg-white/[0.08] hover:text-[#00D4FF]"
                }`}
              >
                {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartRename(conv);
                }}
                aria-label={`Rename ${conv.title}`}
                title="Rename chat"
                className="rounded p-1 text-zinc-500 transition hover:bg-white/[0.08] hover:text-white"
              >
                <Pencil className="h-3 w-3" />
              </button>
              {workspaceMeta.projects.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAssigningProjectConvId((cur) => (cur === conv.id ? null : conv.id));
                  }}
                  aria-label="Move to project"
                  title="Assign to project"
                  className={`rounded p-1 transition ${
                    assignedProject
                      ? "text-[#00D4FF] hover:bg-[#00D4FF]/15"
                      : "text-zinc-500 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  <Folder className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPendingDelete(conv);
                }}
                aria-label={`Delete ${conv.title}`}
                title="Delete chat"
                className="rounded p-1 text-zinc-500 transition hover:bg-rose-500/15 hover:text-rose-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Inline Project Assignment Picker */}
        {assigningProjectConvId === conv.id && (
          <div className="dropdown-surface flex flex-wrap items-center gap-1 rounded-lg p-1.5 text-[10px]">
            <button
              type="button"
              onClick={() => handleAssignProject(conv.id, null)}
              className={`rounded-md px-1.5 py-0.5 transition ${
                !assignedProjectId
                  ? "bg-[#00D4FF]/15 font-semibold text-[#00D4FF]"
                  : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              No Project
            </button>
            {workspaceMeta.projects.map((proj) => {
              const colorObj = PROJECT_COLORS.find((c) => c.id === proj.color) || PROJECT_COLORS[0];
              return (
                <button
                  key={proj.id}
                  type="button"
                  onClick={() => handleAssignProject(conv.id, proj.id)}
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition ${
                    assignedProjectId === proj.id
                      ? "bg-[#00D4FF]/15 font-semibold text-[#00D4FF]"
                      : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${colorObj.dotClass}`} />
                  <span className="max-w-[90px] truncate">{proj.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderHistoryRailContent = () => (
    <>
      {/* Chat Workspace History + Projects Card */}
      <div className="nohby-frame flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5 text-[#00D4FF]" />
            <h3 className="font-display text-[12px] font-semibold text-white">Chat History</h3>
          </div>
          <span className="rounded-full border border-white/[0.1] bg-[#161E30] px-1.5 py-0.5 text-[9px] font-medium text-zinc-400">
            {filteredConversations.length}
          </span>
        </div>

        <button
          type="button"
          onClick={handleNewChat}
          className="btn-ivory mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          {activeProject ? `New Chat in ${activeProject.name}` : "New Chat"}
        </button>

        {/* Compact Projects Section */}
        <div className="mt-2.5 border-b border-white/[0.07] pb-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Projects
            </span>
            <button
              type="button"
              onClick={() => setCreatingProject((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-[#00D4FF] transition hover:bg-[#00D4FF]/10"
            >
              <FolderPlus className="h-3 w-3" />
              New
            </button>
          </div>

          {creatingProject && (
            <div className="mt-1.5 space-y-1.5 rounded-lg border border-[#00D4FF]/35 bg-[#141B2D]/70 p-2">
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateProject();
                  } else if (e.key === "Escape") {
                    setCreatingProject(false);
                  }
                }}
                placeholder="Project name..."
                autoFocus
                className="studio-input h-7 w-full rounded-md px-2 text-[11px]"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNewProjectColor(c.id)}
                      title={c.label}
                      className={`h-4 w-4 rounded-full transition ${c.dotClass} ${
                        newProjectColor === c.id ? "scale-110 ring-2 ring-white/80" : "opacity-60 hover:opacity-100"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCreatingProject(false)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateProject}
                    disabled={!newProjectName.trim()}
                    className="btn-ivory rounded px-2 py-0.5 text-[10px]"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Project Filter Pills */}
          <div className="mt-1.5 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setSelectedProjectId(null)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                selectedProjectId === null
                  ? "bg-[#00D4FF]/15 text-[#00D4FF] border border-[#00D4FF]/45"
                  : "border border-white/[0.08] bg-[#141B2D]/70 text-zinc-400 hover:text-white"
              }`}
            >
              All ({conversations.length})
            </button>

            {workspaceMeta.projects.map((proj) => {
              const colorObj = PROJECT_COLORS.find((c) => c.id === proj.color) || PROJECT_COLORS[0];
              const count = conversations.filter(
                (c) => workspaceMeta.chatProjectMap[c.id] === proj.id
              ).length;
              const isSelected = selectedProjectId === proj.id;
              return (
                <div
                  key={proj.id}
                  className={`group inline-flex items-center gap-1 rounded-full border pl-2 pr-1 py-0.5 text-[10px] font-medium transition ${
                    isSelected
                      ? "border-[#00D4FF]/50 bg-[#00D4FF]/15 text-[#00D4FF]"
                      : "border-white/[0.08] bg-[#141B2D]/70 text-zinc-300 hover:border-[#00D4FF]/35"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedProjectId(isSelected ? null : proj.id)}
                    className="inline-flex items-center gap-1"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${colorObj.dotClass}`} />
                    <span className="max-w-[92px] truncate">{proj.name}</span>
                    <span className="text-[9px] opacity-70">({count})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(proj.id)}
                    title={`Delete project ${proj.name}`}
                    className="rounded-full p-0.5 text-zinc-500 opacity-60 hover:text-rose-400 hover:opacity-100"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Compact Search */}
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workspace chats..."
            className="studio-input h-7 w-full rounded-lg pl-7 pr-2.5 text-[11px]"
          />
        </div>

        {/* Thread List (Pinned + Recent) */}
        <div className="mt-2 flex-1 space-y-2 overflow-y-auto pr-0.5">
          {loadingList ? (
            <div className="flex items-center justify-center py-8 text-[11px] text-zinc-400">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin text-[#00D4FF]" />
              Loading chats...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/[0.1] px-2.5 py-5 text-center text-[10px] text-zinc-400">
              {search
                ? "No matching chats"
                : activeProject
                  ? `No chats in "${activeProject.name}" yet`
                  : "No chat history yet — start a conversation"}
            </div>
          ) : (
            <>
              {pinnedConversations.length > 0 && (
                <div className="space-y-1">
                  <p className="flex items-center gap-1 px-1 text-[9px] font-semibold uppercase tracking-wider text-[#00D4FF]">
                    <Pin className="h-2.5 w-2.5" />
                    Pinned
                  </p>
                  {pinnedConversations.map(renderConversationRow)}
                </div>
              )}

              {recentConversations.length > 0 && (
                <div className="space-y-1">
                  {pinnedConversations.length > 0 && (
                    <p className="px-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-400">
                      Recent
                    </p>
                  )}
                  {recentConversations.map(renderConversationRow)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Compact Workspace Status Card (Matches Active Session right rail balance) */}
      <div className="nohby-frame p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[11px] font-semibold text-white">Chat Workspace</h3>
          <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {wsConnected ? "Live" : "Ready"}
          </span>
        </div>

        <div className="mt-2 space-y-1.5 text-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Engine:</span>
            <span className="font-medium text-white">NohbyAI Core</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Auto-Speak:</span>
            <button
              type="button"
              onClick={() => setAutoSpeak((v) => !v)}
              className={`rounded-full px-2 py-0.5 text-[9px] font-semibold transition ${
                autoSpeak
                  ? "bg-[#00D4FF]/20 text-[#00D4FF]"
                  : "border border-white/[0.12] bg-[#161E30] text-zinc-400 hover:text-white"
              }`}
            >
              {autoSpeak ? "On" : "Off"}
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="grid w-full gap-3 lg:h-[calc(100vh-5.25rem)] lg:grid-cols-[minmax(0,1fr)_250px] xl:grid-cols-[minmax(0,1fr)_265px] lg:overflow-hidden">
      {/* ============================================================
          LEFT / CENTER: CHATGPT-STYLE CHAT ROOM STAGE
          ============================================================ */}
      <section className="nohby-stage flex min-h-[calc(100vh-8.5rem)] flex-col overflow-hidden lg:h-full lg:min-h-0">
        {/* Stage Header */}
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#00D4FF]/40 bg-[#101A2E]">
              <img src="/icon-white.png" alt="" className="h-3.5 w-3.5 object-contain" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display truncate text-sm font-semibold text-white">
                  {activeConversation ? activeConversation.title : "NohbyAI Chat Room"}
                </h2>
                {activeProject && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#00D4FF]/35 bg-[#00D4FF]/10 px-2 py-0.5 text-[10px] font-medium text-[#00D4FF]">
                    <Folder className="h-2.5 w-2.5" />
                    {activeProject.name}
                  </span>
                )}
                {voiceActive && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-2 py-0.5 text-[10px] font-medium text-[#00D4FF]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00D4FF]" />
                    Listening
                  </span>
                )}
                {speakingMessageId && !voiceActive && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
                    Speaking
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={handleNewChat}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.1] bg-[#141B2D]/80 px-2.5 text-[11px] font-medium text-zinc-200 transition hover:border-[#00D4FF]/50 hover:text-white"
            >
              <MessageSquarePlus className="h-3.5 w-3.5 text-[#00D4FF]" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileHistoryOpen(true)}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.1] bg-[#141B2D]/80 px-2.5 text-[11px] font-medium text-zinc-200 transition hover:border-[#00D4FF]/50 lg:hidden"
            >
              <History className="h-3.5 w-3.5 text-[#00D4FF]" />
              History
            </button>
          </div>
        </div>

        {/* Scrollable ChatGPT-Style Thread */}
        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
          {loadingMessages ? (
            <div className="flex h-full items-center justify-center text-xs text-zinc-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-[#00D4FF]" />
              Loading conversation...
            </div>
          ) : messages.length === 0 && !streamingText ? (
            <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#00D4FF]/35 bg-[#101A2E] shadow-[0_0_24px_rgba(0,212,255,0.22)]">
                <Sparkles className="h-5 w-5 text-[#00D4FF]" />
              </div>
              <h3 className="font-display mt-3.5 text-lg font-semibold text-white">
                How can NohbyAI help you, {user?.profile?.displayName || user?.name?.split(" ")[0] || "there"}?
              </h3>
              <p className="mt-1 max-w-md text-xs text-zinc-400">
                Ask anything, brainstorm, write code, or speak directly using voice mode. Your workspace history stays saved on the right.
              </p>

              <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
                {STARTER_PROMPTS.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => handleSend(item.prompt, "text")}
                    className="group rounded-xl border border-white/[0.08] bg-[#141B2D]/75 p-3 text-left transition hover:border-[#00D4FF]/50 hover:bg-[#172038]"
                  >
                    <p className="text-[11px] font-semibold text-white group-hover:text-[#00D4FF]">
                      {item.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-400">
                      {item.prompt}
                    </p>
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
                    <div className="mb-1 flex items-center gap-1.5">
                      {!isUser && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00D4FF]/35 bg-[#101A2E] px-2 py-0.5 text-[10px] font-medium text-zinc-200">
                          NohbyAI
                          <img src="/icon-white.png" alt="" className="h-3 w-3 rounded-full object-contain" />
                        </span>
                      )}
                      {isUser && (
                        <span className="rounded-full border border-white/[0.12] bg-[#161E30] px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                          You
                        </span>
                      )}
                      <span className="text-[9px] text-zinc-500">{formatTime(msg.createdAt)}</span>
                    </div>

                    <div
                      className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap sm:max-w-[82%] ${
                        isUser
                          ? "rounded-tr-sm border border-white/[0.1] bg-[#151B2B]/90 text-zinc-100"
                          : "nohby-bubble-ai rounded-tl-sm text-zinc-100"
                      }`}
                    >
                      {msg.content}
                    </div>

                    {!isUser && (
                      <div className="mt-1 flex items-center gap-1 pl-1">
                        <button
                          type="button"
                          onClick={() => handleCopy(msg)}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                          title="Copy response"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-400" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              Copy
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSpeakMessage(msg)}
                          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                          title={speakingMessageId === msg.id ? "Stop speaking" : "Read aloud"}
                        >
                          {speakingMessageId === msg.id ? (
                            <>
                              <VolumeX className="h-3 w-3 text-rose-400" />
                              Stop
                            </>
                          ) : (
                            <>
                              <Volume2 className="h-3 w-3" />
                              Speak
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Live Streaming or Thinking Bubble */}
              {(sending || streamingText) && (
                <div className="flex flex-col items-start">
                  <span className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-[#00D4FF]/35 bg-[#101A2E] px-2 py-0.5 text-[10px] font-medium text-zinc-200">
                    NohbyAI
                    <img src="/icon-white.png" alt="" className="h-3 w-3 rounded-full object-contain" />
                  </span>
                  <div className="nohby-bubble-ai max-w-[85%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap text-zinc-100">
                    {streamingText ? (
                      <>
                        {streamingText}
                        <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse bg-[#00D4FF] align-middle" />
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-xs text-[#00D4FF]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        NohbyAI is thinking...
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ChatGPT-Style Bottom Prompt Composer */}
        <div className="border-t border-white/[0.07] px-3 py-2.5 sm:px-5">
          {interimTranscript && (
            <div className="mx-auto mb-1.5 flex max-w-3xl items-center gap-2 rounded-lg border border-[#00D4FF]/30 bg-[#00D4FF]/10 px-3 py-1 text-[11px] text-[#00D4FF]">
              <Mic className="h-3 w-3 animate-pulse" />
              <span className="truncate italic">{interimTranscript}</span>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-white/[0.12] bg-[#101624] p-1.5 pl-3.5 transition focus-within:border-[#00D4FF]/55"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message NohbyAI..."
              className="max-h-36 flex-1 resize-none bg-transparent py-1.5 text-[13px] text-white placeholder-zinc-500 focus:outline-none"
            />

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={toggleVoiceMic}
                title={voiceActive ? "Stop voice input" : "Voice input"}
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                  voiceActive
                    ? "bg-[#00D4FF] text-[#08142E] shadow-[0_0_12px_rgba(0,212,255,0.5)]"
                    : "border border-white/[0.1] bg-[#161E30] text-zinc-300 hover:border-[#00D4FF]/50 hover:text-white"
                }`}
              >
                {voiceActive ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>

              {(voiceActive || speakingMessageId) && (
                <button
                  type="button"
                  onClick={handleStopAudio}
                  title="Stop audio"
                  className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400 transition hover:bg-rose-500/30"
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
              )}

              <button
                type="submit"
                disabled={sending || !composer.trim()}
                title="Send message"
                className="btn-ivory flex h-8 items-center justify-center gap-1 rounded-xl px-3 text-xs font-semibold disabled:opacity-45"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
          </form>

          <p className="mt-1.5 text-center text-[10px] text-zinc-500">
            <MessageSquare className="mr-1 inline h-2.5 w-2.5 text-[#00D4FF]" />
            NohbyAI Chat Room · Enter to send, Shift+Enter for new line
          </p>
        </div>
      </section>

      {/* ============================================================
          RIGHT COLUMN: SMALL-MEDIUM CHAT HISTORY WORKSPACE (250px-265px)
          Matches Active Session's right rail size & aesthetic exactly
          ============================================================ */}
      <aside className="hidden flex-col gap-2.5 lg:flex lg:h-full lg:overflow-hidden">
        {renderHistoryRailContent()}
      </aside>

      {/* Mobile / Tablet Slide-Over History Drawer */}
      <AnimatePresence>
        {mobileHistoryOpen && (
          <div className="fixed inset-0 z-50 flex justify-end lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileHistoryOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: 280 }}
              animate={{ x: 0 }}
              exit={{ x: 280 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 flex h-full w-72 flex-col gap-2.5 bg-[#0B101B] p-3 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-semibold text-white">Workspace History</span>
                <button
                  type="button"
                  onClick={() => setMobileHistoryOpen(false)}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {renderHistoryRailContent()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Chat Confirmation */}
      <ConfirmationDialog
        open={Boolean(pendingDelete)}
        title="Delete Chat Thread"
        description={`Permanently delete "${pendingDelete?.title || "this chat"}" and its messages?`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pendingDelete) handleDeleteConversation(pendingDelete);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
