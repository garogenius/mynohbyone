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

    // Phase 5: Local Agent Protocol (tools, register, heartbeat, next, claim, step events, complete)
    const toolsRes = await apiClient.getAgentTools();
    expect(toolsRes.data.tools.length).toBeGreaterThanOrEqual(10);

    const agentReg = await apiClient.registerAgent({
      deviceId,
      agentVersion: "0.5.0",
      capabilities: ["local_agent", "browser_automation"],
    });
    expect(agentReg.data.agent.status).toBe("ready");

    const agentHb = await apiClient.agentHeartbeat({
      deviceId,
      agentVersion: "0.5.0",
      status: "idle",
    });
    expect(agentHb.data.status).toBe("idle");

    const lowRiskTaskRes = await apiClient.createTask({
      instruction: "Open Chrome and research TypeScript 5.8 release notes",
      deviceId,
    });
    const execTaskId = lowRiskTaskRes.data.task.id;
    expect(lowRiskTaskRes.data.task.status).toBe("queued");

    const nextTask = await apiClient.getNextAgentTask(deviceId);
    expect(nextTask.data.task).toBeTruthy();
    const taskToClaim = nextTask.data.task?.id || execTaskId;

    const claimed = await apiClient.claimAgentTask(taskToClaim, deviceId);
    expect(claimed.data.task.status).toBe("running");

    const firstStep = claimed.data.task.steps[0];
    if (firstStep) {
      await apiClient.reportAgentStepEvent(taskToClaim, {
        deviceId,
        stepId: firstStep.id,
        eventType: "task.step.started",
        message: "Starting local step",
      });
      await apiClient.reportAgentStepEvent(taskToClaim, {
        deviceId,
        stepId: firstStep.id,
        eventType: "task.step.completed",
        message: "Completed local step",
        outputData: { verified: true },
      });
    }

    const completed = await apiClient.completeAgentTask(taskToClaim, {
      deviceId,
      summary: "Verified local agent execution end-to-end.",
      evidence: { runtime: "e2e_test" },
    });
    expect(completed.data.task.status).toBe("completed");
    expect(completed.data.task.result?.executedByDeviceId).toBe(deviceId);

    // Phase 6: File upload, indexing, summarise, extract, knowledge search, delete
    const docBlob = new Blob(
      [
        "# Release Checklist\n- Ship Nohby ONE Phase 6 on 2026-12-20\n- Contact ops@example.com\nhttps://docs.nohby.com/files\n",
      ],
      { type: "text/markdown" }
    );
    const uploadedFile = await apiClient.uploadFile(docBlob, "release-checklist.md");
    const fileId = uploadedFile.data.file.id;
    expect(uploadedFile.data.file.processingStatus).toBe("indexed");
    expect(uploadedFile.data.file.chunkCount).toBeGreaterThanOrEqual(1);

    const listedFiles = await apiClient.listFiles();
    expect(listedFiles.data.files.some((f) => f.id === fileId)).toBe(true);

    const summarised = await apiClient.summariseFile(fileId, "Phase 6");
    expect(summarised.data.summary).toContain("release-checklist.md");

    const extracted = await apiClient.extractFile(fileId, "Release");
    expect(extracted.data.extraction.emails).toContain("ops@example.com");

    const kSearch = await apiClient.searchKnowledge({ query: "Nohby ONE Phase 6" });
    expect(kSearch.data.results.some((r) => r.fileId === fileId)).toBe(true);

    const deletedFile = await apiClient.deleteFile(fileId);
    expect(deletedFile.data.deleted).toBe(true);

    // Phase 7-9: Integrations, Meetings Stealth Mode, and Personal Memory
    const availIntegs = await apiClient.listAvailableIntegrations();
    expect(availIntegs.data.providers.length).toBeGreaterThanOrEqual(12);

    const connInteg = await apiClient.connectIntegration("gmail", {
      accountLabel: "e2e@gmail.com",
    });
    const integId = connInteg.data.integration.id;
    expect(connInteg.data.integration.status).toBe("connected");
    await apiClient.syncIntegration(integId);
    await apiClient.disconnectIntegration(integId);

    const meeting = await apiClient.createMeeting({
      title: "E2E Stealth Interview",
      meetingType: "interview",
      provider: "zoom",
      stealthMode: true,
    });
    const meetingId = meeting.data.meeting.id;
    expect(meeting.data.meeting.stealthMode).toBe(true);
    const seg = await apiClient.appendMeetingTranscript(meetingId, {
      speaker: "Interviewer",
      content: "Tell me about yourself and system design experience.",
    });
    expect(seg.data.transcript.aiHint).toBeTruthy();
    const stoppedM = await apiClient.stopMeeting(meetingId);
    expect(stoppedM.data.meeting.status).toBe("completed");
    await apiClient.deleteMeeting(meetingId);

    const mem = await apiClient.createMemory({
      category: "project",
      title: "Hydra Sync",
      content: "Nohby ONE real-time workspace sync",
      tags: ["Hydra", "Sync"],
    });
    const memSearch = await apiClient.searchMemories("Hydra");
    expect(memSearch.data.results.some((m) => m.id === mem.data.memory.id)).toBe(true);
    await apiClient.deleteMemory(mem.data.memory.id);

    // Revoke device & logout
    const revoked = await apiClient.revokeDevice(deviceId);
    expect(revoked.data.device.status).toBe("revoked");

    const out = await apiClient.logout(tokenStorage.getSession().refreshToken);
    expect(out.data.revokedSessions).toBe(1);
  }, 40000);
});
