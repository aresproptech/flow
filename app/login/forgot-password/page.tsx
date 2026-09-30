"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
            Cargando...
          </div>
        </main>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}

function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSending(true);

    const redirectTo = new URL(
      "/login/reset-password",
      window.location.origin
    ).toString();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo }
    );

    setSending(false);

    if (resetError) {
      console.warn("Password recovery request failed:", resetError.code);
      const errorCode = resetError.code?.toLowerCase() || "";
      const errorMessage = resetError.message.toLowerCase();

      if (errorCode.includes("redirect") || errorMessage.includes("redirect")) {
        setError(
          "Supabase rechazó la URL de retorno. Añade la URL de esta app terminada en /login/reset-password a Authentication → URL Configuration → Redirect URLs."
        );
      } else if (errorCode.includes("rate") || errorMessage.includes("rate limit")) {
        setError(
          "Supabase alcanzó el límite temporal de correos de recuperación. Espera antes de volver a intentarlo o configura SMTP propio en Supabase Auth."
        );
      } else if (errorMessage.includes("smtp") || errorMessage.includes("email service")) {
        setError("Supabase no pudo enviar el correo. Revisa la configuración SMTP de Auth.");
      } else {
        setError("No se pudo solicitar el enlace. Revisa la configuración de Auth e inténtalo de nuevo.");
      }
      return;
    }

    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            Recuperar contraseña
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Te enviaremos un enlace para crear una contraseña nueva.
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Si existe una cuenta para ese email, recibirás un enlace para restablecer tu contraseña.
            </p>
            <a
              href="/login"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Volver al inicio de sesión
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                placeholder="tu@email.com"
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
              disabled={sending}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Enviando..." : "Enviar enlace"}
            </button>

            <a
              href="/login"
              className="block text-center text-sm font-medium text-slate-600 underline-offset-4 transition hover:text-slate-900 hover:underline"
            >
              Volver al inicio de sesión
            </a>
          </form>
        )}
      </div>
    </main>
  );
}