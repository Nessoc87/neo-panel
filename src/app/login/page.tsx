"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { connection } from "next/server";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "No fue posible iniciar sesión."
        );
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error. Inténtalo de nuevo."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-5">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-xl md:grid-cols-2">
        <section className="flex flex-col justify-between bg-gradient-to-br from-slate-900 to-cyan-800 p-8 text-white sm:p-12">
          <div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-300 text-2xl font-black text-slate-900">
              N
            </div>

            <p className="mt-6 text-sm font-bold tracking-[0.2em] text-cyan-300">
              NEO TRANSPORTACIONES
            </p>

            <h1 className="mt-6 text-3xl font-bold leading-tight sm:text-4xl">
              Tu operación,
              <br />
              bajo control.
            </h1>

            <p className="mt-5 max-w-sm text-sm leading-7 text-slate-200">
              Accede a las herramientas de gestión y atención de Neo
              desde un solo lugar.
            </p>
          </div>

          <p className="mt-12 text-xs text-slate-300">
            Panel privado de operaciones
          </p>
        </section>

        <section className="flex items-center justify-center p-7 sm:p-12">
          <div className="w-full max-w-sm">
            <p className="text-sm font-semibold text-cyan-800">
              BIENVENIDO
            </p>

            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              Iniciar sesión
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Introduce tus credenciales para continuar.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label
                  htmlFor="username"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Usuario
                </label>

                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Tu usuario"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Contraseña
                </label>

                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Tu contraseña"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                />
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Verificando..." : "Entrar al panel"}
              </button>
            </form>

            <p className="mt-6 text-center text-xs leading-5 text-slate-400">
              Acceso exclusivo para personal autorizado.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}