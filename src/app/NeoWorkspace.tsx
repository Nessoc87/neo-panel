"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

type IconName = "dashboard" | "quotes" | "shipments" | "messages" | "clients" | "services";

const navigation: { href: string; label: string; description: string; icon: IconName }[] = [
  { href: "/", label: "Panel principal", description: "Resumen de operación", icon: "dashboard" },
  { href: "/cotizaciones", label: "Cotizaciones", description: "Solicitudes y propuestas", icon: "quotes" },
  { href: "/envios-activos", label: "Envíos activos", description: "Seguimiento en ruta", icon: "shipments" },
  { href: "/conversaciones", label: "Conversaciones", description: "Atención por WhatsApp", icon: "messages" },
  { href: "/clientes", label: "Clientes", description: "Directorio comercial", icon: "clients" },
  { href: "/servicios", label: "Servicios", description: "Registro y facturación", icon: "services" },
];

const pageCopy: Record<string, { title: string; subtitle: string; eyebrow: string }> = {
  "/": {
    title: "Panel de operaciones",
    subtitle: "Vista general de la operación de Neo Transportaciones.",
    eyebrow: "CENTRO DE CONTROL",
  },
  "/cotizaciones": {
    title: "Cotizaciones",
    subtitle: "Administra solicitudes, rutas, importes y seguimiento comercial.",
    eyebrow: "VENTAS Y OPERACIÓN",
  },
  "/envios-activos": {
    title: "Envíos activos",
    subtitle: "Monitorea el avance de cada servicio, unidad y entrega.",
    eyebrow: "CONTROL LOGÍSTICO",
  },
  "/conversaciones": {
    title: "Conversaciones",
    subtitle: "Atiende a tus clientes y conserva el contexto de cada conversación.",
    eyebrow: "ATENCIÓN AL CLIENTE",
  },
  "/clientes": {
    title: "Directorio de clientes",
    subtitle: "Consulta contactos y datos comerciales en un solo lugar.",
    eyebrow: "RELACIÓN COMERCIAL",
  },
  "/servicios": {
    title: "Servicios",
    subtitle: "Administra conceptos, importes, facturas y estados de servicio.",
    eyebrow: "ADMINISTRACIÓN",
  },
};

function NavIcon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "dashboard":
      return <svg {...common}><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></svg>;
    case "quotes":
      return <svg {...common}><path d="M7 3.5h7l4 4v13H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" /><path d="M14 3.5v4h4M8.5 12h7M8.5 16h7" /></svg>;
    case "shipments":
      return <svg {...common}><path d="M2.8 5.5h11.5v11H2.8zM14.3 9h4.2l3 3.3v4.2h-7.2z" /><circle cx="7" cy="18" r="2" /><circle cx="18.2" cy="18" r="2" /><path d="M16.5 9v3.5h5" /></svg>;
    case "messages":
      return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v7a2.5 2.5 0 0 1-2.5 2.5h-7L5 19v-4.6a2.5 2.5 0 0 1-1-1.9Z" /><path d="M8 8h8M8 11.5h5" /></svg>;
    case "clients":
      return <svg {...common}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19.5v-1.2a5.5 5.5 0 0 1 11 0v1.2Z" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6.2M17 14.4a5.2 5.2 0 0 1 3.5 4.9v.2" /></svg>;
    case "services":
      return <svg {...common}><path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" /><path d="M3.5 7.5V17L12 21l8.5-4V7.5M12 12v9M7.8 5.3l8.5 4.6" /></svg>;
  }
}

export default function NeoWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!pathname || pathname === "/login" || pathname.startsWith("/api/")) {
    return <>{children}</>;
  }

  const copy = pageCopy[pathname] ?? {
    title: "Neo Transportaciones",
    subtitle: "Plataforma de gestión logística.",
    eyebrow: "OPERACIONES",
  };

  return (
    <div className="neo-workspace">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Cerrar navegación"
          className="neo-mobile-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`neo-sidebar ${mobileOpen ? "neo-sidebar-open" : ""}`} aria-label="Navegación principal">
        <Link href="/" className="neo-brand" aria-label="Neo Transportaciones, inicio" onClick={() => setMobileOpen(false)}>
          <span className="neo-brand-icon">N</span>
          <span className="neo-brand-copy">
            <strong>NEO</strong>
            <small>TRANSPORTACIONES</small>
          </span>
        </Link>

        <div className="neo-sidebar-label">ESPACIO DE TRABAJO</div>
        <nav className="neo-nav">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`neo-nav-link ${active ? "neo-nav-link-active" : ""}`}
              >
                <span className="neo-nav-icon"><NavIcon name={item.icon} /></span>
                <span className="neo-nav-label">
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
                {active && <span className="neo-nav-active-dot" />}
              </Link>
            );
          })}
        </nav>

        <div className="neo-sidebar-bottom">
          <div className="neo-system-status">
            <span className="neo-status-dot" />
            <span><strong>Panel privado</strong><small>Acceso administrativo</small></span>
          </div>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="neo-logout">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></svg>
              Cerrar sesión
            </button>
          </form>
          <p className="neo-sidebar-version">NEO · OPERACIONES LOGÍSTICAS</p>
        </div>
      </aside>

      <div className="neo-workspace-main">
        <header className="neo-topbar">
          <div className="neo-topbar-left">
            <button type="button" className="neo-mobile-menu" aria-label="Abrir navegación" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" /></svg>
            </button>
            <div>
              <p className="neo-topbar-eyebrow">{copy.eyebrow}</p>
              <h1 className="neo-topbar-title">{copy.title}</h1>
              <p className="neo-topbar-subtitle">{copy.subtitle}</p>
            </div>
          </div>
          <div className="neo-topbar-right">
            <div className="neo-live-indicator"><span className="neo-status-dot" /><span>Panel operativo</span></div>
            <div className="neo-topbar-divider" />
            <div className="neo-account-chip"><span className="neo-account-avatar">N</span><span><strong>Neo</strong><small>Administración</small></span></div>
          </div>
        </header>
        <div className="neo-workspace-content">{children}</div>
      </div>
    </div>
  );
}
