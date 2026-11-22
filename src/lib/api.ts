import { tokenStorage } from "./storage";
import type {
  AgentRegistrationInfo,
  ApiErrorDetail,
  ApiErrorResponse,
  ApiSuccessResponse,
  Approval,
  AuthTokensPayload,
  Conversation,
  Device,
  DevicePlatform,
  FileExtractionResult,
  FileItem,
  HealthData,
  IntegrationItem,
  IntegrationProviderSpec,
  InterpretationResult,
  KnowledgeSearchMatch,
  MeetingItem,
  MeetingTranscriptItem,
  MemoryItem,
  Message,
  Permission,
  SendMessageResponseData,
  SpeechSynthesisResult,
  Task,
  TaskEvent,
  ToolDefinition,
  TranscriptionResult,
  User,
  VoiceSettings,
} from "../types/api";

const PRODUCTION_API_BASE_URL =
  "https://respectful-transformation-production-87dc0ab5.up.railway.app/api/v1";

function resolveApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  if (
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    return PRODUCTION_API_BASE_URL;
  }
  return "http://localhost:8000/api/v1";
}

export const API_BASE_URL = resolveApiBaseUrl();

const ROOT_BASE_URL = API_BASE_URL.replace(/\/api\/v1$/, "");

export class ApiError extends Error {
  code: string;
  status: number;
  details: ApiErrorDetail[];
  requestId: string;

  constructor(
    message: string,
    code = "INTERNAL_ERROR",
    status = 500,
    details: ApiErrorDetail[] = [],
    requestId = ""
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function attemptTokenRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { refreshToken } = tokenStorage.getSession();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        tokenStorage.clearSession();
        return false;
      }

      const body = (await response.json()) as ApiSuccessResponse<AuthTokensPayload>;
      tokenStorage.setTokens(body.data.accessToken, body.data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(
  path: string,
  options: RequestInit & { auth?: boolean; root?: boolean; _retried?: boolean } = {}
): Promise<ApiSuccessResponse<T>> {
  const { auth = true, root = false, _retried = false, headers, ...rest } = options;
  const url = `${root ? ROOT_BASE_URL : API_BASE_URL}${path}`;

  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> | undefined),
  };

  if (auth) {
    const { accessToken } = tokenStorage.getSession();
    if (accessToken) {
      reqHeaders["Authorization"] = `Bearer ${accessToken}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(url, { ...rest, headers: reqHeaders });
  } catch {
    throw new ApiError(
      "Unable to reach Nohby ONE backend service.",
      "PROVIDER_UNAVAILABLE",
      0
    );
  }

  if (response.status === 401 && auth && !_retried) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      return request<T>(path, { ...options, _retried: true });
    }
  }

  let json: ApiSuccessResponse<T> | ApiErrorResponse;
  try {
    json = await response.json();
  } catch {
    throw new ApiError(
      `Unexpected response from server (${response.status}).`,
      "INTERNAL_ERROR",
      response.status
    );
  }

  if (!response.ok || !json.success) {
    const err = json as ApiErrorResponse;
    throw new ApiError(
      err.message || "Request failed.",
      err.error?.code || "INTERNAL_ERROR",
      response.status,
      err.error?.details || [],
      err.meta?.requestId || ""
    );
  }

  return json as ApiSuccessResponse<T>;
}

export const apiClient = {
  health(): Promise<ApiSuccessResponse<HealthData>> {
    return request<HealthData>("/health", { method: "GET", auth: false, root: true });
  },

  register(payload: { name: string; email: string; password: string }) {
    return request<{ user: User }>("/auth/register", {
      method: "POST",
      auth: false,
      body: JSON.stringify(payload),
    });
  },

  login(payload: { email: string; password: string; deviceId?: string | null }) {
    return request<AuthTokensPayload>("/auth/login", {
      method: "POST",
      auth: false,
      body: JSON.stringify(payload),
    });
  },

  logout(refreshToken?: string | null) {
    return request<{ revokedSessions: number }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: refreshToken || undefined }),
    });
  },

  getMe() {
    return request<{ user: User }>("/auth/me", { method: "GET" });
  },

  updateMe(payload: {
    name?: string;
    displayName?: string;
    timezone?: string;
    locale?: string;
    preferredLanguage?: string;
  }) {
    return request<{ user: User }>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  forgotPassword(email: string) {
    return request<{ accepted: boolean }>("/auth/password/forgot", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email }),
    });
  },

  registerDevice(payload: {
    deviceName: string;
    platform: DevicePlatform;
    platformVersion?: string;
    appVersion: string;
    deviceFingerprint?: string;
    deviceCapabilities: string[];
  }) {
    return request<{ device: Device }>("/devices/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listDevices() {
    return request<{ devices: Device[]; total: number }>("/devices", { method: "GET" });
  },

  updateDevice(
    deviceId: string,
    payload: { deviceName?: string; appVersion?: string; deviceCapabilities?: string[] }
  ) {
    return request<{ device: Device }>(`/devices/${deviceId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  revokeDevice(deviceId: string) {
    return request<{ device: Device; revokedSessions: number }>(`/devices/${deviceId}`, {
      method: "DELETE",
    });
  },

  deviceHeartbeat(deviceId: string, payload: { appVersion?: string } = {}) {
    return request<{ device: Device }>(`/devices/${deviceId}/heartbeat`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // Phase 2: Conversations & AI
  listConversations(params: { page?: number; limit?: number; search?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.search) qs.set("search", params.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<{
      conversations: Conversation[];
      pagination: { page: number; limit: number; total: number };
    }>(`/conversations${suffix}`, { method: "GET" });
  },

  createConversation(payload: { title?: string; mode?: "general" | "assistant" | "research" | "meeting" } = {}) {
    return request<{ conversation: Conversation }>("/conversations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getConversation(conversationId: string) {
    return request<{ conversation: Conversation; messages: Message[] }>(
      `/conversations/${conversationId}`,
      { method: "GET" }
    );
  },

  updateConversation(
    conversationId: string,
    payload: { title?: string; status?: "active" | "archived" }
  ) {
    return request<{ conversation: Conversation }>(`/conversations/${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deleteConversation(conversationId: string) {
    return request<{ deleted: boolean; id: string }>(`/conversations/${conversationId}`, {
      method: "DELETE",
    });
  },

  listMessages(conversationId: string, params: { page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<{
      messages: Message[];
      pagination: { page: number; limit: number; total: number };
    }>(`/conversations/${conversationId}/messages${suffix}`, { method: "GET" });
  },

  sendMessage(
    conversationId: string,
    payload: { content: string; inputType?: "text" | "voice"; deviceId?: string | null }
  ) {
    return request<SendMessageResponseData>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  interpretInstruction(payload: { instruction: string; deviceId?: string | null; conversationId?: string | null }) {
    return request<InterpretationResult>("/ai/interpret", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // Phase 3: Voice & Speech
  getVoiceSettings() {
    return request<{ settings: VoiceSettings }>("/voice/settings", { method: "GET" });
  },

  updateVoiceSettings(payload: Partial<VoiceSettings>) {
    return request<{ settings: VoiceSettings }>("/voice/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async transcribeAudio(payload: {
    file: Blob;
    filename?: string;
    language?: string;
    transcriptHint?: string;
  }) {
    const form = new FormData();
    form.append("file", payload.file, payload.filename || "voice.webm");
    if (payload.language) form.append("language", payload.language);
    if (payload.transcriptHint) form.append("transcriptHint", payload.transcriptHint);

    const { accessToken } = tokenStorage.getSession();
    const response = await fetch(`${API_BASE_URL}/voice/transcriptions`, {
      method: "POST",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: form,
    });
    const json = (await response.json()) as
      | ApiSuccessResponse<{ transcription: TranscriptionResult }>
      | ApiErrorResponse;
    if (!response.ok || !json.success) {
      const err = json as ApiErrorResponse;
      throw new ApiError(
        err.message || "Transcription failed.",
        err.error?.code || "INTERNAL_ERROR",
        response.status,
        err.error?.details || [],
        err.meta?.requestId || ""
      );
    }
    return json as ApiSuccessResponse<{ transcription: TranscriptionResult }>;
  },

  synthesizeSpeech(payload: { text: string; voice?: string; rate?: number; language?: string }) {
    return request<{ speech: SpeechSynthesisResult }>("/voice/speech", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // Phase 4: Tasks, Permissions & Approvals
  createTask(payload: {
    instruction: string;
    deviceId?: string | null;
    conversationId?: string | null;
    source?: string;
  }) {
    return request<{ task: Task }>("/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listTasks(params: { page?: number; limit?: number; status?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<{
      tasks: Task[];
      pagination: { page: number; limit: number; total: number };
    }>(`/tasks${suffix}`, { method: "GET" });
  },

  getTask(taskId: string) {
    return request<{ task: Task; events: TaskEvent[] }>(`/tasks/${taskId}`, { method: "GET" });
  },

  pauseTask(taskId: string) {
    return request<{ task: Task }>(`/tasks/${taskId}/pause`, { method: "POST" });
  },

  resumeTask(taskId: string) {
    return request<{ task: Task }>(`/tasks/${taskId}/resume`, { method: "POST" });
  },

  cancelTask(taskId: string) {
    return request<{ task: Task }>(`/tasks/${taskId}/cancel`, { method: "POST" });
  },

  listPermissions() {
    return request<{ permissions: Permission[] }>("/permissions", { method: "GET" });
  },

  grantPermission(payload: {
    deviceId?: string | null;
    resource: string;
    actions: string[];
    expiresAt?: string | null;
  }) {
    return request<{ permission: Permission }>("/permissions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  revokePermission(permissionId: string) {
    return request<{ permission: Permission }>(`/permissions/${permissionId}`, {
      method: "DELETE",
    });
  },

  listPendingApprovals() {
    return request<{ approvals: Approval[] }>("/approvals/pending", { method: "GET" });
  },

  approveAction(approvalId: string, actionFingerprint?: string) {
    return request<{ approval: Approval; task: Task }>(`/approvals/${approvalId}/approve`, {
      method: "POST",
      body: JSON.stringify({ actionFingerprint }),
    });
  },

  rejectAction(approvalId: string, reason?: string) {
    return request<{ approval: Approval; task: Task }>(`/approvals/${approvalId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },

  // Phase 5: Local Agent Execution Protocol & Automation
  getAgentTools() {
    return request<{ tools: ToolDefinition[] }>("/agent/tools", { method: "GET" });
  },

  registerAgent(payload: {
    deviceId: string;
    agentVersion?: string;
    capabilities?: string[];
  }) {
    return request<{ agent: AgentRegistrationInfo; tools: ToolDefinition[] }>("/agent/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  agentHeartbeat(payload: {
    deviceId: string;
    agentVersion?: string;
    status?: "idle" | "busy" | "paused";
  }) {
    return request<{ deviceId: string; status: string; lastSeenAt: string }>("/agent/heartbeat", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getNextAgentTask(deviceId: string) {
    return request<{ task: Task | null }>(
      `/agent/tasks/next?deviceId=${encodeURIComponent(deviceId)}`,
      { method: "GET" }
    );
  },

  claimAgentTask(taskId: string, deviceId: string) {
    return request<{ task: Task }>(`/agent/tasks/${taskId}/claim`, {
      method: "POST",
      body: JSON.stringify({ deviceId }),
    });
  },

  reportAgentStepEvent(
    taskId: string,
    payload: {
      deviceId: string;
      stepId?: string | null;
      eventType: "task.step.started" | "task.step.completed" | "task.step.failed" | "task.log";
      outputData?: Record<string, unknown> | null;
      message?: string | null;
    }
  ) {
    return request<{ task: Task }>(`/agent/tasks/${taskId}/events`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  completeAgentTask(
    taskId: string,
    payload: {
      deviceId: string;
      summary: string;
      evidence?: Record<string, unknown>;
    }
  ) {
    return request<{ task: Task }>(`/agent/tasks/${taskId}/complete`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  failAgentTask(
    taskId: string,
    payload: {
      deviceId: string;
      errorCode?: string;
      errorMessage: string;
      stepId?: string | null;
    }
  ) {
    return request<{ task: Task }>(`/agent/tasks/${taskId}/fail`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // Phase 6: Files & Document Intelligence
  async uploadFile(file: File | Blob, filename?: string) {
    const form = new FormData();
    const resolvedName = filename || (file instanceof File ? file.name : "document.txt");
    form.append("file", file, resolvedName);

    const { accessToken } = tokenStorage.getSession();
    const response = await fetch(`${API_BASE_URL}/files/upload`, {
      method: "POST",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: form,
    });
    const json = (await response.json()) as
      | ApiSuccessResponse<{ file: FileItem }>
      | ApiErrorResponse;
    if (!response.ok || !json.success) {
      const err = json as ApiErrorResponse;
      throw new ApiError(
        err.message || "File upload failed.",
        err.error?.code || "INTERNAL_ERROR",
        response.status,
        err.error?.details || [],
        err.meta?.requestId || ""
      );
    }
    return json as ApiSuccessResponse<{ file: FileItem }>;
  },

  listFiles(params: { page?: number; limit?: number; search?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    if (params.search) qs.set("search", params.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<{
      files: FileItem[];
      pagination: { page: number; limit: number; total: number };
    }>(`/files${suffix}`, { method: "GET" });
  },

  getFile(fileId: string) {
    return request<{ file: FileItem }>(`/files/${fileId}`, { method: "GET" });
  },

  deleteFile(fileId: string) {
    return request<{ deleted: boolean; id: string }>(`/files/${fileId}`, {
      method: "DELETE",
    });
  },

  summariseFile(fileId: string, focus?: string) {
    return request<{ fileId: string; summary: string; file: FileItem }>(
      `/files/${fileId}/summarise`,
      {
        method: "POST",
        body: JSON.stringify(focus ? { focus } : {}),
      }
    );
  },

  extractFile(fileId: string, prompt?: string) {
    return request<{ fileId: string; filename: string; extraction: FileExtractionResult }>(
      `/files/${fileId}/extract`,
      {
        method: "POST",
        body: JSON.stringify(prompt ? { prompt } : {}),
      }
    );
  },

  searchKnowledge(payload: { query: string; limit?: number; fileId?: string }) {
    return request<{
      query: string;
      totalMatches: number;
      results: KnowledgeSearchMatch[];
    }>("/knowledge/search", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // Phase 7: Integrations (Social Media, Meetings, Email, Calendar, Plugins)
  listAvailableIntegrations() {
    return request<{ providers: IntegrationProviderSpec[] }>("/integrations/available", {
      method: "GET",
    });
  },

  listIntegrations() {
    return request<{ integrations: IntegrationItem[] }>("/integrations", { method: "GET" });
  },

  connectIntegration(
    provider: string,
    payload: { accountLabel: string; scopes?: string[]; config?: Record<string, unknown> }
  ) {
    return request<{ integration: IntegrationItem }>(`/integrations/${provider}/connect`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  syncIntegration(integrationId: string) {
    return request<{ integration: IntegrationItem }>(`/integrations/${integrationId}/sync`, {
      method: "POST",
    });
  },

  disconnectIntegration(integrationId: string) {
    return request<{ disconnected: boolean; id: string }>(`/integrations/${integrationId}`, {
      method: "DELETE",
    });
  },

  // Phase 8: Meetings & Stealth Background Interview Assistant
  listMeetings() {
    return request<{ meetings: MeetingItem[] }>("/meetings", { method: "GET" });
  },

  createMeeting(payload: {
    title: string;
    meetingType?: "interview" | "meeting" | "standup" | "client_call";
    provider?: string;
    stealthMode?: boolean;
  }) {
    return request<{ meeting: MeetingItem }>("/meetings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getMeeting(meetingId: string) {
    return request<{ meeting: MeetingItem }>(`/meetings/${meetingId}`, { method: "GET" });
  },

  toggleMeetingStealth(meetingId: string, stealthMode: boolean) {
    return request<{ meeting: MeetingItem }>(`/meetings/${meetingId}/stealth`, {
      method: "POST",
      body: JSON.stringify({ stealthMode }),
    });
  },

  appendMeetingTranscript(
    meetingId: string,
    payload: { speaker?: string; content: string }
  ) {
    return request<{ transcript: MeetingTranscriptItem }>(`/meetings/${meetingId}/transcript`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  stopMeeting(meetingId: string) {
    return request<{ meeting: MeetingItem }>(`/meetings/${meetingId}/stop`, {
      method: "POST",
    });
  },

  deleteMeeting(meetingId: string) {
    return request<{ deleted: boolean; id: string }>(`/meetings/${meetingId}`, {
      method: "DELETE",
    });
  },

  // Phase 9: Personal Memory & Context
  listMemories(category?: string) {
    const suffix = category ? `?category=${encodeURIComponent(category)}` : "";
    return request<{ memories: MemoryItem[] }>(`/memory${suffix}`, { method: "GET" });
  },

  createMemory(payload: {
    category: "preference" | "project" | "fact" | "contact" | "workflow";
    title: string;
    content: string;
    tags?: string[];
  }) {
    return request<{ memory: MemoryItem }>("/memory", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  deleteMemory(memoryId: string) {
    return request<{ deleted: boolean; id: string }>(`/memory/${memoryId}`, {
      method: "DELETE",
    });
  },

  searchMemories(query: string, limit = 10) {
    return request<{ query: string; results: MemoryItem[] }>("/memory/search", {
      method: "POST",
      body: JSON.stringify({ query, limit }),
    });
  },

  // AI Chat Engine Configuration (OpenAI, Gemini, Groq, OpenRouter, DeepSeek, Custom)
  getAiConfig() {
    return request<{
      config: {
        provider: string;
        model: string;
        baseUrl: string;
        connected: boolean;
        hasUserKey: boolean;
        maskedKey: string;
      };
    }>("/ai/config", { method: "GET" });
  },

  updateAiConfig(payload: {
    provider?: string;
    model?: string;
    baseUrl?: string;
    apiKey?: string;
  }) {
    return request<{
      config: {
        provider: string;
        model: string;
        baseUrl: string;
        connected: boolean;
        hasUserKey: boolean;
        maskedKey: string;
      };
    }>("/ai/config", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
};
