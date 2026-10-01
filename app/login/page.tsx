"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function checkSession() {
      const currentUrl = new URL(window.location.href);
      const hasRecoveryCallback =
        currentUrl.searchParams.has("code") ||
        currentUrl.searchParams.has("error") ||
        currentUrl.searchParams.get("type") === "recovery" ||
        currentUrl.hash.includes("access_token=");

      if (hasRecoveryCallback) {
        router.replace(`/login/reset-password${currentUrl.search}${currentUrl.hash}`);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        router.replace("/dashboard");
        return;
      }

      setCheckingSession(false);
    }

    checkSession();
  }, [router]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError(error.message || "No se pudo iniciar sesión.");
      return;
    }

    router.replace("/dashboard");
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
          Verificando sesión...
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            Iniciar sesión
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ingresa tu email y contraseña.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Email
            </span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              placeholder="tu@email.com"
              required
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Contraseña
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              placeholder="••••••••"
              required
            />
          </label>

          <div className="-mt-2 flex justify-end">
            <a
              href={email ? `/login/forgot-password?email=${encodeURIComponent(email)}` : "/login/forgot-password"}
              className="text-sm font-medium text-slate-600 underline-offset-4 transition hover:text-slate-900 hover:underline"
            >
              Olvidé mi clave
            </a>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
