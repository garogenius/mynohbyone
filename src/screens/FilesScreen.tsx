import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Search,
  Sparkles,
  Tag,
  Upload,
  X,
} from "lucide-react";

import { EmptyState, LoadingState } from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { FileExtractionResult, FileItem, KnowledgeSearchMatch } from "../types/api";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesScreen() {
  const { showToast } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [extraction, setExtraction] = useState<FileExtractionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Knowledge search
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KnowledgeSearchMatch[] | null>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.listFiles({ limit: 50 });
      setFiles(res.data.files);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to load files.");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const openInspector = async (fileId: string) => {
    setExtraction(null);
    try {
      const detail = await apiClient.getFile(fileId);
      setSelectedFile(detail.data.file);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to open document.");
    }
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || uploading) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        await apiClient.uploadFile(file);
      }
      showToast(
        "success",
        fileList.length === 1
          ? `Indexed "${fileList[0].name}" — Ready for Voice.`
          : `Indexed ${fileList.length} documents.`
      );
      await loadFiles();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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
    setSearching(true);
    try {
      const res = await apiClient.searchKnowledge({ query: q, limit: 8 });
      setSearchResults(res.data.results);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Header matching Screenshot 2 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">
            Knowledge Base &amp; RAG Files
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Documents indexed for instant voice retrieval during live conversations
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) setSearchResults(null);
              }}
              placeholder="Search knowledge..."
              className="studio-input h-8 w-52 rounded-lg pl-8 pr-3 text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !searchQuery.trim()}
            className="h-8 rounded-lg border border-[#00D4FF]/35 bg-[#00D4FF]/10 px-3 text-xs font-medium text-[#00D4FF] hover:bg-[#00D4FF]/20 disabled:opacity-40"
          >
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
          </button>
        </form>
      </div>

      {/* Sleek Cyan-Dashed Dropzone matching Screenshot 2 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".txt,.md,.markdown,.csv,.json,.xml,.html,.htm,.yaml,.yml,.log,.py,.ts,.tsx,.js,.docx,.pdf"
        className="hidden"
        onChange={(e) => handleUploadFiles(e.target.files)}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleUploadFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-7 text-center transition ${
          dragOver
            ? "border-[#00D4FF] bg-[#00D4FF]/10"
            : "border-[#00D4FF]/40 bg-[#0B101B] hover:border-[#00D4FF]/70"
        }`}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#00D4FF]/30 bg-[#00D4FF]/10 text-[#00D4FF]">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </div>
        <p className="mt-2.5 text-xs font-semibold text-white">
          {uploading ? "Uploading and indexing..." : "Click to upload or drag & drop files here"}
        </p>
        <p className="mt-1 text-[11px] text-zinc-400">
          Supports PDF, DOCX, Markdown, CSV, TXT &amp; JSON · Automatic chunking &amp; indexing
        </p>
      </div>

      {/* Search Matches Strip */}
      {searchResults !== null && (
        <div className="rounded-xl border border-[#00D4FF]/30 bg-[#101624] p-3.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-white">
              Search Matches ({searchResults.length})
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSearchResults(null);
              }}
              className="text-[11px] text-zinc-400 hover:text-white"
            >
              Clear
            </button>
          </div>
          {searchResults.length === 0 ? (
            <p className="mt-1.5 text-xs text-zinc-400">No indexed chunks matched.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {searchResults.map((m) => (
                <button
                  key={m.chunkId}
                  type="button"
                  onClick={() => openInspector(m.fileId)}
                  className="block w-full rounded-lg border border-white/[0.07] bg-[#141B2D] px-3 py-2 text-left transition hover:border-[#00D4FF]/40"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[#00D4FF]">{m.filename}</span>
                    <span className="font-mono text-zinc-500">Chunk #{m.chunkIndex + 1}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-300">{m.excerpt}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Clean Compact Table matching Screenshot 2 */}
      {loading && files.length === 0 ? (
        <LoadingState message="Loading indexed documents..." />
      ) : files.length === 0 ? (
        <EmptyState
          title="No files indexed yet"
          description="Upload a document above to make it instantly searchable by voice and chat."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#101624]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.07] text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-3">Document Name</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Vector RAG Status</th>
                  <th className="px-4 py-3">Voice Context Scope</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {files.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => openInspector(item.id)}
                    className="cursor-pointer transition hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3 font-medium text-white">{item.filename}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-zinc-400">
                      {formatBytes(item.sizeBytes)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                        {item.processingStatus === "indexed" ? "Ready for Voice" : item.processingStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-[#00D4FF]/35 bg-[#00D4FF]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#00D4FF]">
                        Global Context ({item.chunkCount} chunks)
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={acting === item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id, item.filename);
                        }}
                        className="text-xs font-medium text-zinc-400 transition hover:text-rose-400"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Compact Document Inspector Drawer when a row is clicked */}
      {selectedFile && (
        <div className="rounded-xl border border-[#00D4FF]/35 bg-[#101624] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.07] pb-2.5">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-white">{selectedFile.filename}</h3>
              <p className="font-mono text-[10px] text-zinc-500">
                {formatBytes(selectedFile.sizeBytes)} · {selectedFile.chunkCount} chunks
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={acting === "summarise"}
                onClick={handleSummarise}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#00D4FF]/35 bg-[#00D4FF]/10 px-2.5 text-[11px] font-medium text-[#00D4FF]"
              >
                <Sparkles className="h-3 w-3" /> Summarise
              </button>
              <button
                type="button"
                disabled={acting === "extract"}
                onClick={handleExtract}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.12] bg-[#161E30] px-2.5 text-[11px] text-zinc-200"
              >
                <Tag className="h-3 w-3" /> Extract
              </button>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="rounded p-1 text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {selectedFile.summary && (
            <p className="text-xs leading-relaxed text-zinc-300">{selectedFile.summary}</p>
          )}

          {extraction && (
            <div className="flex flex-wrap gap-1.5">
              {extraction.keywords.slice(0, 8).map((kw) => (
                <span
                  key={kw}
                  className="rounded-full border border-[#00D4FF]/30 bg-[#00D4FF]/10 px-2 py-0.5 font-mono text-[10px] text-[#00D4FF]"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          {selectedFile.extractedText && (
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-[#0C121E] p-3 font-mono text-[11px] text-zinc-300">
              {selectedFile.extractedText}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
