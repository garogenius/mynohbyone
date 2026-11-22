import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, User as UserIcon } from "lucide-react";

import { AiCoreOrb } from "../components/AiCoreOrb";
import { AmbientNeuralField } from "../components/AmbientNeuralField";
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#070A10] px-4 py-10">
      <AmbientNeuralField intensity="vivid" />

      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="ai-glass-card relative z-10 grid w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-800/80 shadow-2xl md:grid-cols-12"
      >
        <div className="ai-shimmer-line absolute inset-x-0 top-0 h-px" />

        <div className="flex flex-col justify-between border-b border-slate-800/80 bg-gradient-to-b from-[#131928]/90 to-[#0C101A]/95 p-8 md:col-span-5 md:border-r md:border-b-0">
          <div>
            <div className="flex items-center gap-3">
              <BrandMark size="lg" />
              <div>
                <h1 className="text-lg font-bold tracking-tight text-white">Nohby ONE</h1>
                <p className="text-xs text-slate-400">Personal AI Operating Assistant</p>
              </div>
            </div>

            <div className="my-7 flex justify-center">
              <AiCoreOrb size="lg" state="active" />
            </div>

            <h2 className="text-xl font-semibold leading-snug tracking-tight text-slate-100">
              Your local-first AI operating layer.
            </h2>
            <p className="mt-2.5 text-xs leading-relaxed text-slate-400">
              Cloud intelligence plans and coordinates. Your desktop agent executes only what you
              authorise, with transparent controls and revocable device access.
            </p>
          </div>

          <div className="mt-7 space-y-2.5 border-t border-slate-800/80 pt-5 text-xs text-slate-400">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Rotating session tokens &amp; per-device revocation</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Lock className="h-4 w-4 text-indigo-400" />
              <span>No covert recording or unrestricted cloud control</span>
            </div>
          </div>
        </div>

        <div className="p-8 md:col-span-7">
          <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                mode === "login"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                mode === "register"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Create Account
            </button>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-semibold text-slate-100">
              {mode === "login"
                ? "Sign in to Nohby ONE"
                : mode === "register"
                ? "Create your Nohby ONE account"
                : "Reset your password"}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {mode === "login"
                ? "Authenticate to connect this desktop agent to your workspace."
                : mode === "register"
                ? "Use at least 8 characters with uppercase, lowercase, and a number."
                : "Enter your account email to request password recovery."}
            </p>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">
              {error}
            </div>
          )}

          {localMsg && (
            <div className="mt-4 rounded-xl border border-indigo-500/30 bg-indigo-950/30 px-4 py-3 text-xs text-indigo-200">
              {localMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {mode === "register" && (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">Full Name</label>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/80 py-2.5 pr-4 pl-10 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">Email Address</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950/80 py-2.5 pr-4 pl-10 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-indigo-500"
                />
              </div>
            </div>

            {mode !== "forgot" && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">Password</label>
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
                  <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={mode === "register" ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950/80 py-2.5 pr-11 pl-10 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={busy || submittingForgot}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-50"
            >
              {(busy || submittingForgot) && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>
                {mode === "login"
                  ? "Sign In"
                  : mode === "register"
                  ? "Create Account & Continue"
                  : "Send Reset Instructions"}
              </span>
              {!busy && !submittingForgot && <ArrowRight className="h-4 w-4" />}
            </motion.button>
          </form>

          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="mt-4 text-xs font-medium text-slate-400 hover:text-slate-200"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
