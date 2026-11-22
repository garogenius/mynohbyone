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

export interface ProposedStep {
  step: number;
  tool: string;
  description: string;
  requiresApproval: boolean;
}

export interface ClientAction {
  [key: string]: unknown;
  type: "open_url" | "navigate_route" | "set_theme" | "memory_saved" | string;
  url?: string;
  route?: string;
  theme?: "light" | "dark" | "system";
  label?: string;
  content?: string;
  provider?: string;
  tool?: string;
  recipient?: string;
  subject?: string;
  taskId?: string;
  approvalId?: string;
  stepId?: string;
  directUrl?: string;
}

export interface InterpretationResult {
  intent: string;
  requiresExecution: boolean;
  riskLevel: "low" | "medium" | "high" | string;
  missingInformation: string[];
  proposedPlan: ProposedStep[];
  clientAction?: ClientAction | null;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  conversationType: string;
  status: "active" | "archived" | string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  messageCount?: number | null;
  lastMessagePreview?: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  userId: string;
  role: "user" | "assistant" | "system" | string;
  content: string;
  inputType: "text" | "voice" | string;
  attachments: Record<string, unknown>[];
  modelProvider: string | null;
  modelName: string | null;
  tokenUsage: Record<string, unknown>;
  createdAt: string;
}

export interface SendMessageResponseData {
  messageId: string;
  assistantMessageId: string;
  conversationId: string;
  conversationTitle: string;
  userMessage: Message;
  assistantMessage: Message;
  executionRequired: boolean;
  interpretation: InterpretationResult;
  clientAction?: ClientAction | null;
  autoExecute?: boolean;
  taskId?: string | null;
}

export type VoicePersonaId =
  | "default"
  | "female"
  | "male"
  | "girl"
  | "boy"
  | "young_woman"
  | "young_man"
  | "calm_female"
  | "deep_male";

export interface VoiceSettings {
  voiceEnabled: boolean;
  wakeWordEnabled: boolean;
  wakeWordPhrase: string;
  sttStrategy: "local" | "cloud";
  ttsStrategy: "local" | "cloud";
  ttsVoice: string;
  voiceType?: VoicePersonaId;
  ttsPitch?: number;
  ttsRate: number;
  autoSpeakResponses: boolean;
  inputLanguage: string;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  provider: string;
  sizeBytes: number;
  requiresLocalEngine?: boolean;
}

export interface SpeechSynthesisResult {
  strategy: "local_tts" | "cloud_audio";
  provider: string;
  text?: string;
  mimeType?: string;
  audioBase64?: string;
  voice: string;
  voiceType?: string;
  pitch?: number;
  rate: number;
  language: string;
}

export interface TaskStep {
  id: string;
  taskId: string;
  sequenceNumber: number;
  toolName: string;
  action: string;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown> | null;
  status: string;
  requiresApproval: boolean;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TaskEvent {
  id: string;
  taskId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  createdAt: string;
}

export interface Approval {
  id: string;
  userId: string;
  taskId: string;
  taskStepId: string;
  actionFingerprint: string;
  actionDetails: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "expired" | string;
  expiresAt: string;
  decidedAt: string | null;
  createdAt: string;
}

export interface Permission {
  id: string;
  userId: string;
  deviceId: string | null;
  resource: string;
  actions: string[];
  constraints: Record<string, unknown>;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  active: boolean;
}

export interface Task {
  id: string;
  userId: string;
  deviceId: string | null;
  conversationId: string | null;
  instruction: string;
  taskType: string;
  status: string;
  riskLevel: "low" | "medium" | "high" | string;
  executionPlan: Record<string, unknown>[];
  result: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  steps: TaskStep[];
  approvals: Approval[];
}

export interface ToolDefinition {
  name: string;
  resource: string;
  action: string;
  riskLevel: "low" | "medium" | "high" | string;
  executionTarget: "local_agent" | "cloud_backend" | string;
  requiredCapability: string;
  requiresApproval: boolean;
  description: string;
}

export interface AgentRegistrationInfo {
  deviceId: string;
  deviceName: string;
  platform: string;
  agentVersion: string;
  capabilities: string[];
  status: string;
}

export interface FileItem {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  processingStatus: string;
  metadata: Record<string, unknown>;
  summary: string | null;
  indexingStatus: string;
  chunkCount: number;
  createdAt: string;
  extractedText?: string;
}

export interface FileExtractionResult {
  wordCount: number;
  lineCount: number;
  keywords: string[];
  headings: string[];
  actionItems: string[];
  emails: string[];
  urls: string[];
  dates: string[];
  promptMatches: string[];
}

export interface KnowledgeSearchMatch {
  chunkId: string;
  fileId: string;
  filename: string;
  chunkIndex: number;
  score: number;
  excerpt: string;
}

export interface IntegrationProviderSpec {
  provider: string;
  displayName: string;
  category: "email" | "meetings" | "social" | "calendar" | "plugins" | string;
  description: string;
  defaultScopes: string[];
  authType: string;
  accountPlaceholder: string;
}

export interface IntegrationItem {
  id: string;
  userId: string;
  provider: string;
  category: string;
  displayName: string;
  accountLabel: string | null;
  grantedScopes: string[];
  status: "connected" | "disconnected" | string;
  connectedAt: string;
  lastSyncedAt: string | null;
  disconnectedAt: string | null;
}

export interface MeetingTranscriptItem {
  id: string;
  speaker: string;
  content: string;
  aiHint: string | null;
  createdAt: string;
}

export interface MeetingItem {
  id: string;
  userId: string;
  title: string;
  meetingType: "interview" | "meeting" | "standup" | "client_call" | string;
  provider: string;
  status: "scheduled" | "listening" | "completed" | string;
  stealthMode: boolean;
  consentStatus: string;
  summary: string | null;
  actionItems: string[];
  transcriptCount: number;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  transcripts?: MeetingTranscriptItem[];
}

export interface MemoryItem {
  id: string;
  userId: string;
  category: "preference" | "project" | "fact" | "contact" | "workflow" | string;
  title: string;
  content: string;
  tags: string[];
  source: string;
  userConfirmed: boolean;
  createdAt: string;
  updatedAt: string;
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
