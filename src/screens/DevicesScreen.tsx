import { useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

import { ConfirmationDialog, EmptyState, ErrorState, LoadingState } from "../components/StateViews";
import { useAppStore } from "../store/useAppStore";
import type { Device } from "../types/api";

function getNodeRole(platform: string): string {
  const p = platform.toLowerCase();
  if (p === "web") return "Browser Session";
  if (p === "windows" || p === "macos" || p === "linux") return "Desktop Node";
  return "Hardware Node";
}

export function DevicesScreen() {
  const {
    devices,
    currentDeviceId,
    busy,
    error,
    refreshDevices,
    registerCurrentDevice,
    sendHeartbeat,
    revokeDevice,
  } = useAppStore();

  const [pendingRevoke, setPendingRevoke] = useState<Device | null>(null);
  const [pingMap, setPingMap] = useState<Record<string, number>>({});

  const handleConfirmRevoke = async () => {
    if (!pendingRevoke) return;
    await revokeDevice(pendingRevoke.id);
    setPendingRevoke(null);
  };

  const handlePing = async (deviceId: string) => {
    const start = performance.now();
    await sendHeartbeat(deviceId);
    const ms = Math.max(1, Math.round(performance.now() - start));
    setPingMap((prev) => ({ ...prev, [deviceId]: ms }));
  };

  return (
    <div className="w-full space-y-4">
      {/* Header matching Screenshot 3 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">
            Connected Nodes &amp; Audio Hardware
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Multi-device session handoff, wake-word detection, and local agent heartbeat
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => refreshDevices()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#101624] px-3 text-xs font-medium text-zinc-300 transition hover:border-[#00D4FF]/40 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => registerCurrentDevice()}
            className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Sync This Device
          </button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={refreshDevices} />}

      {busy && devices.length === 0 ? (
        <LoadingState message="Loading connected nodes..." />
      ) : devices.length === 0 ? (
        <EmptyState
          title="No connected nodes yet"
          description="Register this machine so Nohby ONE can coordinate local tasks and voice handoff."
          action={
            <button
              type="button"
              onClick={() => registerCurrentDevice()}
              className="btn-ivory rounded-lg px-4 py-2 text-xs"
            >
              Register This Node
            </button>
          }
        />
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {devices.map((device) => {
            const isCurrent = device.id === currentDeviceId;
            const isOnline = device.status === "active";
            const measuredPing = pingMap[device.id];

            return (
              <div
                key={device.id}
                className={`rounded-2xl border p-4 transition ${
                  isCurrent
                    ? "border-[#00D4FF]/45 bg-[#101624]"
                    : "border-white/[0.08] bg-[#101624] hover:border-white/[0.16]"
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-zinc-400">{getNodeRole(device.platform)}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 font-medium ${
                        isOnline ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isOnline ? "bg-emerald-400" : "bg-amber-400"
                        }`}
                      />
                      {isOnline ? "Online" : "Revoked"}
                    </span>
                    {isOnline && (
                      <button
                        type="button"
                        onClick={() => setPendingRevoke(device)}
                        className="rounded p-1 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400"
                        title="Revoke node"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                <h3 className="mt-2 truncate text-sm font-semibold text-white">
                  {device.deviceName}
                </h3>

                <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                  {measuredPing ? `Ping: ${measuredPing}ms` : `${device.platform} · v${device.appVersion}`}
                </p>

                <button
                  type="button"
                  disabled={!isOnline || busy}
                  onClick={() => handlePing(device.id)}
                  className={`mt-3.5 flex h-9 w-full items-center justify-center rounded-lg border text-xs font-medium transition ${
                    isCurrent
                      ? "border-[#00D4FF]/45 bg-[#00D4FF]/15 text-[#00D4FF] hover:bg-[#00D4FF]/25"
                      : "border-white/[0.08] bg-[#161E30] text-zinc-200 hover:border-[#00D4FF]/40 hover:text-white"
                  } disabled:opacity-40`}
                >
                  {isCurrent ? "Active Voice Node" : "Handoff Session Here"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmationDialog
        open={pendingRevoke !== null}
        title="Revoke node access?"
        description={
          pendingRevoke
            ? `Revoking "${pendingRevoke.deviceName}" immediately terminates its active sessions.`
            : ""
        }
        confirmLabel="Revoke Node"
        destructive
        busy={busy}
        onConfirm={handleConfirmRevoke}
        onCancel={() => setPendingRevoke(null)}
      />
    </div>
  );
}
