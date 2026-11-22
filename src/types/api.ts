export interface ApiMeta {
  requestId: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta: ApiMeta;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error: {
    code: string;
    details: ApiErrorDetail[];
  };
  meta: ApiMeta;
}

export interface UserProfile {
  displayName: string | null;
  avatarUrl: string | null;
  timezone: string | null;
  locale: string | null;
  preferredLanguage: string | null;
  professionalProfile: Record<string, unknown>;
}

export interface User {
  id: string;
  name: string;
  email: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  profile: UserProfile | null;
}

export interface AuthTokensPayload {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export type DevicePlatform = "windows" | "macos" | "linux" | "web";

export interface Device {
  id: string;
  userId: string;
  deviceName: string;
  platform: DevicePlatform | string;
  platformVersion: string | null;
  appVersion: string;
  capabilities: string[];
  status: "active" | "revoked" | string;
  lastSeenAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface HealthData {
  status: "healthy" | "degraded";
  version: string;
  environment: string;
  services: {
    database: string;
  };
}

export type NavRoute =
  | "home"
  | "assistant"
  | "tasks"
  | "meetings"
  | "integrations"
  | "files"
  | "memory"
  | "devices"
  | "settings";
