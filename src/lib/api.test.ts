import { beforeEach, describe, expect, it } from "vitest";

import { apiClient } from "./api";
import { tokenStorage } from "./storage";

const memoryStore = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => memoryStore.get(k) ?? null,
    setItem: (k: string, v: string) => memoryStore.set(k, v),
    removeItem: (k: string) => memoryStore.delete(k),
    clear: () => memoryStore.clear(),
  },
  configurable: true,
});

describe("Nohby ONE Frontend -> Backend E2E Integration (Phase 0, 1 & 2)", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it("completes auth, device lifecycle, conversation streaming/persistence, and logout", async () => {
    const health = await apiClient.health();
    expect(health.success).toBe(true);
    expect(health.data.status).toBe("healthy");

    const uniqueEmail = `e2e.${Date.now()}@example.com`;
    const reg = await apiClient.register({
      name: "E2E Engineer",
      email: uniqueEmail,
      password: "StrongPassword123!",
    });
    expect(reg.data.user.email).toBe(uniqueEmail);

    const login = await apiClient.login({
      email: uniqueEmail,
      password: "StrongPassword123!",
    });
    tokenStorage.setTokens(login.data.accessToken, login.data.refreshToken);

    const me = await apiClient.getMe();
    expect(me.data.user.email).toBe(uniqueEmail);

    const updated = await apiClient.updateMe({
      displayName: "E2E Display",
      timezone: "Europe/London",
    });
    expect(updated.data.user.profile?.displayName).toBe("E2E Display");

    // Phase 1: Device registration, heartbeat, rename, list
    const deviceRes = await apiClient.registerDevice({
      deviceName: "E2E Windows Machine",
      platform: "windows",
      platformVersion: "Windows 11",
      appVersion: "0.2.0",
      deviceFingerprint: `fp-e2e-${Date.now()}`,
      deviceCapabilities: ["voice", "browser_automation", "local_agent"],
    });
    const deviceId = deviceRes.data.device.id;
    expect(deviceRes.data.device.status).toBe("active");

    const hb = await apiClient.deviceHeartbeat(deviceId, { appVersion: "0.2.0" });
    expect(hb.data.device.lastSeenAt).toBeTruthy();

    const renamed = await apiClient.updateDevice(deviceId, { deviceName: "E2E Renamed Box" });
    expect(renamed.data.device.deviceName).toBe("E2E Renamed Box");

    // Phase 2: Conversations, AI message + proposed execution plan, search, delete
    const convCreated = await apiClient.createConversation({ mode: "general" });
    const convId = convCreated.data.conversation.id;
    expect(convCreated.data.conversation.title).toBe("New Conversation");

    const msgRes = await apiClient.sendMessage(convId, {
      content: "Open Chrome and search for top cloud providers",
      inputType: "text",
      deviceId,
    });
    expect(msgRes.data.executionRequired).toBe(true);
    expect(msgRes.data.interpretation.intent).toBe("web_research");
    expect(msgRes.data.assistantMessage.role).toBe("assistant");

    const convDetail = await apiClient.getConversation(convId);
    expect(convDetail.data.messages.length).toBe(2);

    const interp = await apiClient.interpretInstruction({
      instruction: "Send email to ceo@example.com about launch",
    });
    expect(interp.data.riskLevel).toBe("high");

    const convUpdated = await apiClient.updateConversation(convId, { title: "Cloud Research" });
    expect(convUpdated.data.conversation.title).toBe("Cloud Research");

    const convDeleted = await apiClient.deleteConversation(convId);
    expect(convDeleted.data.deleted).toBe(true);

    // Phase 3: Voice settings, speech synthesis & audio transcription
    const voiceDefaults = await apiClient.getVoiceSettings();
    expect(voiceDefaults.data.settings.wakeWordPhrase).toBe("Hey Nohby");

    const voiceUpdated = await apiClient.updateVoiceSettings({
      wakeWordEnabled: true,
      wakeWordPhrase: "Hey Nohby",
      ttsRate: 1.15,
      autoSpeakResponses: true,
    });
    expect(voiceUpdated.data.settings.wakeWordEnabled).toBe(true);
    expect(voiceUpdated.data.settings.ttsRate).toBe(1.15);

    const speechRes = await apiClient.synthesizeSpeech({
      text: "Nohby ONE Phase 3 verified.",
      rate: 1.1,
    });
    expect(["local_tts", "cloud_audio"]).toContain(speechRes.data.speech.strategy);

    const audioBlob = new Blob(["fake-webm-audio-bytes"], { type: "audio/webm" });
    const txRes = await apiClient.transcribeAudio({
      file: audioBlob,
      filename: "test.webm",
      language: "en-US",
      transcriptHint: "Hey Nohby, check my tasks",
    });
    expect(txRes.data.transcription.text).toBe("Hey Nohby, check my tasks");

    // Phase 4: Permissions, high-risk task creation, scoped approval, pause/resume/cancel
    const permRes = await apiClient.grantPermission({
      deviceId,
      resource: "browser",
      actions: ["open", "search"],
    });
    expect(permRes.data.permission.active).toBe(true);

    const taskRes = await apiClient.createTask({
      instruction: "Send email to team@example.com with weekly status",
      deviceId,
    });
    const taskId = taskRes.data.task.id;
    expect(taskRes.data.task.status).toBe("awaiting_approval");
    expect(taskRes.data.task.approvals.length).toBe(1);

    const pendingApps = await apiClient.listPendingApprovals();
    expect(pendingApps.data.approvals.some((a) => a.taskId === taskId)).toBe(true);

    const app = taskRes.data.task.approvals[0];
    const approved = await apiClient.approveAction(app.id, app.actionFingerprint);
    expect(approved.data.task.status).toBe("queued");

    const paused = await apiClient.pauseTask(taskId);
    expect(paused.data.task.status).toBe("paused");

    const resumed = await apiClient.resumeTask(taskId);
    expect(resumed.data.task.status).toBe("queued");

    const cancelled = await apiClient.cancelTask(taskId);
    expect(cancelled.data.task.status).toBe("cancelled");

    const permRevoked = await apiClient.revokePermission(permRes.data.permission.id);
    expect(permRevoked.data.permission.active).toBe(false);

    // Revoke device & logout
    const revoked = await apiClient.revokeDevice(deviceId);
    expect(revoked.data.device.status).toBe("revoked");

    const out = await apiClient.logout(tokenStorage.getSession().refreshToken);
    expect(out.data.revokedSessions).toBe(1);
  });
});
