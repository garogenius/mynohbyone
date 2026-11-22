import { create } from "zustand";

import { ApiError, apiClient } from "../lib/api";
import { getLocalDeviceIdentity } from "../lib/device";
import { tokenStorage } from "../lib/storage";
import type {
  Device,
  DevicePlatform,
  HealthData,
  NavRoute,
  User,
  VoiceSettings,
} from "../types/api";

export type AppPhase =
  | "booting"
  | "offline"
  | "unauthenticated"
  | "onboarding_device"
  | "ready";

interface AppState {
  phase: AppPhase;
  bootMessage: string;
  activeRoute: NavRoute;
  health: HealthData | null;
  user: User | null;
  devices: Device[];
  currentDeviceId: string | null;
  voiceSettings: VoiceSettings | null;
  micActive: boolean;
  isSpeaking: boolean;
  busy: boolean;
  error: string | null;
  toast: { type: "success" | "error" | "info"; message: string } | null;

  setRoute: (route: NavRoute) => void;
  setMicActive: (active: boolean) => void;
  setIsSpeaking: (speaking: boolean) => void;
  clearError: () => void;
  showToast: (type: "success" | "error" | "info", message: string) => void;
  clearToast: () => void;

  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (payload: {
    name?: string;
    displayName?: string;
    timezone?: string;
    locale?: string;
    preferredLanguage?: string;
  }) => Promise<void>;

  loadVoiceSettings: () => Promise<void>;
  updateVoiceSettings: (payload: Partial<VoiceSettings>) => Promise<void>;

  registerCurrentDevice: (custom?: {
    deviceName?: string;
    platform?: DevicePlatform;
    deviceCapabilities?: string[];
  }) => Promise<void>;
  refreshDevices: () => Promise<void>;
  sendHeartbeat: (deviceId: string) => Promise<void>;
  renameDevice: (deviceId: string, deviceName: string) => Promise<void>;
  revokeDevice: (deviceId: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  phase: "booting",
  bootMessage: "Initialising Nohby ONE local runtime...",
  activeRoute: "home",
  health: null,
  user: null,
  devices: [],
  currentDeviceId: tokenStorage.getSession().deviceId,
  voiceSettings: null,
  micActive: false,
  isSpeaking: false,
  busy: false,
  error: null,
  toast: null,

  setRoute: (route) => set({ activeRoute: route }),
  setMicActive: (micActive) => set({ micActive }),
  setIsSpeaking: (isSpeaking) => set({ isSpeaking }),
  clearError: () => set({ error: null }),
  showToast: (type, message) => {
    set({ toast: { type, message } });
    setTimeout(() => {
      if (get().toast?.message === message) {
        set({ toast: null });
      }
    }, 4500);
  },
  clearToast: () => set({ toast: null }),

  bootstrap: async () => {
    set({ phase: "booting", bootMessage: "Connecting to Nohby ONE backend...", error: null });

    try {
      const healthRes = await apiClient.health();
      set({ health: healthRes.data });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Backend service is unreachable.";
      set({ phase: "offline", error: message });
      return;
    }

    const session = tokenStorage.getSession();
    if (!session.accessToken && !session.refreshToken) {
      set({ phase: "unauthenticated", user: null, devices: [], voiceSettings: null });
      return;
    }

    set({ bootMessage: "Restoring authenticated session..." });
    try {
      const [meRes, devicesRes, voiceRes] = await Promise.all([
        apiClient.getMe(),
        apiClient.listDevices(),
        apiClient.getVoiceSettings().catch(() => null),
      ]);

      const activeDevices = devicesRes.data.devices.filter((d) => d.status === "active");
      const savedId = tokenStorage.getSession().deviceId;
      const matchedDevice = activeDevices.find((d) => d.id === savedId);

      if (!matchedDevice) {
        tokenStorage.setDeviceId(null);
      }

      set({
        user: meRes.data.user,
        devices: devicesRes.data.devices,
        voiceSettings: voiceRes?.data.settings ?? null,
        currentDeviceId: matchedDevice ? matchedDevice.id : null,
        phase: matchedDevice ? "ready" : "onboarding_device",
      });
    } catch {
      tokenStorage.clearSession();
      set({ phase: "unauthenticated", user: null, devices: [], voiceSettings: null });
    }
  },

  login: async (email, password) => {
    set({ busy: true, error: null });
    try {
      const res = await apiClient.login({ email, password });
      tokenStorage.setTokens(res.data.accessToken, res.data.refreshToken);

      const devicesRes = await apiClient.listDevices();
      const savedId = tokenStorage.getSession().deviceId;
      const activeMatch = devicesRes.data.devices.find(
        (d) => d.id === savedId && d.status === "active"
      );

      set({
        user: res.data.user,
        devices: devicesRes.data.devices,
        currentDeviceId: activeMatch ? activeMatch.id : null,
        phase: activeMatch ? "ready" : "onboarding_device",
        busy: false,
      });
      get().showToast("success", `Welcome back, ${res.data.user.name}.`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Login failed.";
      set({ busy: false, error: message });
      throw err;
    }
  },

  register: async (name, email, password) => {
    set({ busy: true, error: null });
    try {
      await apiClient.register({ name, email, password });
      const loginRes = await apiClient.login({ email, password });
      tokenStorage.setTokens(loginRes.data.accessToken, loginRes.data.refreshToken);

      set({
        user: loginRes.data.user,
        devices: [],
        currentDeviceId: null,
        phase: "onboarding_device",
        busy: false,
      });
      get().showToast("success", "Account created. Register this device to continue.");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.details.length > 0
            ? err.details.map((d) => d.message).join(" ")
            : err.message
          : "Registration failed.";
      set({ busy: false, error: message });
      throw err;
    }
  },

  logout: async () => {
    set({ busy: true });
    try {
      const { refreshToken } = tokenStorage.getSession();
      await apiClient.logout(refreshToken);
    } catch {
      // Proceed with local cleanup even if token already expired
    } finally {
      tokenStorage.clearSession();
      set({
        user: null,
        devices: [],
        phase: "unauthenticated",
        activeRoute: "home",
        busy: false,
        error: null,
      });
      get().showToast("info", "Signed out securely.");
    }
  },

  updateProfile: async (payload) => {
    set({ busy: true, error: null });
    try {
      const res = await apiClient.updateMe(payload);
      set({ user: res.data.user, busy: false });
      get().showToast("success", "Account profile updated.");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to update profile.";
      set({ busy: false, error: message });
      throw err;
    }
  },

  loadVoiceSettings: async () => {
    try {
      const res = await apiClient.getVoiceSettings();
      set({ voiceSettings: res.data.settings });
    } catch {
      // Non-fatal
    }
  },

  updateVoiceSettings: async (payload) => {
    set({ busy: true, error: null });
    try {
      const res = await apiClient.updateVoiceSettings(payload);
      set({ voiceSettings: res.data.settings, busy: false });
      get().showToast("success", "Voice preferences saved.");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to save voice settings.";
      set({ busy: false, error: message });
      throw err;
    }
  },

  registerCurrentDevice: async (custom) => {
    set({ busy: true, error: null });
    try {
      const identity = await getLocalDeviceIdentity();
      const res = await apiClient.registerDevice({
        deviceName: custom?.deviceName?.trim() || identity.deviceName,
        platform: custom?.platform || identity.platform,
        platformVersion: identity.platformVersion,
        appVersion: identity.appVersion,
        deviceFingerprint: identity.deviceFingerprint,
        deviceCapabilities: custom?.deviceCapabilities || identity.deviceCapabilities,
      });

      const device = res.data.device;
      tokenStorage.setDeviceId(device.id);
      const listRes = await apiClient.listDevices();

      set({
        currentDeviceId: device.id,
        devices: listRes.data.devices,
        phase: "ready",
        busy: false,
      });
      get().showToast("success", `${device.deviceName} registered and active.`);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to register device.";
      set({ busy: false, error: message });
      throw err;
    }
  },

  refreshDevices: async () => {
    set({ busy: true, error: null });
    try {
      const listRes = await apiClient.listDevices();
      set({ devices: listRes.data.devices, busy: false });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to load devices.";
      set({ busy: false, error: message });
    }
  },

  sendHeartbeat: async (deviceId) => {
    try {
      const res = await apiClient.deviceHeartbeat(deviceId, {
        appVersion: import.meta.env.VITE_APP_VERSION || "0.1.0",
      });
      set((state) => ({
        devices: state.devices.map((d) => (d.id === deviceId ? res.data.device : d)),
      }));
      get().showToast("success", `Heartbeat verified for ${res.data.device.deviceName}.`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Heartbeat failed.";
      get().showToast("error", message);
    }
  },

  renameDevice: async (deviceId, deviceName) => {
    try {
      const res = await apiClient.updateDevice(deviceId, { deviceName });
      set((state) => ({
        devices: state.devices.map((d) => (d.id === deviceId ? res.data.device : d)),
      }));
      get().showToast("success", "Device name updated.");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to rename device.";
      get().showToast("error", message);
    }
  },

  revokeDevice: async (deviceId) => {
    set({ busy: true, error: null });
    try {
      const res = await apiClient.revokeDevice(deviceId);
      const isCurrent = get().currentDeviceId === deviceId;

      if (isCurrent) {
        tokenStorage.setDeviceId(null);
      }

      set((state) => ({
        devices: state.devices.map((d) => (d.id === deviceId ? res.data.device : d)),
        currentDeviceId: isCurrent ? null : state.currentDeviceId,
        phase: isCurrent ? "onboarding_device" : state.phase,
        busy: false,
      }));
      get().showToast(
        "info",
        isCurrent
          ? "This device was revoked. Re-register a device to resume local execution."
          : `${res.data.device.deviceName} revoked.`
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to revoke device.";
      set({ busy: false, error: message });
      get().showToast("error", message);
    }
  },
}));
