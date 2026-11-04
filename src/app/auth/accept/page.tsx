"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AcceptInvitationPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tokenHash = params.get("token_hash") || "";
  const type = params.get("type") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password.length < 10) {
      setError("La contraseña debe tener al menos 10 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (!tokenHash || type !== "invite") {
      setError("El enlace de invitación no es válido. Solicita uno nuevo al administrador.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash, type, password }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "No se pudo aceptar la invitación.");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aceptar la invitación.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-xl font-black text-white">N</div>
        <p className="text-xs font-bold tracking-[0.18em] text-cyan-800">NEO TRANSPORTACIONES</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Activa tu cuenta</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Crea una contraseña personal para entrar al panel de Neo.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Nueva contraseña
            <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={10} maxLength={128} autoComplete="new-password" required className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-700"/>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Confirmar contraseña
            <input type="password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} minLength={10} maxLength={128} autoComplete="new-password" required className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-700"/>
          </label>
          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-cyan-800 disabled:opacity-60">
            {loading ? "Activando cuenta..." : "Activar cuenta"}
          </button>
        </form>
      </section>
    </main>
  );
}
