import { beforeEach, describe, expect, it } from "vitest";

import { apiClient } from "./api";
import { tokenStorage } from "./storage";

// Simple in-memory localStorage polyfill for Node Vitest environment
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

describe("Nohby ONE Frontend -> Backend E2E Integration (Phase 0 & 1)", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  it("completes health, register, login, profile update, device register/heartbeat/rename/revoke, and logout", async () => {
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

    const deviceRes = await apiClient.registerDevice({
      deviceName: "E2E Windows Machine",
      platform: "windows",
      platformVersion: "Windows 11",
      appVersion: "0.1.0",
      deviceFingerprint: `fp-e2e-${Date.now()}`,
      deviceCapabilities: ["voice", "browser_automation", "local_agent"],
    });
    const deviceId = deviceRes.data.device.id;
    expect(deviceRes.data.device.status).toBe("active");

    const hb = await apiClient.deviceHeartbeat(deviceId, { appVersion: "0.1.0" });
    expect(hb.data.device.lastSeenAt).toBeTruthy();

    const renamed = await apiClient.updateDevice(deviceId, { deviceName: "E2E Renamed Box" });
    expect(renamed.data.device.deviceName).toBe("E2E Renamed Box");

    const list = await apiClient.listDevices();
    expect(list.data.devices.some((d) => d.id === deviceId)).toBe(true);

    const revoked = await apiClient.revokeDevice(deviceId);
    expect(revoked.data.device.status).toBe("revoked");

    const out = await apiClient.logout(tokenStorage.getSession().refreshToken);
    expect(out.data.revokedSessions).toBe(1);
  });
});
