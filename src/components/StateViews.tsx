import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, X } from "lucide-react";

export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 px-6 py-14 text-center">
      <h3 className="text-base font-semibold text-slate-100">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-slate-400">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-rose-500/25 bg-rose-950/20 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-rose-200">{title}</h3>
          <p className="mt-1 text-sm text-rose-200/80">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-1.5 text-xs font-medium text-rose-200 transition hover:bg-rose-500/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#111622] p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>
        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-slate-700/80 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
              destructive
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastBanner({
  toast,
  onClose,
}: {
  toast: { type: "success" | "error" | "info"; message: string } | null;
  onClose: () => void;
}) {
  if (!toast) return null;

  const styles =
    toast.type === "success"
      ? "border-emerald-500/30 bg-emerald-950/90 text-emerald-100"
      : toast.type === "error"
      ? "border-rose-500/30 bg-rose-950/90 text-rose-100"
      : "border-indigo-500/30 bg-slate-900/95 text-slate-100";

  const Icon =
    toast.type === "success"
      ? CheckCircle2
      : toast.type === "error"
      ? AlertTriangle
      : Info;

  return (
    <div className="fixed right-5 bottom-5 z-50 max-w-sm">
      <div
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-md ${styles}`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{toast.message}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-0.5 opacity-70 transition hover:opacity-100"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
