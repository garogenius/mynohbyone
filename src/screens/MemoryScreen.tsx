import { useCallback, useEffect, useState } from "react";
import { Brain, Loader2, Plus, Search, Tag, Trash2 } from "lucide-react";

import { EmptyState, LoadingState } from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { MemoryItem } from "../types/api";

const CATEGORIES = ["all", "project", "preference", "fact", "contact", "workflow"] as const;

export function MemoryScreen() {
  const { showToast } = useAppStore();

  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Composer state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<"project" | "preference" | "fact" | "contact" | "workflow">("project");
  const [tagsInput, setTagsInput] = useState("");

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.listMemories(categoryFilter === "all" ? undefined : categoryFilter);
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
      showToast("success", "Saved to Personal Memory — now active in Memory Context.");
      await loadMemories();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to save memory.");
    } finally {
      setSaving(false);
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

  return (
    <div className="w-full space-y-4">
      {/* Add Memory Form */}
      <form onSubmit={handleSave} className="nohby-frame space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-[#00D4FF]" />
          <h2 className="font-display text-sm font-semibold text-white">
            Save Personal Memory &amp; Context
          </h2>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-12">
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. 'Project Hydra Sync' or 'Preferred Meeting Hours')"
            className="studio-input h-9 rounded-lg px-3 text-xs sm:col-span-5"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            className="studio-input h-9 rounded-lg px-3 text-xs sm:col-span-3"
          >
            <option value="project">Project</option>
            <option value="preference">Preference</option>
            <option value="fact">Fact</option>
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
            placeholder="Details Nohby ONE should remember across sessions..."
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
          description="Save projects, preferences, contacts, or key workflows above so Nohby ONE personalises every session."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {memories.map((item) => (
            <div key={item.id} className="nohby-frame flex flex-col justify-between p-4">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full bg-[#00D4FF]/15 px-2 py-0.5 font-mono text-[10px] uppercase text-[#00D4FF]">
                    {item.category}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="rounded p-1 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <h3 className="mt-2 text-sm font-semibold text-white">{item.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{item.content}</p>
              </div>

              {item.tags.length > 0 && (
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
          ))}
        </div>
      )}
    </div>
  );
}
