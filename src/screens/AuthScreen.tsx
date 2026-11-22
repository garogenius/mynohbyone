import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, User as UserIcon } from "lucide-react";

import { BrandMark } from "../components/BrandMark";
import { ApiError, apiClient } from "../lib/api";
import { useAppStore } from "../store/useAppStore";

type AuthMode = "login" | "register" | "forgot";

export function AuthScreen() {
  const { login, register, busy, error, clearError, showToast } = useAppStore();

  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [submittingForgot, setSubmittingForgot] = useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setLocalMsg(null);
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalMsg(null);

    if (mode === "login") {
      try {
        await login(email.trim(), password);
      } catch {
        // Handled in store
      }
      return;
    }

    if (mode === "register") {
      try {
        await register(name.trim(), email.trim(), password);
      } catch {
        // Handled in store
      }
      return;
    }

    setSubmittingForgot(true);
    try {
      const res = await apiClient.forgotPassword(email.trim());
      setLocalMsg(res.message);
      showToast("info", "Password reset request accepted.");
    } catch (err) {
      setLocalMsg(err instanceof ApiError ? err.message : "Unable to process request.");
    } finally {
      setSubmittingForgot(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0B0E] px-4 py-8 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111318] shadow-2xl md:grid-cols-12"
      >
        <div className="flex flex-col justify-between border-b border-white/[0.08] bg-[#0D0F13] p-6 sm:p-8 md:col-span-5 md:border-r md:border-b-0">
          <div>
            <div className="flex items-center gap-3">
              <BrandMark size="md" />
              <div>
                <h1 className="text-base font-semibold tracking-tight text-white">Nohby ONE</h1>
                <p className="text-xs text-zinc-500">Nohby Technologies Limited</p>
              </div>
            </div>

            <h2 className="mt-8 text-xl font-semibold leading-snug tracking-tight text-white">
              Local-first personal AI operating assistant.
            </h2>
            <p className="mt-3 text-xs leading-relaxed text-zinc-400">
              Cloud intelligence plans and coordinates. Your desktop agent executes only what you
              authorise, with explicit approvals and per-device session revocation.
            </p>
          </div>

          <div className="mt-8 space-y-2.5 border-t border-white/[0.06] pt-5 text-xs text-zinc-400">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>Rotating refresh tokens &amp; scoped device sessions</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Lock className="h-4 w-4 shrink-0 text-indigo-400" />
              <span>No covert recording or unrestricted remote control</span>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8 md:col-span-7">
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#0A0B0E] p-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`min-h-[36px] flex-1 rounded-md text-xs font-medium transition ${
                mode === "login"
                  ? "bg-[#1C1F28] text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`min-h-[36px] flex-1 rounded-md text-xs font-medium transition ${
                mode === "register"
                  ? "bg-[#1C1F28] text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Create Account
            </button>
          </div>

          <div className="mt-6">
            <h3 className="text-base font-semibold text-white">
              {mode === "login"
                ? "Sign in to your workspace"
                : mode === "register"
                ? "Create your Nohby ONE account"
                : "Reset your password"}
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              {mode === "login"
                ? "Authenticate to connect this device to your account."
                : mode === "register"
                ? "Minimum 8 characters including uppercase, lowercase, and a number."
                : "Enter your account email to request password recovery."}
            </p>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-200">
              {error}
            </div>
          )}

          {localMsg && (
            <div className="mt-4 rounded-lg border border-indigo-500/30 bg-indigo-950/30 px-3.5 py-2.5 text-xs text-indigo-200">
              {localMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {mode === "register" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-300">Full Name</label>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full rounded-lg border border-white/[0.1] bg-[#0A0B0E] py-2.5 pr-3.5 pl-9 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-300">Email Address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-lg border border-white/[0.1] bg-[#0A0B0E] py-2.5 pr-3.5 pl-9 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-indigo-500"
                />
              </div>
            </div>

            {mode !== "forgot" && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-300">Password</label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={mode === "register" ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-lg border border-white/[0.1] bg-[#0A0B0E] py-2.5 pr-10 pl-9 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-300"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || submittingForgot}
              className="mt-2 flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {(busy || submittingForgot) && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>
                {mode === "login"
                  ? "Sign In"
                  : mode === "register"
                  ? "Create Account"
                  : "Send Reset Instructions"}
              </span>
              {!busy && !submittingForgot && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="mt-4 text-xs font-medium text-zinc-400 hover:text-zinc-200"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
