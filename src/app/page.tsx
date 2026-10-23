import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const instant = false;

type Modulo = {
  icono: string;
  titulo: string;
  descripcion: string;
  href: string;
  area: string;
};

const modulos: Modulo[] = [
  { icono: "CO", titulo: "Cotizaciones", descripcion: "Solicitudes, rutas, importes y propuestas comerciales.", href: "/cotizaciones", area: "COMERCIAL" },
  { icono: "SE", titulo: "Envíos activos", descripcion: "Seguimiento de servicios, operadores y entregas.", href: "/envios-activos", area: "LOGÍSTICA" },
  { icono: "WA", titulo: "Conversaciones", descripcion: "Atención a clientes y mensajes de WhatsApp.", href: "/conversaciones", area: "ATENCIÓN" },
  { icono: "CL", titulo: "Clientes", descripcion: "Contactos y datos comerciales de tu directorio.", href: "/clientes", area: "DIRECTORIO" },
  { icono: "SV", titulo: "Servicios", descripcion: "Registros, conceptos, importes y facturación.", href: "/servicios", area: "ADMINISTRACIÓN" },
];

function MetricIcon({ kind }: { kind: string }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (kind === "Cotizaciones") return <svg {...common}><path d="M7 3.5h7l4 4v13H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z"/><path d="M14 3.5v4h4M8.5 12h7M8.5 16h7"/></svg>;
  if (kind === "Envíos activos") return <svg {...common}><path d="M2.8 5.5h11.5v11H2.8zM14.3 9h4.2l3 3.3v4.2h-7.2z"/><circle cx="7" cy="18" r="2"/><circle cx="18.2" cy="18" r="2"/></svg>;
  if (kind === "Clientes activos") return <svg {...common}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5v-1.2a5.5 5.5 0 0 1 11 0v1.2ZM16 5.2a3.2 3.2 0 0 1 0 6.2M17 14.4a5.2 5.2 0 0 1 3.5 4.9"/></svg>;
  return <svg {...common}><path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z"/><path d="M3.5 7.5V17L12 21l8.5-4V7.5M12 12v9"/></svg>;
}

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
    // Se conserva la navegación aunque un indicador no pueda consultarse.
  }

  const stats = [
    { titulo: "Cotizaciones", valor: cotizaciones, descripcion: "Solicitudes registradas", tone: "teal" },
    { titulo: "Envíos activos", valor: enviosActivos, descripcion: "Servicios en seguimiento", tone: "blue" },
    { titulo: "Clientes activos", valor: clientes, descripcion: "Contactos disponibles", tone: "violet" },
    { titulo: "Servicios registrados", valor: serviciosTotal, descripcion: "Registros operativos", tone: "amber" },
  ];

  return (
    <main className="neo-app neo-dashboard">
      <div className="neo-dashboard-content">
        <section className="neo-dashboard-hero">
          <div className="neo-dashboard-hero-copy">
            <div className="neo-dashboard-eyebrow"><span className="neo-eyebrow-line" /> OPERACIÓN · LOGÍSTICA · SERVICIO</div>
            <h2>Todo conectado.<br /><span>Todo bajo control.</span></h2>
            <p>Una vista clara de las operaciones de Neo: desde la primera cotización hasta el seguimiento de cada servicio y cliente.</p>
            <div className="neo-dashboard-actions">
              <Link href="/cotizaciones" className="neo-primary-action">
                <span>Nueva cotización</span>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </Link>
              <Link href="/envios-activos" className="neo-secondary-action">Ver envíos activos</Link>
            </div>
            <div className="neo-hero-footnote"><span className="neo-status-dot" /> Información conectada a los registros de Neo</div>
          </div>

          <div className="neo-dashboard-illustration" aria-hidden="true">
            <div className="neo-map-label neo-map-label-top">RUTA · NEO LOGISTICS</div>
            <svg className="neo-route-map" viewBox="0 0 520 310" fill="none">
              <path d="M15 52H146L201 106H315L369 51H511M27 212H118L165 165H256L310 213H505M103 8V75L65 113V170L103 212V300M400 9V88L442 130V196L404 237V302M213 8V45M320 266V304" stroke="rgba(197,236,239,.14)" strokeWidth="1.5"/>
              <path d="M30 125C105 125 100 82 170 82S247 139 302 139 378 196 465 196" stroke="#67DAD5" strokeWidth="2.4" strokeDasharray="5 8" strokeLinecap="round"/>
              <circle cx="30" cy="125" r="6" fill="#67DAD5"/><circle cx="170" cy="82" r="6" fill="#67DAD5"/><circle cx="302" cy="139" r="6" fill="#67DAD5"/><circle cx="465" cy="196" r="7" fill="#F4C477"/>
              <circle cx="170" cy="82" r="14" stroke="#67DAD5" strokeOpacity=".32"/><circle cx="465" cy="196" r="16" stroke="#F4C477" strokeOpacity=".35"/>
              <g transform="translate(182 129)">
                <rect x="12" y="0" width="154" height="71" rx="8" fill="#F5FAFD"/>
                <path d="M166 23h39l25 26v22h-64V23Z" fill="#67DAD5"/>
                <path d="M181 31h18l18 18h-36V31Z" fill="#153B54"/>
                <rect x="25" y="13" width="128" height="10" rx="3" fill="#D9E7EF"/>
                <rect x="25" y="31" width="90" height="8" rx="3" fill="#D9E7EF"/>
                <rect x="25" y="46" width="112" height="8" rx="3" fill="#D9E7EF"/>
                <path d="M166 0v71" stroke="#D9E7EF" strokeWidth="2"/>
                <circle cx="51" cy="72" r="17" fill="#10243C"/><circle cx="51" cy="72" r="7" fill="#B7CAD6"/>
                <circle cx="197" cy="72" r="17" fill="#10243C"/><circle cx="197" cy="72" r="7" fill="#B7CAD6"/>
              </g>
              <g transform="translate(18 17)">
                <rect width="108" height="42" rx="10" fill="#173D55" stroke="rgba(255,255,255,.15)"/>
                <circle cx="17" cy="21" r="5" fill="#67DAD5"/>
                <text x="30" y="17" fill="#A4BBCB" fontSize="8" fontWeight="700" letterSpacing="1">ESTADO</text>
                <text x="30" y="29" fill="#FFFFFF" fontSize="10" fontWeight="700">EN OPERACIÓN</text>
              </g>
            </svg>
            <div className="neo-map-destination"><span className="neo-destination-pin">↗</span><span><strong>Control integral</strong><small>De cotización a entrega</small></span></div>
          </div>
          <div className="neo-hero-orb neo-hero-orb-one" />
          <div className="neo-hero-orb neo-hero-orb-two" />
        </section>

        <section className="neo-section-block">
          <div className="neo-section-heading">
            <div><p className="neo-section-kicker">VISTA GENERAL</p><h2>Resumen operativo</h2><p>Indicadores principales de tu actividad.</p></div>
            <span className="neo-section-side-label"><span className="neo-status-dot" /> DATOS DEL SISTEMA</span>
          </div>
          <div className="neo-metrics-grid">
            {stats.map((stat) => (
              <article key={stat.titulo} className={`neo-metric-card neo-metric-${stat.tone}`}>
                <div className="neo-metric-top"><span className="neo-metric-icon"><MetricIcon kind={stat.titulo} /></span><span className="neo-metric-arrow">↗</span></div>
                <p className="neo-metric-label">{stat.titulo}</p>
                <p className="neo-metric-value">{stat.valor}</p>
                <p className="neo-metric-description">{stat.descripcion}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="neo-section-block neo-modules-section" id="modulos">
          <div className="neo-section-heading">
            <div><p className="neo-section-kicker">HERRAMIENTAS DE TRABAJO</p><h2>Tu operación, por módulos</h2><p>Accesos directos a las áreas principales de Neo.</p></div>
            <span className="neo-module-count">{modulos.length} módulos</span>
          </div>
          <div className="neo-module-grid">
            {modulos.map((modulo, index) => (
              <article className="neo-module-card" key={modulo.href}>
                <div className="neo-module-card-top"><Link href={modulo.href} aria-label={`Entrar al módulo ${modulo.titulo}`} title={`Entrar al módulo ${modulo.titulo}`} className={`neo-module-initials neo-module-initials-link neo-module-initials-${index + 1}`}>{modulo.icono}</Link><span className="neo-module-area">{modulo.area}</span></div>
                <h3>{modulo.titulo}</h3>
                <p>{modulo.descripcion}</p>
                <div className="neo-module-card-bottom"><span className="neo-module-index">0{index + 1}</span></div>
              </article>
            ))}
          </div>
        </section>

        <footer className="neo-dashboard-footer"><span>NEO TRANSPORTACIONES</span><span>Panel privado de operaciones</span></footer>
      </div>
    </main>
  );
}
