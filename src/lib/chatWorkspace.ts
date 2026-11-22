export interface ChatProject {
  id: string;
  name: string;
  color: "cyan" | "violet" | "emerald" | "amber" | "rose";
  createdAt: string;
}

export interface ChatWorkspaceMeta {
  pinnedIds: string[];
  projects: ChatProject[];
  chatProjectMap: Record<string, string>; // conversationId -> projectId
}

const DEFAULT_META: ChatWorkspaceMeta = {
  pinnedIds: [],
  projects: [],
  chatProjectMap: {},
};

function storageKey(userId?: string | null): string {
  return `nohbyone.chatWorkspace.${userId || "default"}`;
}

export function loadChatWorkspaceMeta(userId?: string | null): ChatWorkspaceMeta {
  if (typeof window === "undefined") return { ...DEFAULT_META };
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return { ...DEFAULT_META };
    const parsed = JSON.parse(raw) as Partial<ChatWorkspaceMeta>;
    return {
      pinnedIds: Array.isArray(parsed.pinnedIds) ? parsed.pinnedIds : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      chatProjectMap:
        parsed.chatProjectMap && typeof parsed.chatProjectMap === "object"
          ? parsed.chatProjectMap
          : {},
    };
  } catch {
    return { ...DEFAULT_META };
  }
}

export function saveChatWorkspaceMeta(
  meta: ChatWorkspaceMeta,
  userId?: string | null
): ChatWorkspaceMeta {
  if (typeof window !== "undefined") {
    localStorage.setItem(storageKey(userId), JSON.stringify(meta));
    window.dispatchEvent(new CustomEvent("nohby-chat-workspace-change", { detail: meta }));
  }
  return meta;
}

export const PROJECT_COLORS: {
  id: ChatProject["color"];
  label: string;
  dotClass: string;
  badgeClass: string;
}[] = [
  {
    id: "cyan",
    label: "Cyan",
    dotClass: "bg-[#00D4FF]",
    badgeClass: "border-[#00D4FF]/35 bg-[#00D4FF]/10 text-[#00D4FF]",
  },
  {
    id: "violet",
    label: "Violet",
    dotClass: "bg-violet-400",
    badgeClass: "border-violet-400/35 bg-violet-500/10 text-violet-400",
  },
  {
    id: "emerald",
    label: "Emerald",
    dotClass: "bg-emerald-400",
    badgeClass: "border-emerald-400/35 bg-emerald-500/10 text-emerald-400",
  },
  {
    id: "amber",
    label: "Amber",
    dotClass: "bg-amber-400",
    badgeClass: "border-amber-400/35 bg-amber-500/10 text-amber-400",
  },
  {
    id: "rose",
    label: "Rose",
    dotClass: "bg-rose-400",
    badgeClass: "border-rose-400/35 bg-rose-500/10 text-rose-400",
  },
];
