"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type RecoveryState = "checking" | "ready" | "invalid" | "complete";

export default function ResetPasswordPage() {
  const [recoveryState, setRecoveryState] = useState<RecoveryState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let recoverySessionReceived = false;

    function acceptRecoverySession() {
      if (!active) return;
      recoverySessionReceived = true;
      window.history.replaceState(null, "", "/login/reset-password");
      setRecoveryState("ready");
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active || !session) return;
      acceptRecoverySession();
    });

    async function resolveRecoverySession() {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active || recoverySessionReceived) return;

      if (data.session) {
        acceptRecoverySession();
        return;
      }

      const currentUrl = new URL(window.location.href);
      const callbackError =
        currentUrl.searchParams.get("error_description") ||
        currentUrl.searchParams.get("error") ||
        currentUrl.searchParams.get("error_code");
      if (callbackError) {
        setError(callbackError);
        setRecoveryState("invalid");
        return;
      }

      const code = currentUrl.searchParams.get("code");
      if (code) {
        const { data: exchanged, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(exchangeError.message);
          setRecoveryState("invalid");
          return;
        }
        if (exchanged.session) {
          acceptRecoverySession();
          return;
        }
      }

      const hashParams = new URLSearchParams(currentUrl.hash.slice(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const { data: restored, error: restoreError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (restoreError) {
          setError(restoreError.message);
          setRecoveryState("invalid");
          return;
        }
        if (restored.session) {
          acceptRecoverySession();
          return;
        }
      }

      if (sessionError) setError(sessionError.message);
      setRecoveryState("invalid");
    }

    void resolveRecoverySession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    if (
      password.length < 10 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      setError("Usa al menos 10 caracteres, con mayúscula, minúscula y número.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setSaving(false);
      setError(`No se pudo actualizar la contraseña: ${updateError.message}`);
      return;
    }

    await supabase.auth.signOut();
    setSaving(false);
    setRecoveryState("complete");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        {recoveryState === "checking" ? (
          <p className="text-sm text-slate-600">Validando el enlace...</p>
        ) : recoveryState === "invalid" ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Enlace no válido
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {error || "El enlace venció o ya fue utilizado. Solicita uno nuevo para continuar."}
              </p>
            </div>
            <a
              href="/login/forgot-password"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Solicitar otro enlace
            </a>
          </div>
        ) : recoveryState === "complete" ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Contraseña actualizada
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Ya puedes iniciar sesión con tu nueva contraseña.
              </p>
            </div>
            <a
              href="/login"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Ir al inicio de sesión
            </a>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold text-slate-900">
                Crear contraseña nueva
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                La nueva contraseña debe cumplir estos criterios:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-500">
                <li>Al menos 10 caracteres</li>
                <li>Una letra mayúscula</li>
                <li>Una letra minúscula</li>
                <li>Un número</li>
              </ul>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Nueva contraseña
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">
                  Repetir nueva contraseña
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                  required
                />
              </label>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Actualizando..." : "Actualizar contraseña"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}