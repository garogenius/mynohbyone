const KEYS = {
  accessToken: "nohbyone.access_token",
  refreshToken: "nohbyone.refresh_token",
  deviceId: "nohbyone.device_id",
  deviceFingerprint: "nohbyone.device_fingerprint",
} as const;

export interface StoredSession {
  accessToken: string | null;
  refreshToken: string | null;
  deviceId: string | null;
}

export const tokenStorage = {
  getSession(): StoredSession {
    return {
      accessToken: localStorage.getItem(KEYS.accessToken),
      refreshToken: localStorage.getItem(KEYS.refreshToken),
      deviceId: localStorage.getItem(KEYS.deviceId),
    };
  },

  setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(KEYS.accessToken, accessToken);
    localStorage.setItem(KEYS.refreshToken, refreshToken);
  },

  setDeviceId(deviceId: string | null): void {
    if (deviceId) {
      localStorage.setItem(KEYS.deviceId, deviceId);
    } else {
      localStorage.removeItem(KEYS.deviceId);
    }
  },

  clearSession(): void {
    localStorage.removeItem(KEYS.accessToken);
    localStorage.removeItem(KEYS.refreshToken);
  },

  getOrCreateFingerprint(): string {
    const existing = localStorage.getItem(KEYS.deviceFingerprint);
    if (existing) return existing;
    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `nohby-fp-${crypto.randomUUID()}`
        : `nohby-fp-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(KEYS.deviceFingerprint, generated);
    return generated;
  },
};
