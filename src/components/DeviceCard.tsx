import { useState } from "react";
import { Activity, Check, Edit3, Laptop, Monitor, ShieldOff, Terminal, X } from "lucide-react";

import type { Device } from "../types/api";

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function DeviceCard({
  device,
  isCurrent,
  onHeartbeat,
  onRename,
  onRevoke,
}: {
  device: Device;
  isCurrent: boolean;
  onHeartbeat: (id: string) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onRevoke: (device: Device) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(device.deviceName);
  const [saving, setSaving] = useState(false);

  const isRevoked = device.status === "revoked";
  const PlatformIcon =
    device.platform === "windows" ? Monitor : device.platform === "linux" ? Terminal : Laptop;

  const handleSave = async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === device.deviceName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(device.id, trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border p-5 transition ${
        isRevoked
          ? "border-slate-800/60 bg-slate-950/40 opacity-70"
          : isCurrent
          ? "border-indigo-500/35 bg-[#121828]"
          : "border-slate-800/80 bg-[#111622] hover:border-slate-700/80"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
              isRevoked
                ? "border-slate-800 bg-slate-900 text-slate-500"
                : "border-indigo-500/25 bg-indigo-500/10 text-indigo-300"
            }`}
          >
            <PlatformIcon className="h-5 w-5" />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              {editing ? (
                <div className="flex items-center gap-1.5">
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="rounded-lg border border-indigo-500/50 bg-slate-950 px-2.5 py-1 text-sm text-slate-100 outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-500"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftName(device.deviceName);
                      setEditing(false);
                    }}
                    className="rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <h3 className="text-sm font-semibold text-slate-100">{device.deviceName}</h3>
              )}

              {isCurrent && !isRevoked && (
                <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[11px] font-medium text-cyan-300 ring-1 ring-cyan-500/30">
                  This Device
                </span>
              )}

              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  isRevoked
                    ? "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30"
                    : "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                }`}
              >
                {isRevoked ? "Revoked" : "Active"}
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
              <span className="capitalize">{device.platform}</span>
              <span>App v{device.appVersion}</span>
              <span>Last seen: {formatDate(device.lastSeenAt)}</span>
            </div>

            {device.capabilities.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {device.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-md border border-slate-800 bg-slate-900/90 px-2 py-0.5 font-mono text-[11px] text-slate-300"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {!isRevoked && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onHeartbeat(device.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
            >
              <Activity className="h-3.5 w-3.5 text-cyan-400" />
              Ping
            </button>
            {!editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Rename
              </button>
            )}
            <button
              type="button"
              onClick={() => onRevoke(device)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
            >
              <ShieldOff className="h-3.5 w-3.5" />
              Revoke
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
