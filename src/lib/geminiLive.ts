import { API_BASE_URL } from "./api";
import { tokenStorage } from "./storage";

export type LiveOrbState = "idle" | "listening" | "processing" | "speaking";

export interface GeminiLiveHandle {
  sendText: (text: string) => void;
  interrupt: () => void;
  close: () => void;
}

function getLiveWsUrl(): string {
  return API_BASE_URL.replace(/^http/i, "ws") + "/voice/live";
}

function float32ToBase64Pcm16(input: Float32Array): string {
  const buf = new ArrayBuffer(input.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(b64: string): Float32Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const samples = len / 2;
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

/**
 * Connects to Nohby ONE's /api/v1/voice/live Gemini Live Audio WebSocket bridge.
 * Streams 16kHz PCM microphone audio in, plays 24kHz PCM audio out, and clears
 * the playback queue immediately on user barge-in interruption.
 */
export async function connectGeminiLiveVoice(options: {
  onState: (state: LiveOrbState) => void;
  onError: (message: string) => void;
  onReady?: (info: { model: string; voice: string; language: string }) => void;
}): Promise<GeminiLiveHandle> {
  const { accessToken } = tokenStorage.getSession();
  if (!accessToken) {
    throw new Error("Sign in to start a Gemini Live Audio session.");
  }

  const ws = new WebSocket(getLiveWsUrl());
  const playbackCtx = new AudioContext({ sampleRate: 24000 });
  let nextPlayTime = playbackCtx.currentTime;
  const activeSources: AudioBufferSourceNode[] = [];

  let micStream: MediaStream | null = null;
  let micCtx: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;

  const clearPlaybackQueue = () => {
    while (activeSources.length > 0) {
      const src = activeSources.pop();
      try {
        src?.stop();
      } catch {
        // Ignore already stopped
      }
    }
    nextPlayTime = playbackCtx.currentTime;
  };

  const cleanup = () => {
    clearPlaybackQueue();
    try {
      processor?.disconnect();
    } catch {}
    micStream?.getTracks().forEach((t) => t.stop());
    micCtx?.close().catch(() => {});
    playbackCtx.close().catch(() => {});
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
    options.onState("idle");
  };

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "auth", token: accessToken }));
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(String(event.data));
      if (msg.type === "ready") {
        options.onReady?.({ model: msg.model, voice: msg.voice, language: msg.language });
        options.onState("listening");

        // Start 16kHz PCM microphone streaming
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
        });
        micCtx = new AudioContext({ sampleRate: 16000 });
        const source = micCtx.createMediaStreamSource(micStream);
        processor = micCtx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const pcm = e.inputBuffer.getChannelData(0);
          ws.send(JSON.stringify({ type: "audio", data: float32ToBase64Pcm16(pcm) }));
        };
        source.connect(processor);
        processor.connect(micCtx.destination);
      } else if (msg.type === "audio" && msg.data) {
        options.onState("speaking");
        const floats = base64Pcm16ToFloat32(msg.data);
        const audioBuf = playbackCtx.createBuffer(1, floats.length, msg.sampleRate || 24000);
        audioBuf.getChannelData(0).set(floats);
        const src = playbackCtx.createBufferSource();
        src.buffer = audioBuf;
        src.connect(playbackCtx.destination);
        const startAt = Math.max(nextPlayTime, playbackCtx.currentTime);
        src.start(startAt);
        nextPlayTime = startAt + audioBuf.duration;
        activeSources.push(src);
        src.onended = () => {
          const idx = activeSources.indexOf(src);
          if (idx >= 0) activeSources.splice(idx, 1);
          if (activeSources.length === 0) {
            options.onState("listening");
          }
        };
      } else if (msg.type === "interrupted") {
        // Immediate barge-in queue flush
        clearPlaybackQueue();
        options.onState("listening");
      } else if (msg.type === "state" && msg.state) {
        options.onState(msg.state as LiveOrbState);
      } else if (msg.type === "error") {
        options.onError(msg.message || "Live voice session error.");
        cleanup();
      }
    } catch {
      // Ignore malformed frames
    }
  };

  ws.onerror = () => {
    options.onError("Unable to reach Gemini Live Voice bridge.");
    cleanup();
  };

  ws.onclose = () => {
    options.onState("idle");
  };

  return {
    sendText: (text: string) => {
      if (ws.readyState === WebSocket.OPEN && text.trim()) {
        ws.send(JSON.stringify({ type: "text", text: text.trim() }));
      }
    },
    interrupt: () => {
      clearPlaybackQueue();
      options.onState("listening");
    },
    close: cleanup,
  };
}
