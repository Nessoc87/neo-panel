import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";

export const instant = false;

const modulos = [
  {
    icono: "CO",
    titulo: "Cotizaciones",
    descripcion:
      "Consulta solicitudes y prepara propuestas para tus clientes.",
  },
  {
    icono: "SE",
    titulo: "Seguimiento de envios",
    descripcion:
      "Organiza y consulta el estado de los servicios.",
  },
  {
    icono: "WA",
    titulo: "Conversaciones",
    descripcion:
      "Supervisa WhatsApp y la atencion de tus clientes.",
  },
  {
    icono: "CL",
    titulo: "Clientes",
    descripcion:
      "Consulta los datos y el historial de tus clientes.",
  },
];

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!verifySessionToken(token)) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-800">
      <header className="flex items-center justify-between gap-4 bg-slate-900 px-6 py-5 text-white">
        <div>
          <p className="text-xl font-bold">NEO</p>
          <p className="text-sm text-slate-300">
            TRANSPORTACIONES
          </p>
        </div>

        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="rounded-xl border border-white/20 px-4 py-2 text-sm font-medium transition hover:bg-white/10"
          >
            Cerrar sesion
          </button>
        </form>
      </header>

      <div className="mx-auto max-w-7xl p-6 sm:p-10">
        <section className="rounded-3xl bg-gradient-to-r from-slate-900 to-cyan-800 p-8 text-white sm:p-12">
          <p className="mb-3 text-sm font-bold tracking-widest text-cyan-300">
            PANEL DE CONTROL
          </p>

          <h1 className="text-3xl font-bold sm:text-5xl">
            Todo el trabajo de Neo,
            <br />
            en un solo lugar.
          </h1>

          <p className="mt-5 max-w-xl leading-7 text-slate-200">
            Administra cotizaciones, supervisa conversaciones y
            organiza la atencion de tus clientes desde una sola
            plataforma.
          </p>

          <a
            href="#modulos"
            className="mt-7 inline-block rounded-xl bg-cyan-300 px-6 py-3 font-bold text-slate-900 hover:bg-cyan-200"
          >
            Explorar modulos
          </a>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold">
            Resumen operativo
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Los indicadores se activaran al conectar los datos reales.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              "Cotizaciones",
              "Envios activos",
              "Conversaciones",
              "Alertas",
            ].map((titulo) => (
              <div
                key={titulo}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <p className="font-medium">{titulo}</p>

                <p className="mt-4 text-3xl font-bold text-slate-300">
                  —
                </p>

                <p className="mt-2 text-xs text-amber-700">
                  Pendiente de conexion
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="modulos" className="mt-10">
          <h2 className="text-2xl font-bold">
            Modulos de Neo
          </h2>

          <p className="mt-2 text-sm text-slate-500">
            Herramientas para administrar la operacion de tu empresa.
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {modulos.map((modulo) => (
              <article
                key={modulo.icono}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-100 font-bold text-cyan-900">
                    {modulo.icono}
                  </div>

                  <h3 className="text-lg font-bold">
                    {modulo.titulo}
                  </h3>
                </div>

                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {modulo.descripcion}
                </p>

                <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-amber-700">
                  En preparacion
                </p>
              </article>
            ))}
          </div>
        </section>

        <footer className="py-8 text-center text-xs text-slate-400">
          Neo Transportaciones · Panel privado
        </footer>
      </div>
    </main>
  );
}