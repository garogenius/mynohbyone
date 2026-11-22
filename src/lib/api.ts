import { tokenStorage } from "./storage";
import type {
  ApiErrorDetail,
  ApiErrorResponse,
  ApiSuccessResponse,
  AuthTokensPayload,
  Conversation,
  Device,
  DevicePlatform,
  HealthData,
  InterpretationResult,
  Message,
  SendMessageResponseData,
  User,
} from "../types/api";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1"
).replace(/\/$/, "");

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
};
