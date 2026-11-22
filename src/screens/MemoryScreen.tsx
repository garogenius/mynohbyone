import { useCallback, useEffect, useState } from "react";
import {
  Brain,
  Check,
  Download,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import { EmptyState, LoadingState } from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { MemoryItem } from "../types/api";

const CATEGORIES = ["all", "project", "preference", "fact", "contact", "workflow"] as const;
type MemoryCategory = "project" | "preference" | "fact" | "contact" | "workflow";

export function MemoryScreen() {
  const { user, showToast } = useAppStore();

  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Composer state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<MemoryCategory>("project");
  const [tagsInput, setTagsInput] = useState("");

  // Inline Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState<MemoryCategory>("project");
  const [editTags, setEditTags] = useState("");
  const [updating, setUpdating] = useState(false);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.listMemories(
        categoryFilter === "all" ? undefined : categoryFilter
      );
      setMemories(res.data.memories);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to load memory.");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, showToast]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await apiClient.createMemory({
        category,
        title: title.trim(),
        content: content.trim(),
        tags,
      });
      setTitle("");
      setContent("");
      setTagsInput("");
      showToast(
        "success",
        "Saved to Personal Memory — active across Assistant, Chat Room & Stealth Interview answers."
      );
      await loadMemories();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to save memory.");
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (item: MemoryItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditContent(item.content);
    setEditCategory((item.category as MemoryCategory) || "project");
    setEditTags(item.tags.join(", "));
  };

  const handleSaveEdit = async (memoryId: string) => {
    if (!editTitle.trim() || !editContent.trim() || updating) return;
    setUpdating(true);
    try {
      const tags = editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await apiClient.updateMemory(memoryId, {
        category: editCategory,
        title: editTitle.trim(),
        content: editContent.trim(),
        tags,
      });
      setMemories((prev) => prev.map((m) => (m.id === memoryId ? res.data.memory : m)));
      setEditingId(null);
      showToast("success", "Memory updated.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to update memory.");
    } finally {
      setUpdating(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      await loadMemories();
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.searchMemories(q);
      setMemories(res.data.results);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      showToast("info", "Memory deleted.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Delete failed.");
    }
  };

  const handleExportMemories = () => {
    if (memories.length === 0) {
      showToast("info", "No memories to export yet.");
      return;
    }
    const lines = [
      `NOHBY ONE WORKSPACE MEMORY EXPORT (${user?.name || "User"})`,
      `Exported: ${new Date().toISOString()}`,
      "",
      ...memories.flatMap((m, i) => [
        `${i + 1}. [${m.category.toUpperCase()}] ${m.title}`,
        `   ${m.content}`,
        ...(m.tags.length > 0 ? [`   Tags: ${m.tags.join(", ")}`] : []),
        "",
      ]),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Nohby-ONE-Workspace-Memory.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    showToast("success", "Workspace memory exported.");
  };

  return (
    <div className="w-full space-y-4">
      {/* Add Memory Form */}
      <form onSubmit={handleSave} className="nohby-frame space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-[#00D4FF]" />
            <div>
              <h2 className="font-display text-sm font-semibold text-white">
                Save Personal Memory, Skills &amp; Interview Experience
              </h2>
              <p className="text-[11px] text-zinc-400">
                Everything saved here powers NohbyAI&apos;s personalized first-person answers during live meetings &amp; interviews.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setCategory("fact");
                setTitle("Core Skills & Engineering Experience");
                setTagsInput("skills, interview, architecture, resume");
                setContent(
                  `Full-stack and AI systems engineer specializing in FastAPI, PostgreSQL, React, TypeScript, Tauri desktop apps, and real-time voice/agent systems.`
                );
              }}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#00D4FF]/35 bg-[#00D4FF]/10 px-2.5 text-[10px] font-medium text-[#00D4FF] hover:bg-[#00D4FF]/20"
            >
              <Sparkles className="h-3 w-3" />
              Prefill Interview Skills Template
            </button>
            <button
              type="button"
              onClick={handleExportMemories}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.1] bg-[#141B2D] px-2.5 text-[10px] font-medium text-zinc-300 hover:text-white"
            >
              <Download className="h-3 w-3 text-[#00D4FF]" />
              Export Memory (.md)
            </button>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-12">
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. 'Core Skills & Projects' or 'Preferred Meeting Hours')"
            className="studio-input h-9 rounded-lg px-3 text-xs sm:col-span-5"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MemoryCategory)}
            className="studio-input h-9 rounded-lg px-3 text-xs sm:col-span-3"
          >
            <option value="project">Project</option>
            <option value="preference">Preference</option>
            <option value="fact">Fact / Skill</option>
            <option value="contact">Contact</option>
            <option value="workflow">Workflow</option>
          </select>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="Tags (comma separated)"
            className="studio-input h-9 rounded-lg px-3 text-xs sm:col-span-4"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            required
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Details, skills, or project accomplishments Nohby ONE should remember across sessions..."
            className="studio-input h-9 flex-1 rounded-lg px-3 text-xs"
          />
          <button
            type="submit"
            disabled={saving || !title.trim() || !content.trim()}
            className="btn-ivory inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 text-xs"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Save Memory
          </button>
        </div>
      </form>

      {/* Search & Category Filter */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
                categoryFilter === cat
                  ? "nohby-nav-active text-white"
                  : "border-white/[0.08] bg-[#101624] text-zinc-400 hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memory..."
              className="studio-input h-8 w-48 rounded-lg pl-8 pr-2.5 text-xs"
            />
          </div>
          <button
            type="submit"
            className="h-8 rounded-lg border border-white/[0.1] bg-[#101624] px-3 text-xs text-zinc-300 hover:border-[#00D4FF]/40"
          >
            Find
          </button>
        </form>
      </div>

      {loading && memories.length === 0 ? (
        <LoadingState message="Loading personal memory..." />
      ) : memories.length === 0 ? (
        <EmptyState
          title="No memories stored yet"
          description="Save projects, skills, preferences, contacts, or key workflows above so Nohby ONE personalises every session and interview answer."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {memories.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <div key={item.id} className="nohby-frame flex flex-col justify-between p-4">
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                        className="studio-input h-7 rounded-lg px-2 text-[11px]"
                      >
                        <option value="project">Project</option>
                        <option value="preference">Preference</option>
                        <option value="fact">Fact / Skill</option>
                        <option value="contact">Contact</option>
                        <option value="workflow">Workflow</option>
                      </select>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={updating}
                          onClick={() => handleSaveEdit(item.id)}
                          className="rounded p-1 text-emerald-400 hover:bg-emerald-500/15"
                          title="Save changes"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded p-1 text-zinc-400 hover:bg-white/[0.08]"
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="studio-input h-8 w-full rounded-lg px-2.5 text-xs font-semibold"
                    />
                    <textarea
                      rows={3}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="studio-input w-full rounded-lg p-2.5 text-xs"
                    />
                    <input
                      type="text"
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="Tags (comma separated)"
                      className="studio-input h-7 w-full rounded-lg px-2.5 text-[11px]"
                    />
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-full bg-[#00D4FF]/15 px-2 py-0.5 font-mono text-[10px] uppercase text-[#00D4FF]">
                        {item.category}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          className="rounded p-1 text-zinc-400 hover:bg-white/[0.08] hover:text-[#00D4FF]"
                          title="Edit memory"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="rounded p-1 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400"
                          title="Delete memory"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold text-white">{item.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-400">{item.content}</p>
                  </div>
                )}

                {!isEditing && item.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1 border-t border-white/[0.06] pt-2.5">
                    {item.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-[#161E30] px-2 py-0.5 text-[10px] text-zinc-300"
                      >
                        <Tag className="h-2.5 w-2.5 text-[#00D4FF]" />
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
