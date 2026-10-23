import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const instant = false;

type Modulo = { icono: string; titulo: string; descripcion: string; href: string };

const modulos: Modulo[] = [
  { icono: "CO", titulo: "Cotizaciones", descripcion: "Registra solicitudes, revisa rutas y administra el estado de cada propuesta.", href: "/cotizaciones" },
  { icono: "SE", titulo: "Envíos activos", descripcion: "Da seguimiento a servicios, unidad, operador y fechas de entrega.", href: "/envios-activos" },
  { icono: "WA", titulo: "Conversaciones", descripcion: "Supervisa WhatsApp y la atención de tus clientes.", href: "/conversaciones" },
  { icono: "CL", titulo: "Clientes", descripcion: "Administra contactos, datos fiscales y notas de tus clientes.", href: "/clientes" },
  { icono: "SV", titulo: "Servicios", descripcion: "Registra, consulta, edita y exporta los servicios de Neo.", href: "/servicios" },
];

export default async function Home() {
  const store = await cookies();
  if (!verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value)) redirect("/login");

  let cotizaciones: number | string = "—";
  let clientes: number | string = "—";
  let serviciosTotal: number | string = "—";
  let enviosActivos: number | string = "—";

  try {
    const [quotesResult, clientsResult, allServicesResult, activeServicesResult] = await Promise.all([
      supabaseAdmin.from("neo_cotizaciones").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("neo_clientes").select("id", { count: "exact", head: true }).eq("activo", true),
      supabaseAdmin.from("servicios").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("servicios").select("id").in("estatus", ["PENDIENTE", "FACTURADO", "PAGADO"]).limit(1000),
    ]);
    if (!quotesResult.error && quotesResult.count !== null) cotizaciones = quotesResult.count;
    if (!clientsResult.error && clientsResult.count !== null) clientes = clientsResult.count;
    if (!allServicesResult.error && allServicesResult.count !== null) serviciosTotal = allServicesResult.count;

    if (!activeServicesResult.error) {
      const activeRows = activeServicesResult.data ?? [];
      if (activeRows.length === 0) {
        enviosActivos = 0;
      } else {
        const ids = activeRows.map((item) => item.id);
        const trackingResult = await supabaseAdmin
          .from("neo_envios")
          .select("servicio_id, estatus_operativo")
          .in("servicio_id", ids);
        if (!trackingResult.error) {
          const statusById = new Map((trackingResult.data ?? []).map((item) => [item.servicio_id, item.estatus_operativo]));
          enviosActivos = activeRows.filter((item) => {
            const state = statusById.get(item.id);
            return state !== "ENTREGADO" && state !== "CANCELADO";
          }).length;
        } else {
          enviosActivos = activeRows.length;
        }
      }
    }
  } catch {
    // El panel sigue siendo navegable aunque la consulta de indicadores falle.
  }

  const stats = [
    { titulo: "Cotizaciones", valor: cotizaciones, descripcion: "Solicitudes registradas" },
    { titulo: "Envíos activos", valor: enviosActivos, descripcion: "Servicios en seguimiento" },
    { titulo: "Clientes activos", valor: clientes, descripcion: "Registros disponibles" },
    { titulo: "Servicios registrados", valor: serviciosTotal, descripcion: "Historial operativo" },
  ];

  return (
    <main className="neo-app min-h-screen bg-slate-100 text-slate-800">
      <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <a href="/" aria-label="Neo Transportaciones, inicio" className="inline-flex items-center">
            <Image src="/neo-logo.png" alt="NEO Transportaciones" width={220} height={114} priority className="h-14 w-auto object-contain sm:h-16" />
          </a>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">Cerrar sesión</button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-4 sm:p-8 lg:p-10">
        <section className="rounded-3xl bg-gradient-to-r from-slate-900 to-cyan-800 p-6 text-white sm:p-12">
          <p className="mb-3 text-sm font-bold tracking-widest text-cyan-300">PANEL DE CONTROL</p>
          <h1 className="text-3xl font-bold sm:text-5xl">Todo el trabajo de Neo,<br />en un solo lugar.</h1>
          <p className="mt-5 max-w-xl leading-7 text-slate-200">Administra cotizaciones, supervisa envíos y organiza la atención de tus clientes desde una sola plataforma.</p>
          <a href="#modulos" className="mt-7 inline-block rounded-xl bg-cyan-300 px-6 py-3 font-bold text-slate-900 hover:bg-cyan-200">Explorar módulos</a>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold">Resumen operativo</h2>
          <p className="mt-2 text-sm text-slate-500">Indicadores consultados desde Supabase. Si aún no aplicaste la migración, algunos valores se mostrarán como guiones.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <article key={stat.titulo} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="font-medium">{stat.titulo}</p>
                <p className="mt-4 text-3xl font-bold">{stat.valor}</p>
                <p className="mt-2 text-xs text-slate-500">{stat.descripcion}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="modulos" className="mt-10">
          <h2 className="text-2xl font-bold">Módulos de Neo</h2>
          <p className="mt-2 text-sm text-slate-500">Herramientas para administrar la operación de tu empresa.</p>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {modulos.map((modulo) => (
              <article key={modulo.icono} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="flex items-center gap-4">
                  <a
                    href={modulo.href}
                    aria-label={`Abrir módulo ${modulo.titulo}`}
                    title={`Abrir ${modulo.titulo}`}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-100 font-bold text-cyan-900 transition hover:bg-cyan-200 hover:text-cyan-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2"
                  >
                    {modulo.icono}
                  </a>
                  <h3 className="text-lg font-bold">{modulo.titulo}</h3>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{modulo.descripcion}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="py-8 text-center text-xs text-slate-400">Neo Transportaciones · Panel privado</footer>
      </div>
    </main>
  );
}
