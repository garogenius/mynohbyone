import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

import { DeviceCard } from "../components/DeviceCard";
import { ConfirmationDialog, EmptyState, ErrorState, LoadingState } from "../components/StateViews";
import { useAppStore } from "../store/useAppStore";
import type { Device } from "../types/api";

export function DevicesScreen() {
  const {
    devices,
    currentDeviceId,
    busy,
    error,
    refreshDevices,
    registerCurrentDevice,
    sendHeartbeat,
    renameDevice,
    revokeDevice,
  } = useAppStore();

  const [pendingRevoke, setPendingRevoke] = useState<Device | null>(null);

  const handleConfirmRevoke = async () => {
    if (!pendingRevoke) return;
    await revokeDevice(pendingRevoke.id);
    setPendingRevoke(null);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Authorised Desktop Devices</h2>
          <p className="text-xs text-slate-400">
            Manage registered local agents. Revoking a device immediately terminates its active
            sessions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => refreshDevices()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => registerCurrentDevice()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Sync This Device
          </button>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={refreshDevices} />}

      {busy && devices.length === 0 ? (
        <LoadingState message="Loading registered devices..." />
      ) : devices.length === 0 ? (
        <EmptyState
          title="No registered devices yet"
          description="Register this desktop machine so Nohby ONE can coordinate local tasks safely."
          action={
            <button
              type="button"
              onClick={() => registerCurrentDevice()}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              Register This Device
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              isCurrent={device.id === currentDeviceId}
              onHeartbeat={sendHeartbeat}
              onRename={renameDevice}
              onRevoke={setPendingRevoke}
            />
          ))}
        </div>
      )}

      <ConfirmationDialog
        open={pendingRevoke !== null}
        title="Revoke device access?"
        description={
          pendingRevoke
            ? `Revoking "${pendingRevoke.deviceName}" will immediately invalidate all active sessions bound to this device. You can re-register it later if needed.`
            : ""
        }
        confirmLabel="Revoke Device"
        destructive
        busy={busy}
        onConfirm={handleConfirmRevoke}
        onCancel={() => setPendingRevoke(null)}
      />
    </div>
  );
}
