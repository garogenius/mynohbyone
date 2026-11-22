import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Globe,
  HardDrive,
  LayoutGrid,
  Loader2,
  Mic,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import {
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/StateViews";
import { ApiError, apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";
import type { Device, Permission } from "../types/api";

interface DeviceCapabilityScope {
  resource: string;
  title: string;
  description: string;
  actions: string[];
  icon: typeof Globe;
}

const AUTONOMOUS_SCOPES: DeviceCapabilityScope[] = [
  {
    resource: "browser",
    title: "Browser & Web Launch",
    description: "Open websites (Google, YouTube, Gmail, GitHub, WhatsApp) and run web searches when asked.",
    actions: ["open", "navigate", "search"],
    icon: Globe,
  },
  {
    resource: "workspace",
    title: "Workspace & Theme Control",
    description: "Navigate screens, switch Light/Dark themes, and start meetings or tasks by voice.",
    actions: ["navigate", "theme", "execute"],
    icon: LayoutGrid,
  },
  {
    resource: "files",
    title: "Library & Document Intelligence",
    description: "Read, index, summarize, and generate meeting documents into your Library.",
    actions: ["read", "inspect", "summarise"],
    icon: HardDrive,
  },
  {
    resource: "voice",
    title: "Hands-Free Wake Word & Neural Speech",
    description: "Continuous 'Hey Nohby' listening, stealth interview Q&A, and studio neural voice output.",
    actions: ["listen", "speak", "transcribe"],
    icon: Mic,
  },
];

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
    renameDevice,
    revokeDevice,
    showToast,
  } = useAppStore();

  const [pendingRevoke, setPendingRevoke] = useState<Device | null>(null);
  const [pingMap, setPingMap] = useState<Record<string, number>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  // Device Permissions state
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loadingPerms, setLoadingPerms] = useState(true);
  const [togglingResource, setTogglingResource] = useState<string | null>(null);
  const [grantingAll, setGrantingAll] = useState(false);

  const loadPermissions = useCallback(async () => {
    setLoadingPerms(true);
    try {
      const res = await apiClient.listPermissions();
      setPermissions(res.data.permissions.filter((p) => p.active));
    } catch {
      // Non-blocking
    } finally {
      setLoadingPerms(false);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

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

  const handleSaveRename = async (deviceId: string) => {
    const clean = renameDraft.trim();
    setRenamingId(null);
    if (!clean) return;
    await renameDevice(deviceId, clean);
  };

  const isResourcePermitted = (resource: string): Permission | undefined => {
    return permissions.find((p) => p.resource === resource && p.active);
  };

  const handleToggleScope = async (scope: DeviceCapabilityScope) => {
    const existing = isResourcePermitted(scope.resource);
    setTogglingResource(scope.resource);
    try {
      if (existing) {
        await apiClient.revokePermission(existing.id);
        showToast("info", `Revoked ${scope.title} permission.`);
      } else {
        await apiClient.grantPermission({
          deviceId: currentDeviceId,
          resource: scope.resource,
          actions: scope.actions,
        });
        showToast("success", `Permitted: ${scope.title}.`);
      }
      await loadPermissions();
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to update permission.");
    } finally {
      setTogglingResource(null);
    }
  };

  const handleGrantAllPermissions = async () => {
    setGrantingAll(true);
    try {
      for (const scope of AUTONOMOUS_SCOPES) {
        if (!isResourcePermitted(scope.resource)) {
          await apiClient.grantPermission({
            deviceId: currentDeviceId,
            resource: scope.resource,
            actions: scope.actions,
          });
        }
      }
      await loadPermissions();
      showToast(
        "success",
        "All autonomous device permissions granted — NohbyAI can execute commands immediately on this device."
      );
    } catch (err) {
      showToast("error", err instanceof ApiError ? err.message : "Failed to grant permissions.");
    } finally {
      setGrantingAll(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-white">
            Connected Nodes, Permissions &amp; Audio Hardware
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Register, rename, and permit devices for autonomous browser launch, voice control, and local task execution
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              refreshDevices();
              loadPermissions();
            }}
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

      {/* Autonomous Device Permissions Banner & Toggles */}
      <div className="nohby-frame space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#00D4FF]" />
            <div>
              <h3 className="font-display text-sm font-semibold text-white">
                Device Permissions &amp; Autonomous Action Scopes
              </h3>
              <p className="text-[11px] text-zinc-400">
                Enable permissions so NohbyAI can open browsers, search websites, manage files, and control workspace views on this registered device.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={grantingAll}
            onClick={handleGrantAllPermissions}
            className="btn-ivory inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs"
          >
            {grantingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Permit All Actions on This Device
          </button>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          {AUTONOMOUS_SCOPES.map((scope) => {
            const Icon = scope.icon;
            const permitted = Boolean(isResourcePermitted(scope.resource));
            const isToggling = togglingResource === scope.resource;
            return (
              <div
                key={scope.resource}
                className={`flex items-start justify-between gap-3 rounded-xl border p-3 transition ${
                  permitted
                    ? "border-emerald-500/35 bg-emerald-500/10"
                    : "border-white/[0.08] bg-[#141B2D]/80"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                      permitted
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                        : "border-white/[0.1] bg-[#101624] text-[#00D4FF]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-white">{scope.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">
                      {scope.description}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isToggling || loadingPerms}
                  onClick={() => handleToggleScope(scope)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                    permitted
                      ? "bg-emerald-500/20 text-emerald-300 hover:bg-rose-500/20 hover:text-rose-300"
                      : "border border-[#00D4FF]/40 bg-[#00D4FF]/15 text-[#00D4FF] hover:bg-[#00D4FF]/25"
                  }`}
                >
                  {isToggling ? "..." : permitted ? "Permitted" : "Permit"}
                </button>
              </div>
            );
          })}
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
            const isRenaming = renamingId === device.id;

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
                  <div className="flex items-center gap-1.5">
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
                      {isOnline ? "Registered & Connected" : "Revoked"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(device.id);
                        setRenameDraft(device.deviceName);
                      }}
                      className="rounded p-1 text-zinc-400 hover:bg-white/[0.08] hover:text-[#00D4FF]"
                      title="Rename device"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
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

                {isRenaming ? (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename(device.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="studio-input h-8 flex-1 rounded-lg px-2.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveRename(device.id)}
                      className="rounded-lg bg-emerald-500/20 p-1.5 text-emerald-400"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="rounded-lg bg-white/[0.08] p-1.5 text-zinc-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <h3 className="mt-2 truncate text-sm font-semibold text-white">
                    {device.deviceName}
                  </h3>
                )}

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
                  {isCurrent ? "Active Connected Device (Ping Heartbeat)" : "Handoff Session Here"}
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
