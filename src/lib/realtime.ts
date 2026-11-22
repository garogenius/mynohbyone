import { API_BASE_URL } from "./api";
import { tokenStorage } from "./storage";
import type { InterpretationResult, Message } from "../types/api";

export interface RealtimeHandlers {
  onStatusChange?: (status: "connecting" | "connected" | "disconnected") => void;
  onMessageDelta?: (payload: { conversationId: string; delta: string }) => void;
  onMessageCompleted?: (payload: {
    conversationId: string;
    conversationTitle?: string;
    message: Message;
    interpretation?: InterpretationResult;
  }) => void;
  onError?: (payload: { code: string; message: string }) => void;
}

function getWsUrl(): string {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  return `${wsBase}/realtime`;
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private handlers: RealtimeHandlers;
  private shouldReconnect = false;
  private reconnectTimer: number | null = null;
  private connected = false;

  constructor(handlers: RealtimeHandlers) {
    this.handlers = handlers;
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    const { accessToken } = tokenStorage.getSession();
    if (!accessToken) return;

    this.shouldReconnect = true;
    this.cleanupSocket();
    this.handlers.onStatusChange?.("connecting");

    const ws = new WebSocket(getWsUrl());
    this.ws = ws;

    ws.onopen = () => {
      const latestToken = tokenStorage.getSession().accessToken;
      if (!latestToken) {
        ws.close();
        return;
      }
      ws.send(JSON.stringify({ event: "auth", data: { token: latestToken } }));
    };

    ws.onmessage = (evt) => {
      try {
        const frame = JSON.parse(evt.data as string) as {
          event: string;
          data: Record<string, unknown>;
        };

        if (frame.event === "connection.ready") {
          this.connected = true;
          this.handlers.onStatusChange?.("connected");
          return;
        }

        if (frame.event === "message.delta") {
          this.handlers.onMessageDelta?.(
            frame.data as { conversationId: string; delta: string }
          );
          return;
        }

        if (frame.event === "message.completed") {
          this.handlers.onMessageCompleted?.(
            frame.data as {
              conversationId: string;
              conversationTitle?: string;
              message: Message;
              interpretation?: InterpretationResult;
            }
          );
          return;
        }

        if (frame.event === "error") {
          this.handlers.onError?.(frame.data as { code: string; message: string });
        }
      } catch {
        // Ignore malformed frame
      }
    };

    ws.onclose = () => {
      this.connected = false;
      this.handlers.onStatusChange?.("disconnected");
      if (this.shouldReconnect) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  sendConversationMessage(conversationId: string, content: string, inputType: "text" | "voice" = "text"): boolean {
    if (!this.isConnected() || !this.ws) return false;
    this.ws.send(
      JSON.stringify({
        event: "conversation.message",
        data: { conversationId, content, inputType },
      })
    );
    return true;
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanupSocket();
  }

  private cleanupSocket(): void {
    this.connected = false;
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}
