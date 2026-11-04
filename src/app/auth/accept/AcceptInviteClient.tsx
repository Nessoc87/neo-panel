"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type InviteCredentials = {
  accessToken: string;
  tokenHash: string;
  type: string;
};

export default function AcceptInviteClient() {
  const router = useRouter();
  const [credentials, setCredentials] = useState<InviteCredentials>({
    accessToken: "",
    tokenHash: "",
    type: "",
  });
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));

    const accessToken =
      fragment.get("access_token") ||
      query.get("access_token") ||
      "";
    const tokenHash =
      query.get("token_hash") ||
      fragment.get("token_hash") ||
      "";
    const type =
      fragment.get("type") ||
      query.get("type") ||
      "";

    // Remove session tokens from the visible URL and browser history immediately.
    window.history.replaceState({}, document.title, window.location.pathname);

    setCredentials({ accessToken, tokenHash, type });
    setReady(true);
  }, []);

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
    if (
      (credentials.type !== "invite" && credentials.type !== "recovery") ||
      (!credentials.accessToken && !credentials.tokenHash)
    ) {
      setError("El enlace de invitación venció o no es válido. Solicita uno nuevo al administrador.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: credentials.accessToken,
          token_hash: credentials.tokenHash,
          type: credentials.type,
          password,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "No se pudo aceptar la invitación.");
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aceptar la invitación.");
    } finally {
      setLoading(false);
    }
  }

  const validInvite =
    (credentials.type === "invite" || credentials.type === "recovery") &&
    Boolean(credentials.accessToken || credentials.tokenHash);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-xl font-black text-white">N</div>
        <p className="text-xs font-bold tracking-[0.18em] text-cyan-800">NEO TRANSPORTACIONES</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Activa tu cuenta</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Crea una contraseña personal para entrar al panel de Neo.</p>

        {!ready ? (
          <p className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Verificando la invitación...</p>
        ) : !validInvite ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
              El enlace venció, ya fue utilizado o no corresponde a una activación de cuenta. Solicita al administrador que te envíe otro.
            </p>
            <button type="button" onClick={() => router.replace("/login")} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Ir al inicio de sesión
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Nueva contraseña
              <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength={10} maxLength={128} autoComplete="new-password" required className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-700"/>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Confirmar contraseña
              <input type="password" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} minLength={10} maxLength={128} autoComplete="new-password" required className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-cyan-700"/>
            </label>
            <p className="text-xs leading-5 text-slate-500">Utiliza al menos 10 caracteres. Esta será tu contraseña individual para acceder al panel.</p>
            {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
            <button type="submit" disabled={loading} className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-cyan-800 disabled:opacity-60">
              {loading ? "Activando cuenta..." : "Activar cuenta"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
