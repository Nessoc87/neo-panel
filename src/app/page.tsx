import Link from "next/link";
import { redirect } from "next/navigation";
import { getNeoHomePath, getNeoPrincipal } from "@/lib/neo-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const instant = false;

type QuoteRow = {
  id: string; cliente: string | null; servicio: string | null; estado: string;
  monto_estimado: number | string | null; created_at: string;
};
type ServiceRow = {
  id: string; cliente: string; concepto: string; total: number | string | null;
  estatus: string; factura: string | null; created_at: string;
};
type ShipmentRow = {
  id: string; servicio_id: string; estatus_operativo: string; origen: string | null;
  destino: string | null; operador: string | null; fecha_programada: string | null;
  updated_at: string;
};
type Movement = {
  id: string; type: "Cotización" | "Servicio"; title: string; detail: string;
  status: string; date: string; amount: number | null; href: string;
};

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", maximumFractionDigits: 2,
});
function money(value: unknown): string {
  const number = Number(value ?? 0);
  return currency.format(Number.isFinite(number) ? number : 0);
}
function countLabel(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("es-MX");
}
function dateLabel(value: string | null | undefined): string {
  if (!value) return "Fecha no registrada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit",
    minute: "2-digit", timeZone: "America/Monterrey",
  }).format(date);
}
function dayLabel(): string {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "America/Monterrey",
  }).format(new Date());
}
function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDIENTE: "Pendiente", EN_REVISION: "En revisión", COTIZADA: "Cotizada",
    ACEPTADA: "Aceptada", RECHAZADA: "Rechazada", CANCELADA: "Cancelada",
    FACTURADO: "Facturado", PAGADO: "Pagado", PROGRAMADO: "Programado",
    ASIGNADO: "Asignado", EN_RUTA: "En ruta", ENTREGADO: "Entregado",
    INCIDENCIA: "Incidencia",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}
function MetricIcon({ kind }: { kind: "quotes" | "shipments" | "services" | "clients" }) {
  const common = {
    width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const, "aria-hidden": true as const,
  };
  if (kind === "quotes") return <svg {...common}><path d="M7 3.5h7l4 4v13H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z"/><path d="M14 3.5v4h4M8.5 12h7M8.5 16h7"/></svg>;
  if (kind === "shipments") return <svg {...common}><path d="M2.8 5.5h11.5v11H2.8zM14.3 9h4.2l3 3.3v4.2h-7.2z"/><circle cx="7" cy="18" r="2"/><circle cx="18.2" cy="18" r="2"/></svg>;
  if (kind === "services") return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/></svg>;
  return <svg {...common}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5v-1.2a5.5 5.5 0 0 1 11 0v1.2ZM16 5.2a3.2 3.2 0 0 1 0 6.2M17 14.4a5.2 5.2 0 0 1 3.5 4.9"/></svg>;
}
function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="neo-dashboard-empty"><span className="neo-dashboard-empty-icon">✓</span><div><strong>{title}</strong><p>{description}</p></div></div>;
}

export default async function Home() {
  const principal = await getNeoPrincipal();
  if (!principal) redirect("/login");
  if (!principal.isOwner && !principal.permissions.includes("dashboard.view")) redirect(getNeoHomePath(principal));
  const canQuotes = principal.isOwner || principal.permissions.includes("quotes.view");
  const canServices = principal.isOwner || principal.permissions.includes("services.view");
  const canShipments = principal.isOwner || principal.permissions.includes("shipments.view");
  const canClients = principal.isOwner || principal.permissions.includes("clients.view");
  const canConversations = principal.isOwner || principal.permissions.includes("conversations.view");
  const canCreateQuotes = principal.isOwner || principal.permissions.includes("quotes.create");
  const canCreateServices = principal.isOwner || principal.permissions.includes("services.create");

  const [
    quotesTotalResult, quotesQuotedResult, quotesAttentionResult, clientsResult,
    pendingServicesResult, activeShipmentsResult, activeShipmentCountResult,
    incidentsCountResult, deliveredShipmentsResult, recentQuotesResult, recentServicesResult,
  ] = await Promise.all([
    supabaseAdmin.from("neo_cotizaciones").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("neo_cotizaciones").select("id", { count: "exact", head: true }).eq("estado", "COTIZADA"),
    supabaseAdmin.from("neo_cotizaciones").select("id", { count: "exact", head: true }).in("estado", ["PENDIENTE", "EN_REVISION"]),
    supabaseAdmin.from("neo_clientes").select("id", { count: "exact", head: true }).eq("activo", true),
    supabaseAdmin.from("servicios").select("id, cliente, concepto, total, estatus, factura, created_at", { count: "exact" }).eq("estatus", "PENDIENTE").order("created_at", { ascending: true }).limit(1000),
    supabaseAdmin.from("neo_envios").select("id, servicio_id, estatus_operativo, origen, destino, operador, fecha_programada, updated_at").in("estatus_operativo", ["PROGRAMADO", "ASIGNADO", "EN_RUTA", "INCIDENCIA"]).order("updated_at", { ascending: false }).limit(8),
    supabaseAdmin.from("neo_envios").select("id", { count: "exact", head: true }).in("estatus_operativo", ["PROGRAMADO", "ASIGNADO", "EN_RUTA", "INCIDENCIA"]),
    supabaseAdmin.from("neo_envios").select("id", { count: "exact", head: true }).eq("estatus_operativo", "INCIDENCIA"),
    supabaseAdmin.from("neo_envios").select("id", { count: "exact", head: true }).eq("estatus_operativo", "ENTREGADO"),
    supabaseAdmin.from("neo_cotizaciones").select("id, cliente, servicio, estado, monto_estimado, created_at").order("created_at", { ascending: false }).limit(5),
    supabaseAdmin.from("servicios").select("id, cliente, concepto, total, estatus, factura, created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  const pendingServices = canServices ? (pendingServicesResult.data ?? []) as ServiceRow[] : [];
  const activeShipments = canShipments ? (activeShipmentsResult.data ?? []) as ShipmentRow[] : [];
  const recentQuotes = canQuotes ? (recentQuotesResult.data ?? []) as QuoteRow[] : [];
  const recentServices = canServices ? (recentServicesResult.data ?? []) as ServiceRow[] : [];

  const quotesTotal = !canQuotes || quotesTotalResult.error ? null : quotesTotalResult.count ?? 0;
  const quotesQuoted = !canQuotes || quotesQuotedResult.error ? null : quotesQuotedResult.count ?? 0;
  const quotesAttention = !canQuotes || quotesAttentionResult.error ? null : quotesAttentionResult.count ?? 0;
  const activeClients = !canClients || clientsResult.error ? null : clientsResult.count ?? 0;
  const pendingServiceCount = !canServices || pendingServicesResult.error ? null : pendingServicesResult.count ?? pendingServices.length;
  const activeShipmentCount = !canShipments || activeShipmentCountResult.error ? null : activeShipmentCountResult.count ?? 0;
  const deliveredShipmentCount = !canShipments || deliveredShipmentsResult.error ? null : deliveredShipmentsResult.count ?? 0;
  const incidentsCount = !canShipments || incidentsCountResult.error ? null : incidentsCountResult.count ?? 0;
  const pendingBillingTotal = canServices ? pendingServices.reduce((sum, service) => sum + Number(service.total ?? 0), 0) : 0;

  const movements: Movement[] = [
    ...(canQuotes ? recentQuotes : []).map((quote) => ({
      id: "quote-" + quote.id, type: "Cotización" as const,
      title: quote.cliente || "Cliente sin nombre", detail: quote.servicio || "Solicitud comercial",
      status: quote.estado, date: quote.created_at,
      amount: quote.monto_estimado === null ? null : Number(quote.monto_estimado), href: "/cotizaciones",
    })),
    ...(canServices ? recentServices : []).map((service) => ({
      id: "service-" + service.id, type: "Servicio" as const,
      title: service.cliente || "Cliente sin nombre", detail: service.concepto || "Servicio registrado",
      status: service.estatus, date: service.created_at,
      amount: service.total === null ? null : Number(service.total), href: "/servicios",
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 7);

  return (
    <main className="neo-app neo-dashboard">
      <div className="neo-dashboard-content">
        <section className="neo-dashboard-welcome">
          <div className="neo-dashboard-welcome-copy">
            <p className="neo-dashboard-eyebrow-light">CENTRO DE CONTROL · NEO TRANSPORTACIONES</p>
            <h2>Resumen de operación</h2>
            <p>Consulta el estado comercial, logístico y administrativo de tu operación desde un solo lugar.</p>
            <span className="neo-dashboard-today">{dayLabel()}</span>
          </div>
          <div className="neo-dashboard-quick-actions">
            {canCreateQuotes && <Link href="/cotizaciones" className="neo-dashboard-action-primary"><span className="neo-action-symbol">＋</span>Nueva cotización</Link>}
            {canCreateServices && <Link href="/servicios" className="neo-dashboard-action-secondary"><span className="neo-action-symbol">＋</span>Registrar servicio</Link>}
          </div>
        </section>

        <section className="neo-dashboard-metrics" aria-label="Indicadores principales">
          <Link href="/cotizaciones" className="neo-dashboard-metric neo-dashboard-metric-teal">
            <div className="neo-dashboard-metric-top"><span className="neo-dashboard-metric-icon"><MetricIcon kind="quotes" /></span><span className="neo-dashboard-metric-caption">COMERCIAL</span></div>
            <p className="neo-dashboard-metric-label">Cotizaciones registradas</p>
            <p className="neo-dashboard-metric-value">{countLabel(quotesTotal)}</p>
            <p className="neo-dashboard-metric-note">{quotesQuoted === null ? "Estado no disponible" : countLabel(quotesQuoted) + " con propuesta cotizada"}</p>
          </Link>
          <Link href="/envios-activos" className="neo-dashboard-metric neo-dashboard-metric-blue">
            <div className="neo-dashboard-metric-top"><span className="neo-dashboard-metric-icon"><MetricIcon kind="shipments" /></span><span className="neo-dashboard-metric-caption">LOGÍSTICA</span></div>
            <p className="neo-dashboard-metric-label">Envíos en seguimiento</p>
            <p className="neo-dashboard-metric-value">{countLabel(activeShipmentCount)}</p>
            <p className="neo-dashboard-metric-note">{deliveredShipmentCount === null ? "Entregas no disponibles" : countLabel(deliveredShipmentCount) + " entregas completadas"}</p>
          </Link>
          <Link href="/servicios" className="neo-dashboard-metric neo-dashboard-metric-amber">
            <div className="neo-dashboard-metric-top"><span className="neo-dashboard-metric-icon"><MetricIcon kind="services" /></span><span className="neo-dashboard-metric-caption">ADMINISTRACIÓN</span></div>
            <p className="neo-dashboard-metric-label">Servicios por facturar</p>
            <p className="neo-dashboard-metric-value">{countLabel(pendingServiceCount)}</p>
            <p className="neo-dashboard-metric-note">{pendingServicesResult.error ? "Importe no disponible" : money(pendingBillingTotal) + " pendientes de facturar"}</p>
          </Link>
          <Link href="/clientes" className="neo-dashboard-metric neo-dashboard-metric-violet">
            <div className="neo-dashboard-metric-top"><span className="neo-dashboard-metric-icon"><MetricIcon kind="clients" /></span><span className="neo-dashboard-metric-caption">DIRECTORIO</span></div>
            <p className="neo-dashboard-metric-label">Clientes activos</p>
            <p className="neo-dashboard-metric-value">{countLabel(activeClients)}</p>
            <p className="neo-dashboard-metric-note">Contactos disponibles en el directorio</p>
          </Link>
        </section>

        <section className="neo-dashboard-work-grid">
          <article className="neo-dashboard-panel neo-dashboard-billing-panel">
            <div className="neo-dashboard-panel-heading">
              <div><p className="neo-dashboard-section-kicker">ADMINISTRACIÓN</p><h3>Servicios pendientes de facturar</h3><p>Registros que todavía requieren completar su proceso administrativo.</p></div>
              <Link href="/servicios" className="neo-dashboard-text-link">Ver servicios <span>↗</span></Link>
            </div>
            <div className="neo-dashboard-panel-summary">
              <div><strong>{countLabel(pendingServiceCount)}</strong><span>servicios pendientes</span></div>
              <div><strong>{pendingServicesResult.error ? "—" : money(pendingBillingTotal)}</strong><span>importe acumulado</span></div>
            </div>
            <div className="neo-dashboard-list">
              {pendingServicesResult.error ? (
                <EmptyState title="No se pudo consultar Servicios" description="Entra al módulo para revisar los registros." />
              ) : pendingServices.length === 0 ? (
                <EmptyState title="No hay servicios pendientes" description="Todos los servicios registrados ya avanzaron de etapa." />
              ) : pendingServices.slice(0, 5).map((service) => (
                <Link href="/servicios" className="neo-dashboard-list-row" key={service.id}>
                  <span className="neo-dashboard-list-icon neo-list-icon-amber">SV</span>
                  <span className="neo-dashboard-list-main"><strong>{service.cliente}</strong><small>{service.concepto}</small></span>
                  <span className="neo-dashboard-list-side"><strong>{money(service.total)}</strong><small>Factura pendiente</small></span>
                </Link>
              ))}
            </div>
            {!pendingServicesResult.error && pendingServices.length > 5 && (
              <p className="neo-dashboard-panel-footnote">Mostrando los 5 servicios más antiguos de {pendingServices.length} pendientes.</p>
            )}
          </article>

          <article className="neo-dashboard-panel neo-dashboard-logistics-panel">
            <div className="neo-dashboard-panel-heading">
              <div><p className="neo-dashboard-section-kicker">LOGÍSTICA</p><h3>Seguimiento de envíos</h3><p>Servicios con programación, asignación, ruta o incidencia.</p></div>
              <Link href="/envios-activos" className="neo-dashboard-text-link">Abrir módulo <span>↗</span></Link>
            </div>
            <div className="neo-dashboard-logistics-stats">
              <div><span className="neo-logistics-stat-dot is-active" /><strong>{countLabel(activeShipmentCount)}</strong><small>en seguimiento</small></div>
              <div><span className="neo-logistics-stat-dot is-delivered" /><strong>{countLabel(deliveredShipmentCount)}</strong><small>entregados</small></div>
              <div><span className="neo-logistics-stat-dot is-alert" /><strong>{countLabel(incidentsCount)}</strong><small>incidencias</small></div>
            </div>
            <div className="neo-dashboard-list">
              {activeShipmentsResult.error ? (
                <EmptyState title="Seguimiento no disponible" description="No se pudieron consultar los movimientos logísticos." />
              ) : activeShipments.length === 0 ? (
                <EmptyState title="Sin envíos en seguimiento" description={"Los registros consultados muestran " + countLabel(deliveredShipmentCount) + " entregas completadas y ninguna ruta abierta."} />
              ) : activeShipments.slice(0, 4).map((shipment) => (
                <Link href="/envios-activos" className="neo-dashboard-list-row" key={shipment.id}>
                  <span className={"neo-dashboard-list-icon " + (shipment.estatus_operativo === "INCIDENCIA" ? "neo-list-icon-rose" : "neo-list-icon-blue")}>EN</span>
                  <span className="neo-dashboard-list-main"><strong>{shipment.origen || "Origen pendiente"} → {shipment.destino || "Destino pendiente"}</strong><small>{shipment.operador || "Operador sin asignar"} · {dateLabel(shipment.fecha_programada)}</small></span>
                  <span className={"neo-dashboard-status " + (shipment.estatus_operativo === "INCIDENCIA" ? "is-danger" : "is-blue")}>{statusLabel(shipment.estatus_operativo)}</span>
                </Link>
              ))}
            </div>
          </article>
        </section>

        <section className="neo-dashboard-bottom-grid">
          <article className="neo-dashboard-panel neo-dashboard-activity-panel">
            <div className="neo-dashboard-panel-heading">
              <div><p className="neo-dashboard-section-kicker">MOVIMIENTOS</p><h3>Actividad reciente</h3><p>Últimas cotizaciones y servicios registrados.</p></div>
              <span className="neo-dashboard-live-tag"><span /> DATOS DEL SISTEMA</span>
            </div>
            <div className="neo-dashboard-activity-list">
              {recentQuotesResult.error || recentServicesResult.error ? (
                <EmptyState title="Actividad parcialmente disponible" description="No se pudieron consultar todos los movimientos recientes." />
              ) : movements.length === 0 ? (
                <EmptyState title="Todavía no hay movimientos" description="Cuando registres cotizaciones o servicios, aparecerán aquí." />
              ) : movements.map((movement) => (
                <Link href={movement.href} key={movement.id} className="neo-dashboard-activity-row">
                  <span className={"neo-activity-marker " + (movement.type === "Cotización" ? "is-quote" : "is-service")} />
                  <span className="neo-dashboard-activity-main"><strong>{movement.title}</strong><small>{movement.type} · {movement.detail}</small><small>{dateLabel(movement.date)}</small></span>
                  <span className="neo-dashboard-activity-side">{movement.amount === null ? "" : <strong>{money(movement.amount)}</strong>}<small>{statusLabel(movement.status)}</small></span>
                </Link>
              ))}
            </div>
          </article>

          <article className="neo-dashboard-panel neo-dashboard-attention-panel">
            <div className="neo-dashboard-panel-heading">
              <div><p className="neo-dashboard-section-kicker">ATENCIÓN AL CLIENTE</p><h3>Conversaciones de WhatsApp</h3><p>Mensajes, historial y seguimiento de clientes.</p></div>
              <span className="neo-dashboard-whatsapp-icon">WA</span>
            </div>
            <div className="neo-dashboard-attention-copy">
              <strong>Atención centralizada</strong>
              <p>Consulta la bandeja conectada a n8n para revisar mensajes, responder manualmente o devolver la atención al asistente.</p>
              <Link href="/conversaciones" className="neo-dashboard-attention-link">Abrir bandeja de conversaciones <span>→</span></Link>
            </div>
            <div className="neo-dashboard-attention-footer">
              <div><strong>{countLabel(quotesAttention)}</strong><span>cotizaciones por revisar</span></div>
              <div><strong>{countLabel(incidentsCount)}</strong><span>incidencias logísticas</span></div>
            </div>
          </article>
        </section>

        <footer className="neo-dashboard-footer"><span>NEO TRANSPORTACIONES</span><span>Centro de control operativo · Datos consultados al abrir esta pantalla</span></footer>
      </div>
    </main>
  );
}
