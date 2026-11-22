import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ChevronDown,
  FileCode,
  FileText,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  LayoutGrid,
  List,
  ListFilter,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { LoadingState } from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { FileExtractionResult, FileItem, KnowledgeSearchMatch } from "../types/api";

type LibraryTab = "suggested" | "favorites" | "folders" | "images" | "all";

interface LibraryFolder {
  id: string;
  name: string;
  createdAt: string;
}

interface CuratedAsset {
  id: string;
  title: string;
  kind: "image" | "zip" | "markdown" | "text";
  imageSrc?: string;
  aspectClass?: string;
  previewText?: string;
}

const CURATED_SUGGESTED_ASSETS: CuratedAsset[] = [
  {
    id: "curated-logo-wide",
    title: "NohbyOne Brand Logo.png",
    kind: "image",
    imageSrc: "/logo-black.png",
    aspectClass: "h-36 p-5 bg-white",
  },
  {
    id: "curated-mark-3d",
    title: "NohbyOne Emblem.png",
    kind: "image",
    imageSrc: "/Code_Generated_Image - 2026-11-22T140340.559.png",
    aspectClass: "h-48 p-4 bg-white",
  },
  {
    id: "curated-starter-zip",
    title: "nohby-one-starter-v0.1.0.zip",
    kind: "zip",
    previewText: "Nohby ONE Desktop & Local Agent Starter Package (v0.1.0)",
  },
  {
    id: "curated-pasted-txt",
    title: "Pasted text(5).txt",
    kind: "text",
    previewText: "Quick workspace notes and voice session snippets indexed for NohbyAI.",
  },
  {
    id: "curated-pasted-md",
    title: "Pasted markdown(1).md",
    kind: "markdown",
    previewText: "# Nohby ONE Architecture\nLocal-first execution with scoped approvals and real-time voice.",
  },
  {
    id: "curated-studio-portrait",
    title: "Executive Studio.jpg",
    kind: "image",
    imageSrc: "/nohby-studio-2.jpg",
    aspectClass: "h-64 p-0",
  },
];

const FAVORITES_STORAGE_KEY = "nohbyone.library.favorites";
const FOLDERS_STORAGE_KEY = "nohbyone.library.folders";
const IMAGE_PREVIEWS_STORAGE_KEY = "nohbyone.library.imagePreviews";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFilename(name: string): boolean {
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
}

function isArchiveFilename(name: string): boolean {
  return /\.(zip|tar|gz)$/i.test(name);
}

export function FilesScreen() {
  const { showToast } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [selectedCurated, setSelectedCurated] = useState<CuratedAsset | null>(null);
  const [extraction, setExtraction] = useState<FileExtractionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  // Library UI controls matching Screenshot
  const [activeTab, setActiveTab] = useState<LibraryTab>("suggested");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortAsc, setSortAsc] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("Pasted markdown.md");
  const [pasteContent, setPasteContent] = useState("");
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Persistent favorites, folders & uploaded image data URLs
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [folders, setFolders] = useState<LibraryFolder[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FOLDERS_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(IMAGE_PREVIEWS_STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  });

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeSearchMatch[] | null>(null);

  const toggleFavorite = (id: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.listFiles({ limit: 50 });
      setFiles(res.data.files);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to load library.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const openInspector = async (fileId: string) => {
    setExtraction(null);
    setSelectedCurated(null);
    try {
      const detail = await apiClient.getFile(fileId);
      setSelectedFile(detail.data.file);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to open item.");
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string | null> =>
    new Promise((resolve) => {
      if (!file.type.startsWith("image/") || file.size > 2.5 * 1024 * 1024) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || uploading) return;
    setUploading(true);
    setNewMenuOpen(false);
    try {
      const nextPreviews = { ...imagePreviews };
      for (const file of Array.from(fileList)) {
        const preview = await readFileAsDataUrl(file);
        const uploaded = await apiClient.uploadFile(file);
        if (preview && uploaded.data?.file?.id) {
          nextPreviews[uploaded.data.file.id] = preview;
        }
      }
      setImagePreviews(nextPreviews);
      try {
        localStorage.setItem(IMAGE_PREVIEWS_STORAGE_KEY, JSON.stringify(nextPreviews));
      } catch {
        // Ignore storage quota
      }
      showToast(
        "success",
        fileList.length === 1
          ? `Added "${fileList[0].name}" to Library.`
          : `Added ${fileList.length} items to Library.`
      );
      await loadFiles();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSavePastedDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = pasteContent.trim();
    if (!content || uploading) return;
    let filename = pasteTitle.trim() || "Pasted markdown.md";
    if (!/\.(md|txt|json|csv)$/i.test(filename)) {
      filename += ".md";
    }
    const blob = new Blob([content], { type: filename.endsWith(".txt") ? "text/plain" : "text/markdown" });
    const file = new File([blob], filename, { type: blob.type });
    setPasteModalOpen(false);
    setPasteContent("");
    const dt = new DataTransfer();
    dt.items.add(file);
    await handleUploadFiles(dt.files);
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    const folder: LibraryFolder = {
      id: `folder-${Date.now()}`,
      name,
      createdAt: new Date().toISOString(),
    };
    const next = [folder, ...folders];
    setFolders(next);
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(next));
    setNewFolderName("");
    setFolderModalOpen(false);
    setActiveTab("folders");
    showToast("success", `Folder "${name}" created.`);
  };

  const handleDeleteFolder = (id: string) => {
    const next = folders.filter((f) => f.id !== id);
    setFolders(next);
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(next));
  };

  const handleDelete = async (fileId: string, filename: string) => {
    setActing(fileId);
    try {
      await apiClient.deleteFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      if (selectedFile?.id === fileId) setSelectedFile(null);
      showToast("info", `Removed "${filename}".`);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to remove file.");
    } finally {
      setActing(null);
    }
  };

  const handleSummarise = async () => {
    if (!selectedFile) return;
    setActing("summarise");
    try {
      const res = await apiClient.summariseFile(selectedFile.id);
      setSelectedFile((prev) => (prev ? { ...prev, summary: res.data.summary } : prev));
      showToast("success", "Summary updated.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Summarization failed.");
    } finally {
      setActing(null);
    }
  };

  const handleExtract = async () => {
    if (!selectedFile) return;
    setActing("extract");
    try {
      const res = await apiClient.extractFile(selectedFile.id);
      setExtraction(res.data.extraction);
      showToast("success", "Insights extracted.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Extraction failed.");
    } finally {
      setActing(null);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    try {
      const res = await apiClient.searchKnowledge({ query: q, limit: 8 });
      setSearchResults(res.data.results);
    } catch {
      setSearchResults(null);
    }
  };

  const qLower = searchQuery.trim().toLowerCase();

  // Filter real uploaded files
  const filteredFiles = [...files]
    .filter((f) => {
      if (qLower && !f.filename.toLowerCase().includes(qLower)) return false;
      if (activeTab === "favorites") return favoriteIds.includes(f.id);
      if (activeTab === "images") return isImageFilename(f.filename);
      if (activeTab === "folders") return false;
      return true;
    })
    .sort((a, b) =>
      sortAsc
        ? a.filename.localeCompare(b.filename)
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  // Filter curated starter assets
  const filteredCurated = CURATED_SUGGESTED_ASSETS.filter((c) => {
    if (qLower && !c.title.toLowerCase().includes(qLower)) return false;
    if (activeTab === "favorites") return favoriteIds.includes(c.id);
    if (activeTab === "images") return c.kind === "image";
    if (activeTab === "folders") return false;
    return activeTab === "suggested" || activeTab === "all";
  });

  const TABS: { id: LibraryTab; label: string }[] = [
    { id: "suggested", label: "Suggested" },
    { id: "favorites", label: "Favorites" },
    { id: "folders", label: "Folders" },
    { id: "images", label: "Images" },
    { id: "all", label: "All" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-2 py-2 sm:px-4">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".md,.markdown,.txt,.pdf,.docx,.csv,.json,.xml,.html,.htm,.yaml,.yml,.log,.py,.ts,.tsx,.js,.png,.jpg,.jpeg,.webp,.gif,.svg,.zip"
        onChange={(e) => handleUploadFiles(e.target.files)}
        className="hidden"
      />

      {/* Top Library Header & Toolbar (Exact Reference Match) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-xl font-semibold text-white">Library</h1>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sort Button */}
          <button
            type="button"
            onClick={() => setSortAsc((v) => !v)}
            title={sortAsc ? "Sorted A–Z" : "Sorted by newest"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            <ListFilter className="h-4 w-4" />
          </button>

          {/* Grid / List Toggle */}
          <div className="flex items-center rounded-full border border-white/[0.08] bg-[#141B2D]/70 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Grid view"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                viewMode === "grid"
                  ? "bg-white/[0.12] text-white shadow-xs"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List view"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                viewMode === "list"
                  ? "bg-white/[0.12] text-white shadow-xs"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Search Library Pill */}
          <form onSubmit={handleSearch} className="relative w-48 sm:w-64">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) setSearchResults(null);
              }}
              placeholder="Search library"
              className="studio-input h-9 w-full rounded-full pl-9 pr-4 text-xs"
            />
          </form>

          {/* New ⌄ Dropdown Button */}
          <div className="relative">
            <button
              type="button"
              disabled={uploading}
              onClick={() => setNewMenuOpen((v) => !v)}
              className="btn-ivory inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold shadow-sm"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <span>New</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>

            {newMenuOpen && (
              <div className="dropdown-surface absolute right-0 top-full z-30 mt-1.5 w-48 rounded-2xl p-1.5 shadow-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setNewMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs text-zinc-200 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <Upload className="h-3.5 w-3.5 text-[#00D4FF]" />
                  Upload File or Image
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewMenuOpen(false);
                    setPasteModalOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs text-zinc-200 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <FileCode className="h-3.5 w-3.5 text-[#00D4FF]" />
                  Paste Markdown / Text
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewMenuOpen(false);
                    setFolderModalOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs text-zinc-200 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <FolderPlus className="h-3.5 w-3.5 text-[#00D4FF]" />
                  New Folder
                </button>
              </div>
            )}
          </div>

          {/* Filter Sliders Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Upload to library"
            className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filter Tabs Row: Suggested | Favorites | Folders | Images | All */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                active
                  ? "bg-white/[0.1] text-white shadow-xs"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Knowledge RAG Search Results Banner */}
      {searchResults && (
        <div className="nohby-frame space-y-2 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#00D4FF]">
              {searchResults.length} knowledge match{searchResults.length === 1 ? "" : "es"} for &ldquo;{searchQuery}&rdquo;
            </p>
            <button
              type="button"
              onClick={() => setSearchResults(null)}
              className="text-xs text-zinc-400 hover:text-white"
            >
              Close
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {searchResults.map((hit) => (
                <button
                  key={hit.chunkId}
                  type="button"
                  onClick={() => openInspector(hit.fileId)}
                  className="rounded-xl border border-white/[0.08] bg-[#141B2D]/70 p-2.5 text-left transition hover:border-[#00D4FF]/40"
                >
                  <p className="text-xs font-semibold text-white">{hit.filename}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] text-zinc-400">{hit.excerpt}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <LoadingState message="Loading library..." />
      ) : activeTab === "folders" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setFolderModalOpen(true)}
            className="flex h-44 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.15] bg-[#141B2D]/40 p-4 text-zinc-400 transition hover:border-[#00D4FF]/50 hover:text-white"
          >
            <FolderPlus className="h-8 w-8 text-[#00D4FF]" />
            <span className="text-xs font-semibold">Create Folder</span>
          </button>

          {folders.map((folder) => (
            <div
              key={folder.id}
              className="group relative flex h-44 flex-col justify-between rounded-2xl border border-white/[0.08] bg-[#101624] p-4 shadow-xs transition hover:border-[#00D4FF]/40"
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-xs font-semibold text-white">{folder.name}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteFolder(folder.id)}
                  className="rounded p-1 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-1 items-center justify-center">
                <Folder className="h-12 w-12 text-[#0094E8]" />
              </div>
              <p className="text-[10px] text-zinc-400">Workspace Folder</p>
            </div>
          ))}
        </div>
      ) : viewMode === "list" ? (
        <div className="nohby-frame divide-y divide-white/[0.06] overflow-hidden">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              onClick={() => openInspector(file.id)}
              className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/[0.04]"
            >
              <div className="flex min-w-0 items-center gap-3">
                {isImageFilename(file.filename) ? (
                  <ImageIcon className="h-4 w-4 shrink-0 text-[#0094E8]" />
                ) : isArchiveFilename(file.filename) ? (
                  <Archive className="h-4 w-4 shrink-0 text-zinc-300" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-[#0094E8]" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">{file.filename}</p>
                  <p className="text-[10px] text-zinc-400">{formatBytes(file.sizeBytes)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(file.id);
                  }}
                  className={`rounded p-1 ${
                    favoriteIds.includes(file.id) ? "text-amber-400" : "text-zinc-500 hover:text-white"
                  }`}
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(file.id, file.filename);
                  }}
                  className="rounded p-1 text-zinc-500 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {filteredCurated.map((c) => (
            <div
              key={c.id}
              onClick={() => {
                setSelectedFile(null);
                setSelectedCurated(c);
              }}
              className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition hover:bg-white/[0.04]"
            >
              <div className="flex min-w-0 items-center gap-3">
                {c.kind === "image" ? (
                  <ImageIcon className="h-4 w-4 shrink-0 text-[#0094E8]" />
                ) : c.kind === "zip" ? (
                  <Archive className="h-4 w-4 shrink-0 text-zinc-300" />
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-[#0094E8]" />
                )}
                <p className="truncate text-xs font-semibold text-white">{c.title}</p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(c.id);
                }}
                className={`rounded p-1 ${
                  favoriteIds.includes(c.id) ? "text-amber-400" : "text-zinc-500 hover:text-white"
                }`}
              >
                <Star className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        /* Masonry / Bento Card Grid matching Screenshot 1 */
        <div className="columns-1 gap-4 space-y-4 sm:columns-2 md:columns-3 lg:columns-4">
          {/* 1. User's Real Uploaded Files */}
          {filteredFiles.map((file) => {
            const isImg = isImageFilename(file.filename);
            const isZip = isArchiveFilename(file.filename);
            const previewUrl = imagePreviews[file.id];
            const isFav = favoriteIds.includes(file.id);

            if (isImg && previewUrl) {
              return (
                <div
                  key={file.id}
                  onClick={() => openInspector(file.id)}
                  className="group relative break-inside-avoid cursor-pointer overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101624] p-2 shadow-sm transition hover:border-[#00D4FF]/50"
                >
                  <img
                    src={previewUrl}
                    alt={file.filename}
                    className="max-h-60 w-full rounded-xl object-contain"
                  />
                  <div className="mt-1.5 flex items-center justify-between px-1">
                    <span className="truncate text-[11px] font-medium text-white">
                      {file.filename}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(file.id);
                        }}
                        className={`rounded p-1 ${
                          isFav ? "text-amber-400" : "text-zinc-400 opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        <Star className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(file.id, file.filename);
                        }}
                        className="rounded p-1 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={file.id}
                onClick={() => openInspector(file.id)}
                className="group break-inside-avoid cursor-pointer rounded-2xl border border-white/[0.08] bg-[#101624] p-2 shadow-sm transition hover:border-[#00D4FF]/50"
              >
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    {isZip ? (
                      <Archive className="h-4 w-4 shrink-0 text-zinc-300" />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 text-[#0094E8]" />
                    )}
                    <span className="truncate text-xs font-medium text-white">
                      {file.filename}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(file.id);
                      }}
                      className={`rounded p-1 ${
                        isFav ? "text-amber-400" : "text-zinc-400 opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <Star className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(file.id, file.filename);
                      }}
                      className="rounded p-1 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                <div className="mt-1 flex h-44 flex-col items-center justify-center rounded-xl bg-[#141B2D]/55 p-4">
                  {isZip ? (
                    <Archive className="h-10 w-10 text-zinc-300" />
                  ) : isImg ? (
                    <ImageIcon className="h-10 w-10 text-[#0094E8]" />
                  ) : (
                    <FileText className="h-10 w-10 text-[#0094E8]" />
                  )}
                </div>
              </div>
            );
          })}

          {/* 2. Curated Visual Library Cards (Exact Reference Cards) */}
          {filteredCurated.map((item) => {
            const isFav = favoriteIds.includes(item.id);
            if (item.kind === "image" && item.imageSrc) {
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedFile(null);
                    setSelectedCurated(item);
                  }}
                  className="group relative break-inside-avoid cursor-pointer overflow-hidden rounded-2xl border border-white/[0.08] bg-[#101624] shadow-sm transition hover:border-[#00D4FF]/50"
                >
                  <div
                    className={`flex w-full items-center justify-center overflow-hidden ${
                      item.aspectClass || "h-44 p-4"
                    }`}
                  >
                    <img
                      src={item.imageSrc}
                      alt={item.title}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(item.id);
                    }}
                    className={`absolute right-2.5 top-2.5 rounded-full bg-black/40 p-1.5 backdrop-blur-xs transition ${
                      isFav ? "text-amber-400 opacity-100" : "text-white opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                onClick={() => {
                  setSelectedFile(null);
                  setSelectedCurated(item);
                }}
                className="group break-inside-avoid cursor-pointer rounded-2xl border border-white/[0.08] bg-[#101624] p-2 shadow-sm transition hover:border-[#00D4FF]/50"
              >
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    {item.kind === "zip" ? (
                      <Archive className="h-4 w-4 shrink-0 text-zinc-300" />
                    ) : (
                      <FileText className="h-4 w-4 shrink-0 text-[#0094E8]" />
                    )}
                    <span className="truncate text-xs font-medium text-white">
                      {item.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(item.id);
                    }}
                    className={`rounded p-1 ${
                      isFav ? "text-amber-400" : "text-zinc-400 opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <Star className="h-3 w-3" />
                  </button>
                </div>

                <div className="mt-1 flex h-44 items-center justify-center rounded-xl bg-[#141B2D]/55">
                  {item.kind === "zip" ? (
                    <Archive className="h-10 w-10 text-zinc-300" />
                  ) : (
                    <FileText className="h-10 w-10 text-[#0094E8]" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paste Markdown / Text Modal */}
      {pasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="dropdown-surface w-full max-w-lg rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-white">
                Add Pasted Text or Markdown
              </h3>
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSavePastedDoc} className="mt-3.5 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">Filename</label>
                <input
                  type="text"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  className="studio-input h-9 w-full rounded-lg px-3 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-300">Content</label>
                <textarea
                  rows={6}
                  required
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Paste markdown or text to index in your Library..."
                  className="studio-input w-full rounded-lg p-3 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasteModalOpen(false)}
                  className="h-8 rounded-lg border border-white/[0.1] px-3 text-xs text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!pasteContent.trim() || uploading}
                  className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-4 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Save to Library
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {folderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="dropdown-surface w-full max-w-sm rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-white">New Folder</h3>
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateFolder} className="mt-3.5 space-y-3">
              <input
                type="text"
                required
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name..."
                className="studio-input h-9 w-full rounded-lg px-3 text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFolderModalOpen(false)}
                  className="h-8 rounded-lg border border-white/[0.1] px-3 text-xs text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim()}
                  className="btn-ivory h-8 rounded-lg px-4 text-xs"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Curated Asset Quick Preview Modal */}
      {selectedCurated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="dropdown-surface w-full max-w-lg rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-white">
                {selectedCurated.title}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedCurated(null)}
                className="rounded-lg p-1 text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4">
              {selectedCurated.imageSrc ? (
                <div className="flex max-h-80 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-white p-4">
                  <img
                    src={selectedCurated.imageSrc}
                    alt={selectedCurated.title}
                    className="max-h-72 object-contain"
                  />
                </div>
              ) : (
                <pre className="rounded-xl border border-white/[0.08] bg-[#141B2D]/70 p-4 font-mono text-xs whitespace-pre-wrap text-zinc-200">
                  {selectedCurated.previewText}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Real Uploaded File Inspector Modal (AI Summary + Insights + Content) */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="dropdown-surface max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
              <div>
                <h3 className="font-display text-sm font-semibold text-white">
                  {selectedFile.filename}
                </h3>
                <p className="text-[11px] text-zinc-400">
                  {formatBytes(selectedFile.sizeBytes)} · {selectedFile.chunkCount} chunks indexed · Ready for Voice
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={acting === "summarise"}
                  onClick={handleSummarise}
                  className="btn-ivory inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11px]"
                >
                  {acting === "summarise" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Refresh AI Summary
                </button>
                <button
                  type="button"
                  disabled={acting === "extract"}
                  onClick={handleExtract}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.12] bg-[#161E30] px-2.5 text-[11px] text-zinc-200 hover:border-[#00D4FF]/50"
                >
                  {acting === "extract" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3 text-[#00D4FF]" />
                  )}
                  Extract Insights
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="rounded-lg p-1 text-zinc-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {imagePreviews[selectedFile.id] && (
                <div className="flex max-h-64 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-[#141B2D]/60 p-3">
                  <img
                    src={imagePreviews[selectedFile.id]}
                    alt={selectedFile.filename}
                    className="max-h-56 object-contain"
                  />
                </div>
              )}

              <div className="rounded-xl border border-white/[0.08] bg-[#141B2D]/70 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#00D4FF]">
                  AI Summary
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-200">
                  {selectedFile.summary || "No summary generated yet."}
                </p>
              </div>

              {extraction && (
                <div className="rounded-xl border border-[#00D4FF]/30 bg-[#141B2D]/70 p-3 text-xs">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#00D4FF]">
                    Extracted Action Items &amp; Entities
                  </p>
                  {extraction.actionItems.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-zinc-200">
                      {extraction.actionItems.slice(0, 5).map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {selectedFile.extractedText && (
                <div className="rounded-xl border border-white/[0.08] bg-[#141B2D]/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Extracted Text
                  </p>
                  <pre className="mt-1.5 max-h-48 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap text-zinc-300">
                    {selectedFile.extractedText}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
