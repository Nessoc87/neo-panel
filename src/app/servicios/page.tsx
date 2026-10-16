"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import * as XLSX from "xlsx";

type Estatus = "PENDIENTE" | "FACTURADO" | "PAGADO" | "CANCELADO";

type Servicio = {
  id: string;
  cliente: string;
  factura: string | null;
  cantidad: number | string;
  concepto: string;
  costo_unitario: number | string;
  iva_porcentaje: number | string;
  retencion_porcentaje: number | string;
  subtotal: number | string;
  iva: number | string;
  retencion: number | string;
  total: number | string;
  observaciones: string | null;
  estatus: Estatus;
  paquete: string | null;
  fecha_entrega: string | null;
  fecha_pago: string | null;
  comentarios: string | null;
  created_at: string;
  updated_at: string;
};

type Formulario = {
  cliente: string;
  factura: string;
  cantidad: string;
  concepto: string;
  costo_unitario: string;
  iva_porcentaje: string;
  retencion_porcentaje: string;
  observaciones: string;
  estatus: Estatus;
  paquete: string;
  fecha_entrega: string;
  fecha_pago: string;
  comentarios: string;
};

type Respuesta = {
  ok?: boolean;
  message?: string;
  data?: Servicio | Servicio[];
};

const formularioVacio: Formulario = {
  cliente: "",
  factura: "",
  cantidad: "1",
  concepto: "",
  costo_unitario: "0",
  iva_porcentaje: "16",
  retencion_porcentaje: "0",
  observaciones: "",
  estatus: "PENDIENTE",
  paquete: "",
  fecha_entrega: "",
  fecha_pago: "",
  comentarios: "",
};

const estatusOpciones: Estatus[] = [
  "PENDIENTE",
  "FACTURADO",
  "PAGADO",
  "CANCELADO",
];

const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const claseCampo =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100";
const claseEtiqueta = "block text-sm font-semibold text-slate-700";

function numero(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function dinero(valor: unknown): string {
  return moneda.format(numero(valor));
}

function fechaMostrar(valor: string | null | undefined): string {
  if (!valor) return "—";
  const partes = valor.slice(0, 10).split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : valor;
}

function diasEntrega(valor: string | null): string {
  if (!valor) return "—";
  const fecha = new Date(`${valor.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return "—";
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.floor((hoy.getTime() - fecha.getTime()) / 86400000);
  if (dias < 0) return `En ${Math.abs(dias)} días`;
  if (dias === 0) return "Hoy";
  return `Hace ${dias} días`;
}

function textoEstatus(estatus: Estatus): string {
  const nombres: Record<Estatus, string> = {
    PENDIENTE: "Pendiente",
    FACTURADO: "Facturado",
    PAGADO: "Pagado",
    CANCELADO: "Cancelado",
  };
  return nombres[estatus] ?? estatus;
}

function claseEstatus(estatus: Estatus): string {
  const clases: Record<Estatus, string> = {
    PENDIENTE: "bg-amber-100 text-amber-800",
    FACTURADO: "bg-sky-100 text-sky-800",
    PAGADO: "bg-emerald-100 text-emerald-800",
    CANCELADO: "bg-rose-100 text-rose-800",
  };
  return clases[estatus] ?? "bg-slate-100 text-slate-700";
}

function aFormulario(s: Servicio): Formulario {
  return {
    cliente: s.cliente ?? "",
    factura: s.factura ?? "",
    cantidad: String(s.cantidad ?? 1),
    concepto: s.concepto ?? "",
    costo_unitario: String(s.costo_unitario ?? 0),
    iva_porcentaje: String(s.iva_porcentaje ?? 16),
    retencion_porcentaje: String(s.retencion_porcentaje ?? 0),
    observaciones: s.observaciones ?? "",
    estatus: s.estatus ?? "PENDIENTE",
    paquete: s.paquete ?? "",
    fecha_entrega: s.fecha_entrega?.slice(0, 10) ?? "",
    fecha_pago: s.fecha_pago?.slice(0, 10) ?? "",
    comentarios: s.comentarios ?? "",
  };
}

export default function ServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [form, setForm] = useState<Formulario>(formularioVacio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState("TODOS");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const cargarServicios = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch("/api/servicios", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Respuesta;
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok || !json.ok || !Array.isArray(json.data)) {
        throw new Error(json.message || "No fue posible cargar los servicios.");
      }
      setServicios(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los servicios.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarServicios();
  }, [cargarServicios]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase("es-MX");
    return servicios.filter((s) => {
      const estadoOK = filtroEstatus === "TODOS" || s.estatus === filtroEstatus;
      const contenido = [s.cliente, s.factura, s.concepto, s.paquete, s.observaciones, s.comentarios, s.estatus]
        .filter(Boolean).join(" ").toLocaleLowerCase("es-MX");
      return estadoOK && contenido.includes(q);
    });
  }, [servicios, busqueda, filtroEstatus]);

  const resumen = useMemo(() => ({
    cantidad: servicios.length,
    pendientes: servicios.filter((s) => s.estatus === "PENDIENTE").length,
    facturados: servicios.filter((s) => s.estatus === "FACTURADO").length,
    pagados: servicios.filter((s) => s.estatus === "PAGADO").length,
    total: servicios.filter((s) => s.estatus !== "CANCELADO").reduce((suma, s) => suma + numero(s.total), 0),
  }), [servicios]);

  const subtotal = numero(form.cantidad) * numero(form.costo_unitario);
  const iva = subtotal * numero(form.iva_porcentaje) / 100;
  const retencion = subtotal * numero(form.retencion_porcentaje) / 100;
  const total = subtotal + iva - retencion;

  function cambiar<K extends keyof Formulario>(clave: K, valor: Formulario[K]) {
    setForm((anterior) => ({ ...anterior, [clave]: valor }));
  }

  function editar(s: Servicio) {
    setEditandoId(s.id);
    setForm(aFormulario(s));
    setError("");
    setMensaje("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(formularioVacio);
    setError("");
    setMensaje("");
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setGuardando(true);
    setError("");
    setMensaje("");
    try {
      const body = {
        ...(editandoId ? { id: editandoId } : {}),
        cliente: form.cliente,
        factura: form.factura,
        cantidad: Number(form.cantidad),
        concepto: form.concepto,
        costo_unitario: Number(form.costo_unitario),
        iva_porcentaje: Number(form.iva_porcentaje),
        retencion_porcentaje: Number(form.retencion_porcentaje),
        observaciones: form.observaciones,
        estatus: form.estatus,
        paquete: form.paquete,
        fecha_entrega: form.fecha_entrega || null,
        fecha_pago: form.fecha_pago || null,
        comentarios: form.comentarios,
      };
      const res = await fetch("/api/servicios", {
        method: editandoId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Respuesta;
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok || !json.ok) {
        throw new Error(json.message || "No fue posible guardar el servicio.");
      }
      const texto = editandoId ? "Servicio actualizado correctamente." : "Servicio registrado correctamente.";
      setEditandoId(null);
      setForm(formularioVacio);
      await cargarServicios();
      setMensaje(texto);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar el servicio.");
    } finally {
      setGuardando(false);
    }
  }

  function exportarExcel() {
    const filas = filtrados.map((s) => ({
      Cliente: s.cliente,
      Factura: s.factura ?? "",
      Cantidad: numero(s.cantidad),
      Concepto: s.concepto,
      "Costo unitario": numero(s.costo_unitario),
      Subtotal: numero(s.subtotal),
      "IVA (%)": numero(s.iva_porcentaje),
      IVA: numero(s.iva),
      "Retención (%)": numero(s.retencion_porcentaje),
      Retención: numero(s.retencion),
      Total: numero(s.total),
      Estatus: textoEstatus(s.estatus),
      Paquete: s.paquete ?? "",
      "Fecha de entrega": s.fecha_entrega ?? "",
      "Fecha de pago": s.fecha_pago ?? "",
      Observaciones: s.observaciones ?? "",
      Comentarios: s.comentarios ?? "",
      "Fecha de registro": s.created_at ?? "",
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja["!cols"] = [
      { wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 35 }, { wch: 17 },
      { wch: 17 }, { wch: 12 }, { wch: 17 }, { wch: 16 }, { wch: 17 },
      { wch: 17 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 18 },
      { wch: 35 }, { wch: 35 }, { wch: 22 },
    ];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Servicios");
    XLSX.writeFile(libro, `neo-servicios-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-slate-900 px-4 py-5 text-white sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <a href="/" className="text-xl font-bold">NEO</a>
            <p className="text-sm text-slate-300">TRANSPORTACIONES</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            <a href="/" className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Panel principal</a>
            <a href="/conversaciones" className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Conversaciones</a>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Cerrar sesión</button>
            </form>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
        <section className="rounded-3xl bg-gradient-to-r from-slate-900 to-cyan-800 p-6 text-white sm:p-8">
          <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">ADMINISTRACIÓN</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Servicios</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
            Administra los servicios de todos tus clientes desde una sola tabla. Registra importes, facturas, fechas de entrega y pagos, consulta el estado y exporta los resultados a Excel.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { titulo: "Servicios registrados", valor: String(resumen.cantidad), clase: "text-slate-900" },
            { titulo: "Pendientes", valor: String(resumen.pendientes), clase: "text-amber-700" },
            { titulo: "Facturados", valor: String(resumen.facturados), clase: "text-sky-700" },
            { titulo: "Total no cancelado", valor: dinero(resumen.total), clase: "text-emerald-700" },
          ].map((tarjeta) => (
            <article key={tarjeta.titulo} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{tarjeta.titulo}</p>
              <p className={`mt-2 break-words text-2xl font-bold ${tarjeta.clase}`}>{tarjeta.valor}</p>
              {tarjeta.titulo === "Total no cancelado" && <p className="mt-1 text-xs text-slate-500">{resumen.pagados} servicio(s) pagado(s)</p>}
            </article>
          ))}
        </section>

        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-semibold">No se pudo completar la operación</p><p className="mt-1">{error}</p></div>}
        {mensaje && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{mensaje}</div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{editandoId ? "Editar servicio" : "Registrar servicio"}</h2>
              <p className="mt-1 text-sm text-slate-500">Los campos con * son obligatorios.</p>
            </div>
            {editandoId && <button type="button" onClick={cancelarEdicion} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancelar edición</button>}
          </div>

          <form onSubmit={guardar} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className={claseEtiqueta}>Cliente *
                <input className={claseCampo} value={form.cliente} onChange={(e) => cambiar("cliente", e.target.value)} placeholder="Nombre del cliente o empresa" maxLength={200} required />
              </label>
              <label className={claseEtiqueta}>Número de factura
                <input className={claseCampo} value={form.factura} onChange={(e) => cambiar("factura", e.target.value)} placeholder="Ej. FAC-001" maxLength={100} />
              </label>
              <label className={claseEtiqueta}>Paquete o referencia
                <input className={claseCampo} value={form.paquete} onChange={(e) => cambiar("paquete", e.target.value)} placeholder="Nombre o referencia" maxLength={200} />
              </label>
              <label className={claseEtiqueta}>Concepto del servicio *
                <input className={claseCampo} value={form.concepto} onChange={(e) => cambiar("concepto", e.target.value)} placeholder="Describe el servicio" maxLength={1000} required />
              </label>
              <label className={claseEtiqueta}>Cantidad *
                <input className={claseCampo} type="number" value={form.cantidad} onChange={(e) => cambiar("cantidad", e.target.value)} min="0.01" step="any" required />
              </label>
              <label className={claseEtiqueta}>Costo unitario (MXN) *
                <input className={claseCampo} type="number" value={form.costo_unitario} onChange={(e) => cambiar("costo_unitario", e.target.value)} min="0" step="0.01" required />
              </label>
              <label className={claseEtiqueta}>IVA (%)
                <input className={claseCampo} type="number" value={form.iva_porcentaje} onChange={(e) => cambiar("iva_porcentaje", e.target.value)} min="0" max="100" step="0.01" required />
              </label>
              <label className={claseEtiqueta}>Retención (%)
                <input className={claseCampo} type="number" value={form.retencion_porcentaje} onChange={(e) => cambiar("retencion_porcentaje", e.target.value)} min="0" max="100" step="0.01" required />
              </label>
              <label className={claseEtiqueta}>Estatus
                <select className={claseCampo} value={form.estatus} onChange={(e) => cambiar("estatus", e.target.value as Estatus)}>
                  {estatusOpciones.map((opcion) => <option key={opcion} value={opcion}>{textoEstatus(opcion)}</option>)}
                </select>
              </label>
              <label className={claseEtiqueta}>Fecha de entrega
                <input className={claseCampo} type="date" value={form.fecha_entrega} onChange={(e) => cambiar("fecha_entrega", e.target.value)} />
              </label>
              <label className={claseEtiqueta}>Fecha de pago
                <input className={claseCampo} type="date" value={form.fecha_pago} onChange={(e) => cambiar("fecha_pago", e.target.value)} />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={claseEtiqueta}>Observaciones
                <textarea className={claseCampo} value={form.observaciones} onChange={(e) => cambiar("observaciones", e.target.value)} rows={3} placeholder="Notas internas sobre el servicio" />
              </label>
              <label className={claseEtiqueta}>Comentarios
                <textarea className={claseCampo} value={form.comentarios} onChange={(e) => cambiar("comentarios", e.target.value)} rows={3} placeholder="Seguimiento, acuerdos o información adicional" />
              </label>
            </div>

            <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
              <h3 className="font-bold text-slate-800">Vista previa de importes</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs text-slate-500">Subtotal</p><p className="mt-1 font-semibold">{dinero(subtotal)}</p></div>
                <div><p className="text-xs text-slate-500">IVA</p><p className="mt-1 font-semibold">{dinero(iva)}</p></div>
                <div><p className="text-xs text-slate-500">Retención</p><p className="mt-1 font-semibold">{dinero(retencion)}</p></div>
                <div><p className="text-xs text-slate-500">Total estimado</p><p className="mt-1 text-xl font-bold text-cyan-900">{dinero(total)}</p></div>
              </div>
              <p className="mt-3 text-xs text-slate-500">Vista previa: subtotal más IVA menos retención. El total guardado lo calcula la base de datos.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={guardando} className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-cyan-800 disabled:opacity-60">
                {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Registrar servicio"}
              </button>
              {editandoId && <button type="button" onClick={cancelarEdicion} disabled={guardando} className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold hover:bg-slate-50">Descartar cambios</button>}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="text-xl font-bold">Registro de servicios</h2><p className="mt-1 text-sm text-slate-500">Consulta, filtra y edita los registros almacenados.</p></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void cargarServicios()} disabled={cargando} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">{cargando ? "Actualizando..." : "Actualizar"}</button>
              <button type="button" onClick={exportarExcel} disabled={filtrados.length === 0} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Exportar Excel</button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className={claseEtiqueta}>Buscar
              <input className={claseCampo} type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Cliente, factura, concepto o paquete" />
            </label>
            <label className={claseEtiqueta}>Filtrar por estatus
              <select className={claseCampo} value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value)}>
                <option value="TODOS">Todos los estatus</option>
                {estatusOpciones.map((opcion) => <option key={opcion} value={opcion}>{textoEstatus(opcion)}</option>)}
              </select>
            </label>
          </div>
          <p className="mt-4 text-sm text-slate-500">Mostrando {filtrados.length} de {servicios.length} servicio(s).</p>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1350px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-900 text-white"><tr>
                <th className="px-4 py-3">Cliente / factura</th><th className="px-4 py-3">Concepto</th><th className="px-4 py-3 text-right">Cantidad</th><th className="px-4 py-3 text-right">Costo unitario</th><th className="px-4 py-3 text-right">Subtotal</th><th className="px-4 py-3 text-right">IVA</th><th className="px-4 py-3 text-right">Retención</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Entrega / antigüedad</th><th className="px-4 py-3">Pago</th><th className="px-4 py-3">Estatus</th><th className="px-4 py-3">Detalles</th><th className="px-4 py-3">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {cargando ? (
                  <tr><td colSpan={13} className="px-4 py-12 text-center text-slate-500">Cargando servicios...</td></tr>
                ) : filtrados.length === 0 ? (
                  <tr><td colSpan={13} className="px-4 py-12 text-center text-slate-500">{servicios.length === 0 ? "Todavía no hay servicios registrados." : "No hay servicios que coincidan con los filtros."}</td></tr>
                ) : filtrados.map((s) => (
                  <tr key={s.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-4"><p className="font-bold text-slate-900">{s.cliente}</p><p className="mt-1 text-xs text-slate-500">Factura: {s.factura || "Sin factura"}</p>{s.paquete && <p className="mt-1 text-xs text-slate-500">Ref.: {s.paquete}</p>}</td>
                    <td className="max-w-xs px-4 py-4">{s.concepto}</td>
                    <td className="px-4 py-4 text-right">{numero(s.cantidad).toLocaleString("es-MX")}</td>
                    <td className="px-4 py-4 text-right">{dinero(s.costo_unitario)}</td>
                    <td className="px-4 py-4 text-right">{dinero(s.subtotal)}</td>
                    <td className="px-4 py-4 text-right"><p>{dinero(s.iva)}</p><p className="mt-1 text-xs text-slate-500">{numero(s.iva_porcentaje)}%</p></td>
                    <td className="px-4 py-4 text-right"><p>{dinero(s.retencion)}</p><p className="mt-1 text-xs text-slate-500">{numero(s.retencion_porcentaje)}%</p></td>
                    <td className="px-4 py-4 text-right font-bold">{dinero(s.total)}</td>
                    <td className="px-4 py-4"><p>{fechaMostrar(s.fecha_entrega)}</p><p className="mt-1 text-xs text-slate-500">{diasEntrega(s.fecha_entrega)}</p></td>
                    <td className="px-4 py-4">{fechaMostrar(s.fecha_pago)}</td>
                    <td className="px-4 py-4"><span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${claseEstatus(s.estatus)}`}>{textoEstatus(s.estatus)}</span></td>
                    <td className="max-w-xs px-4 py-4">{s.observaciones && <p className="mb-2 whitespace-pre-wrap text-xs text-slate-600"><strong>Observaciones: </strong>{s.observaciones}</p>}{s.comentarios && <p className="whitespace-pre-wrap text-xs text-slate-600"><strong>Comentarios: </strong>{s.comentarios}</p>}{!s.observaciones && !s.comentarios && <span className="text-xs text-slate-400">Sin detalles</span>}</td>
                    <td className="px-4 py-4"><button type="button" onClick={() => editar(s)} className="rounded-lg border border-cyan-200 px-3 py-2 text-xs font-bold text-cyan-800 hover:bg-cyan-50">Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">En pantallas pequeñas puedes deslizar la tabla horizontalmente. Exportar Excel descarga los resultados que coinciden con los filtros actuales.</p>
        </section>

        <footer className="pb-5 text-center text-xs text-slate-400">Neo Transportaciones · Panel privado</footer>
      </div>
    </main>
  );
}
