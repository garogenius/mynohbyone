import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  CheckSquare,
  Globe,
  Mail,
  Calendar,
} from "lucide-react";

import { EmptyState, LoadingState } from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { FileExtractionResult, FileItem, KnowledgeSearchMatch } from "../types/api";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
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

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KnowledgeSearchMatch[] | null>(null);

  // Focus & extraction prompt
  const [summaryFocus, setSummaryFocus] = useState("");
  const [extractPrompt, setExtractPrompt] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.listFiles({ limit: 50 });
      setFiles(res.data.files);
      if (res.data.files.length > 0) {
        const targetId = selectedFile?.id;
        const match = res.data.files.find((f) => f.id === targetId) || res.data.files[0];
        const detail = await apiClient.getFile(match.id);
        setSelectedFile(detail.data.file);
      } else {
        setSelectedFile(null);
        setExtraction(null);
      }
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to load files.");
    } finally {
      setLoading(false);
    }
  }, [selectedFile?.id, showToast]);

  useEffect(() => {
    loadFiles();
  }, []);

  const selectFile = async (fileId: string) => {
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
    let lastUploadedId: string | null = null;
    try {
      for (const file of Array.from(fileList)) {
        const res = await apiClient.uploadFile(file);
        lastUploadedId = res.data.file.id;
      }
      showToast(
        "success",
        fileList.length === 1
          ? `Uploaded and indexed "${fileList[0].name}".`
          : `Uploaded and indexed ${fileList.length} documents.`
      );
      await loadFiles();
      if (lastUploadedId) {
        await selectFile(lastUploadedId);
      }
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "File upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (fileId: string, filename: string) => {
    setActing(fileId);
    try {
      await apiClient.deleteFile(fileId);
      showToast("info", `Deleted "${filename}".`);
      if (selectedFile?.id === fileId) {
        setSelectedFile(null);
        setExtraction(null);
      }
      await loadFiles();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to delete file.");
    } finally {
      setActing(null);
    }
  };

  const handleSummarise = async () => {
    if (!selectedFile) return;
    setActing("summarise");
    try {
      const res = await apiClient.summariseFile(selectedFile.id, summaryFocus.trim() || undefined);
      setSelectedFile((prev) => (prev ? { ...prev, summary: res.data.summary } : prev));
      setFiles((prev) =>
        prev.map((f) => (f.id === selectedFile.id ? { ...f, summary: res.data.summary } : f))
      );
      showToast("success", "Document summary updated.");
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
      const res = await apiClient.extractFile(selectedFile.id, extractPrompt.trim() || undefined);
      setExtraction(res.data.extraction);
      showToast("success", "Structured insights extracted.");
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Extraction failed.");
    } finally {
      setActing(null);
    }
  };

  const handleKnowledgeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await apiClient.searchKnowledge({ query: q, limit: 12 });
      setSearchResults(res.data.results);
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Knowledge search failed.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Top Action Bar: Knowledge Search + Upload */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleKnowledgeSearch} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim()) setSearchResults(null);
              }}
              placeholder="Search across all indexed documents & knowledge chunks..."
              className="studio-input h-9 w-full rounded-lg pl-9 pr-3 text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !searchQuery.trim()}
            className="btn-ivory inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-xs"
          >
            {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Search
          </button>
          {searchResults !== null && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSearchResults(null);
              }}
              className="inline-flex h-9 shrink-0 items-center rounded-lg border border-white/[0.1] bg-[#111318] px-3 text-xs text-zinc-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </form>

        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.markdown,.csv,.json,.xml,.html,.htm,.yaml,.yml,.log,.py,.ts,.tsx,.js,.docx,.pdf"
            className="hidden"
            onChange={(e) => handleUploadFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="btn-ivory inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload File
          </button>
          <button
            type="button"
            onClick={loadFiles}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#111318] px-3 text-xs font-medium text-zinc-300 transition hover:border-white/[0.2]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Knowledge Search Results Panel */}
      {searchResults !== null && (
        <div className="rounded-xl border border-[#0066FF]/30 bg-[#111318] p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-white">
              Knowledge Search Results ({searchResults.length})
            </h3>
            <span className="font-mono text-[10px] text-zinc-500">Query: &ldquo;{searchQuery}&rdquo;</span>
          </div>
          {searchResults.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-400">
              No indexed document chunks matched your query.
            </p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {searchResults.map((match) => (
                <button
                  key={match.chunkId}
                  type="button"
                  onClick={() => selectFile(match.fileId)}
                  className="rounded-lg border border-white/[0.08] bg-[#171A21] p-3 text-left transition hover:border-[#0066FF]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-white">{match.filename}</span>
                    <span className="shrink-0 rounded-full bg-[#0066FF]/15 px-2 py-0.5 font-mono text-[10px] text-[#0066FF]">
                      Chunk #{match.chunkIndex + 1} · {Math.round(match.score * 100)}%
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-zinc-400">
                    {match.excerpt}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Drag & Drop Upload Strip */}
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
        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3 transition ${
          dragOver
            ? "border-[#0066FF] bg-[#0066FF]/10"
            : "border-white/[0.12] bg-[#111318] hover:border-[#0066FF]/60"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0066FF]/15 text-[#0066FF]">
            <Upload className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-medium text-white">
              Drop documents here or click to upload
            </p>
            <p className="text-[11px] text-zinc-500">
              Supports Markdown, TXT, PDF, DOCX, CSV, JSON, HTML &amp; source code (max 15 MB) — auto-indexed into your private knowledge base.
            </p>
          </div>
        </div>
      </div>

      {/* Main Workspace */}
      {loading && files.length === 0 ? (
        <LoadingState message="Loading document library..." />
      ) : files.length === 0 ? (
        <EmptyState
          title="No documents uploaded yet"
          description="Upload a document above to extract text, generate summaries, pull action items, and search across your personal knowledge base."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          {/* File List */}
          <div className="space-y-2 lg:col-span-4">
            {files.map((item) => {
              const isSelected = selectedFile?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => selectFile(item.id)}
                  className={`group cursor-pointer rounded-xl border p-3 transition ${
                    isSelected
                      ? "border-[#0066FF] bg-[#111318]"
                      : "border-white/[0.08] bg-[#111318] hover:border-white/[0.16]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-[#0066FF]" />
                      <p className="truncate text-xs font-medium text-white">{item.filename}</p>
                    </div>
                    <button
                      type="button"
                      disabled={acting === item.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item.id, item.filename);
                      }}
                      className="rounded p-1 text-zinc-500 opacity-70 transition hover:bg-rose-500/15 hover:text-rose-400 group-hover:opacity-100"
                      title="Delete document"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>
                      {formatBytes(item.sizeBytes)} · {item.chunkCount} chunk{item.chunkCount === 1 ? "" : "s"}
                    </span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Document Intelligence Inspector */}
          <div className="rounded-xl border border-white/[0.08] bg-[#111318] p-4 sm:p-5 lg:col-span-8">
            {selectedFile ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.07] pb-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium capitalize text-emerald-500">
                        {selectedFile.processingStatus}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-500">
                        {formatBytes(selectedFile.sizeBytes)} · {selectedFile.chunkCount} indexed chunk
                        {selectedFile.chunkCount === 1 ? "" : "s"} · SHA256 {selectedFile.checksum.slice(0, 10)}
                      </span>
                    </div>
                    <h3 className="mt-1.5 truncate text-sm font-semibold text-white">
                      {selectedFile.filename}
                    </h3>
                  </div>
                </div>

                {/* Summary Panel */}
                <div className="rounded-xl border border-white/[0.08] bg-[#171A21] p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <Sparkles className="h-3.5 w-3.5 text-[#0066FF]" />
                      Document Summary
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={summaryFocus}
                        onChange={(e) => setSummaryFocus(e.target.value)}
                        placeholder="Optional focus (e.g. deadlines)"
                        className="studio-input h-7 w-44 rounded-md px-2 text-[11px]"
                      />
                      <button
                        type="button"
                        disabled={acting === "summarise"}
                        onClick={handleSummarise}
                        className="btn-ivory inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px]"
                      >
                        {acting === "summarise" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        Summarise
                      </button>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-300">
                    {selectedFile.summary || "Click Summarise to generate a concise summary."}
                  </p>
                </div>

                {/* Structured Extraction Controls & Results */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-semibold text-white">Structured Intelligence</h4>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={extractPrompt}
                        onChange={(e) => setExtractPrompt(e.target.value)}
                        placeholder="Filter lines by topic..."
                        className="studio-input h-7 w-44 rounded-md px-2 text-[11px]"
                      />
                      <button
                        type="button"
                        disabled={acting === "extract"}
                        onClick={handleExtract}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-[#0066FF]/40 bg-[#0066FF]/10 px-2.5 text-[11px] font-medium text-[#0066FF] hover:bg-[#0066FF]/20"
                      >
                        {acting === "extract" ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Tag className="h-3 w-3" />
                        )}
                        Extract Insights
                      </button>
                    </div>
                  </div>

                  {extraction && (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {extraction.keywords.length > 0 && (
                        <div className="rounded-lg border border-white/[0.07] bg-[#171A21] p-3">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                            <Tag className="h-3 w-3 text-[#0066FF]" /> Top Keywords
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {extraction.keywords.map((kw) => (
                              <span
                                key={kw}
                                className="rounded-full bg-[#0066FF]/15 px-2 py-0.5 font-mono text-[10px] text-[#0066FF]"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {extraction.actionItems.length > 0 && (
                        <div className="rounded-lg border border-white/[0.07] bg-[#171A21] p-3">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
                            <CheckSquare className="h-3 w-3 text-emerald-500" /> Action Items
                          </p>
                          <ul className="mt-1.5 space-y-1 text-[11px] text-zinc-300">
                            {extraction.actionItems.slice(0, 6).map((item, i) => (
                              <li key={i} className="truncate">
                                • {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {(extraction.emails.length > 0 || extraction.dates.length > 0 || extraction.urls.length > 0) && (
                        <div className="rounded-lg border border-white/[0.07] bg-[#171A21] p-3 sm:col-span-2">
                          <div className="flex flex-wrap gap-4 text-[11px]">
                            {extraction.emails.length > 0 && (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 font-semibold text-white">
                                  <Mail className="h-3 w-3 text-[#0066FF]" /> Emails
                                </span>
                                <p className="font-mono text-[10px] text-zinc-400">
                                  {extraction.emails.join(", ")}
                                </p>
                              </div>
                            )}
                            {extraction.dates.length > 0 && (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 font-semibold text-white">
                                  <Calendar className="h-3 w-3 text-[#0066FF]" /> Dates
                                </span>
                                <p className="font-mono text-[10px] text-zinc-400">
                                  {extraction.dates.join(", ")}
                                </p>
                              </div>
                            )}
                            {extraction.urls.length > 0 && (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 font-semibold text-white">
                                  <Globe className="h-3 w-3 text-[#0066FF]" /> Links
                                </span>
                                <p className="font-mono text-[10px] text-zinc-400">
                                  {extraction.urls.join(", ")}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Extracted Text Preview */}
                {selectedFile.extractedText !== undefined && (
                  <div>
                    <h4 className="text-xs font-semibold text-white">Extracted Content</h4>
                    <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/[0.07] bg-[#171A21] p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                      {selectedFile.extractedText || "No text content extracted."}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                title="Select a document"
                description="Choose a file from the library to view its summary, extracted entities, and full indexed text."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
