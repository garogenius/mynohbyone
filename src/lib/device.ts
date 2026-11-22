import { tokenStorage } from "./storage";
import type { DevicePlatform } from "../types/api";

export interface LocalDeviceIdentity {
  deviceName: string;
  platform: DevicePlatform;
  platformVersion: string;
  appVersion: string;
  deviceFingerprint: string;
  deviceCapabilities: string[];
}

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
      };
    };
  }
}

function detectBrowserPlatform(): { platform: DevicePlatform; label: string } {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return { platform: "windows", label: "Windows Desktop" };
  if (ua.includes("mac")) return { platform: "macos", label: "macOS Desktop" };
  if (ua.includes("linux")) return { platform: "linux", label: "Linux Workstation" };
  return { platform: "web", label: "Web Workspace" };
}

export async function getLocalDeviceIdentity(): Promise<LocalDeviceIdentity> {
  const fingerprint = tokenStorage.getOrCreateFingerprint();
  const appVersion = import.meta.env.VITE_APP_VERSION || "0.1.0";

  if (window.__TAURI__?.core?.invoke) {
    try {
      const native = await window.__TAURI__.core.invoke<{
        deviceName: string;
        platform: DevicePlatform;
        platformVersion: string;
        appVersion: string;
        capabilities: string[];
      }>("get_local_device_identity");

      return {
        deviceName: native.deviceName,
        platform: native.platform,
        platformVersion: native.platformVersion,
        appVersion: native.appVersion || appVersion,
        deviceFingerprint: fingerprint,
        deviceCapabilities: native.capabilities,
      };
    } catch {
      // Fallback to browser detection below
    }
  }

  const detected = detectBrowserPlatform();
  return {
    deviceName: `Nohby ONE (${detected.label})`,
    platform: detected.platform,
    platformVersion: navigator.platform || "Desktop Runtime",
    appVersion,
    deviceFingerprint: fingerprint,
    deviceCapabilities: ["voice", "browser_automation", "file_access", "local_agent"],
  };
}
