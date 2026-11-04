"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { generarPdfCotizacion } from "@/lib/generarPdfCotizacion";

type PartidaGuardada = {
  descripcion: string; cantidad: number | string; precio_unitario: number | string;
  iva_porcentaje?: number | string; retencion_porcentaje?: number | string;
  subtotal?: number | string; iva?: number | string; retencion?: number | string; total?: number | string;
};
type Cotizacion = {
  id: string; folio?: string | null; cliente_id: string | null; cliente: string;
  contacto?: string | null; telefono: string | null; servicio: string;
  origen: string | null; destino: string | null; mercancia: string | null; peso: string | null;
  tipo_unidad: string | null; tipo_flete: string | null; fecha_servicio: string | null;
  monto_estimado: number | string | null; subtotal?: number | string | null;
  iva?: number | string | null; retencion?: number | string | null; total?: number | string | null;
  partidas?: PartidaGuardada[] | null; vigencia_dias?: number | null; condiciones?: string | null;
  estado: string; notas: string | null; created_at: string;
};
type Cliente = { id: string; nombre: string; telefono?: string | null; activo?: boolean };
type PartidaForm = {
  id: string; descripcion: string; cantidad: string; precio_unitario: string;
  iva_porcentaje: string; retencion_porcentaje: string;
};
type Form = {
  cliente_id: string; cliente: string; contacto: string; telefono: string; servicio: string;
  origen: string; destino: string; mercancia: string; peso: string; tipo_unidad: string;
  tipo_flete: string; fecha_servicio: string; estado: string; notas: string;
  vigencia_dias: string; condiciones: string; partidas: PartidaForm[];
};

const condicionesIniciales = [
  "• Vigencia: esta propuesta es válida durante 15 días naturales a partir de su fecha de emisión.",
  "• Confirmación: la programación del servicio está sujeta a disponibilidad y a la aceptación por escrito de esta cotización.",
  "• Información del servicio: el cliente debe proporcionar datos completos y correctos sobre mercancía, peso, dimensiones, origen, destino, horarios, accesos y requisitos especiales.",
  "• Alcance y cargos adicionales: maniobras, esperas, casetas, almacenajes, cambios de ruta, kilómetros adicionales o segundos intentos que no estén incluidos en esta propuesta se cotizarán por separado y requerirán autorización del cliente antes de realizarse.",
  "• Programación: las fechas y horarios se confirman al aceptar el servicio. Cualquier ajuste estará sujeto a disponibilidad operativa.",
  "• Cambios y cancelaciones: deberán solicitarse con al menos 24 horas de anticipación. Los gastos o trabajos ya realizados y los compromisos no recuperables podrán cobrarse, previa justificación.",
  "• Recepción y entrega: se podrá solicitar nombre y firma de quien recibe, así como evidencia razonable de recolección o entrega.",
].join("\n");

const crearPartida = (): PartidaForm => ({
  id: "partida-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
  descripcion: "", cantidad: "1", precio_unitario: "", iva_porcentaje: "16", retencion_porcentaje: "0",
});
const nuevoFormulario = (): Form => ({
  cliente_id: "", cliente: "", contacto: "", telefono: "", servicio: "Cotización",
  origen: "", destino: "", mercancia: "", peso: "", tipo_unidad: "", tipo_flete: "",
  fecha_servicio: "", estado: "PENDIENTE", notas: "", vigencia_dias: "15",
  condiciones: condicionesIniciales, partidas: [crearPartida()],
});
const estados = [
  ["PENDIENTE", "Pendiente"], ["EN_REVISION", "En revisión"], ["COTIZADA", "Cotizada"],
  ["ACEPTADA", "Aceptada"], ["RECHAZADA", "Rechazada"], ["CANCELADA", "Cancelada"],
];
const campo = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100";
const etiqueta = "block text-sm font-semibold text-slate-700";
const dinero = (v: unknown) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(Number(v || 0));
const redondear = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const fecha = (v: string | null) => {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? v + "T00:00:00" : v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-MX");
};
function estadoClase(estado: string) {
  if (estado === "ACEPTADA") return "bg-emerald-100 text-emerald-800";
  if (estado === "RECHAZADA" || estado === "CANCELADA") return "bg-rose-100 text-rose-800";
  if (estado === "COTIZADA") return "bg-sky-100 text-sky-800";
  if (estado === "EN_REVISION") return "bg-violet-100 text-violet-800";
  return "bg-amber-100 text-amber-800";
}

function detalleError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) || String(error);
  } catch {
    return String(error);
  }
}

export default function CotizacionesClient() {
  const [items, setItems] = useState<Cotizacion[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [form, setForm] = useState<Form>(nuevoFormulario());
  const [editando, setEditando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("TODOS");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [pdfId, setPdfId] = useState<string | null>(null);\n  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ultimaCotizacion, setUltimaCotizacion] = useState<Cotizacion | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/cotizaciones", { cache: "no-store" }),
        fetch("/api/clientes", { cache: "no-store" }),
      ]);
      const j1 = await r1.json();
      const j2 = await r2.json();
      if (r1.status === 401 || r2.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!r1.ok || j1.ok !== true || !Array.isArray(j1.data)) {
        throw new Error(j1.message || "No se pudieron cargar cotizaciones.");
      }
      setItems(j1.data);
      setClientes(r2.ok && j2.ok === true && Array.isArray(j2.data) ? j2.data.filter((c: Cliente) => c.activo) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando cotizaciones.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(cargar); }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return items.filter((c) =>
      (filtro === "TODOS" || c.estado === filtro) &&
      [c.folio, c.cliente, c.contacto, c.telefono, c.origen, c.destino, c.servicio, c.mercancia, c.estado]
        .filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [items, busqueda, filtro]);

  const calculos = useMemo(() => form.partidas.map((p) => {
    const cantidad = Number(p.cantidad) || 0;
    const precio = Number(p.precio_unitario) || 0;
    const ivaPct = Number(p.iva_porcentaje) || 0;
    const retPct = Number(p.retencion_porcentaje) || 0;
    const subtotal = redondear(cantidad * precio);
    const iva = redondear(subtotal * ivaPct / 100);
    const retencion = redondear(subtotal * retPct / 100);
    return { ...p, subtotal, iva, retencion, total: redondear(subtotal + iva - retencion) };
  }), [form.partidas]);

  const totales = useMemo(() => ({
    subtotal: redondear(calculos.reduce((sum, p) => sum + p.subtotal, 0)),
    iva: redondear(calculos.reduce((sum, p) => sum + p.iva, 0)),
    retencion: redondear(calculos.reduce((sum, p) => sum + p.retencion, 0)),
    total: redondear(calculos.reduce((sum, p) => sum + p.total, 0)),
  }), [calculos]);

  function nuevo() {
    setForm(nuevoFormulario());
    setEditando(null);
    setAbierto(true);
    setError("");
    setMensaje("");
    setUltimaCotizacion(null);
  }

  function editar(c: Cotizacion) {
    const partidas = Array.isArray(c.partidas) && c.partidas.length
      ? c.partidas.map((p, index) => ({
          id: "guardada-" + c.id + "-" + index,
          descripcion: p.descripcion || "",
          cantidad: String(p.cantidad ?? 1),
          precio_unitario: String(p.precio_unitario ?? ""),
          iva_porcentaje: String(p.iva_porcentaje ?? 0),
          retencion_porcentaje: String(p.retencion_porcentaje ?? 0),
        }))
      : [{
          ...crearPartida(),
          descripcion: c.servicio || "Servicio cotizado",
          cantidad: "1",
          precio_unitario: String(c.monto_estimado ?? ""),
          iva_porcentaje: "0",
          retencion_porcentaje: "0",
        }];

    setForm({
      cliente_id: c.cliente_id || "", cliente: c.cliente || "", contacto: c.contacto || "",
      telefono: c.telefono || "", servicio: c.servicio || "Flete", origen: c.origen || "",
      destino: c.destino || "", mercancia: c.mercancia || "", peso: c.peso || "",
      tipo_unidad: c.tipo_unidad || "", tipo_flete: c.tipo_flete || "",
      fecha_servicio: c.fecha_servicio || "", estado: c.estado || "PENDIENTE",
      notas: c.notas || "", vigencia_dias: String(c.vigencia_dias || 15),
      condiciones: c.condiciones || condicionesIniciales, partidas,
    });
    setEditando(c.id);
    setAbierto(true);
    setError("");
    setMensaje("");
    setUltimaCotizacion(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cambiarCampo<K extends Exclude<keyof Form, "partidas">>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function actualizarPartida(id: string, patch: Partial<PartidaForm>) {
    setForm((prev) => ({
      ...prev,
      partidas: prev.partidas.map((p) => p.id === id ? { ...p, ...patch } : p),
    }));
  }
  function agregarPartida() {
    setForm((prev) => ({ ...prev, partidas: [...prev.partidas, crearPartida()] }));
  }
  function quitarPartida(id: string) {
    setForm((prev) => prev.partidas.length <= 1 ? prev : {
      ...prev, partidas: prev.partidas.filter((p) => p.id !== id),
    });
  }

  async function descargarPdf(c: Cotizacion) {
    setPdfId(c.id);
    setError("");
    try {
      await generarPdfCotizacion(c);
      setMensaje("PDF de " + (c.folio || "la cotización") + " descargado correctamente.");
    } catch (e) {
      console.error("Error generando el PDF de cotización:", e);
      setMensaje("");
      setError("No se pudo generar el PDF: " + detalleError(e));
    } finally {
      setPdfId(null);
    }
  }

  async function eliminar(c: Cotizacion) {
    const folio = c.folio || "sin folio";
    const confirmado = window.confirm(
      "¿Eliminar definitivamente la cotización " + folio + " de " + c.cliente +
      "? Esta acción no se puede deshacer. El consecutivo no se reiniciará ni se reutilizará."
    );
    if (!confirmado) return;

    setEliminandoId(c.id);
    setError("");
    setMensaje("");
    try {
      const response = await fetch("/api/cotizaciones?id=" + encodeURIComponent(c.id), {
        method: "DELETE",
        cache: "no-store",
      });
      const json = await response.json();

      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok || json.ok !== true) {
        throw new Error(json.message || "No se pudo eliminar la cotización.");
      }

      setItems((current) => current.filter((item) => item.id !== c.id));
      setUltimaCotizacion((current) => current?.id === c.id ? null : current);
      setMensaje("Cotización " + folio + " eliminada. El consecutivo se conserva y el siguiente folio no cambia.");
    } catch (deleteError) {
      console.error("Error eliminando cotización:", deleteError);
      setError(detalleError(deleteError));
    } finally {
      setEliminandoId(null);
    }
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.cliente.trim()) {
      setError("Indica el nombre del cliente o prospecto.");
      return;
    }
    if (!form.servicio.trim()) {
      setError("Selecciona el tipo de servicio.");
      return;
    }
    if (form.partidas.length < 1 || form.partidas.some((p) =>
      !p.descripcion.trim() || Number(p.cantidad) <= 0 || p.precio_unitario === "" ||
      Number(p.precio_unitario) < 0 || Number(p.iva_porcentaje) < 0 || Number(p.iva_porcentaje) > 100 ||
      Number(p.retencion_porcentaje) < 0 || Number(p.retencion_porcentaje) > 100
    )) {
      setError("Completa la descripción, cantidad, precio e impuestos de cada partida. Debe existir al menos una partida.");
      return;
    }

    setGuardando(true);
    setError("");
    setMensaje("");
    try {
      const payload = {
        ...form,
        partidas: calculos.map((p) => ({
          descripcion: p.descripcion.trim(),
          cantidad: Number(p.cantidad),
          precio_unitario: Number(p.precio_unitario),
          iva_porcentaje: Number(p.iva_porcentaje),
          retencion_porcentaje: Number(p.retencion_porcentaje),
        })),
        subtotal: totales.subtotal, iva: totales.iva, retencion: totales.retencion,
        total: totales.total, monto_estimado: totales.total,
        vigencia_dias: Number(form.vigencia_dias),
        cliente_id: form.cliente_id || null,
        origen_registro: editando ? undefined : "PANEL",
        id: editando,
      };
      const res = await fetch("/api/cotizaciones", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok || json.ok !== true || !json.data) {
        throw new Error(json.message || "No se pudo guardar la cotización.");
      }

      const guardada = json.data as Cotizacion;
      const esNueva = !editando;
      setUltimaCotizacion(guardada);
      setAbierto(false);
      setEditando(null);
      setForm(nuevoFormulario());
      setMensaje(esNueva ? "Cotización guardada. Se está preparando el PDF." : "Cotización actualizada correctamente.");
      await cargar();

      if (esNueva) {
        try {
          await generarPdfCotizacion(guardada);
          setMensaje("Cotización " + (guardada.folio || "") + " guardada y PDF descargado.");
        } catch (pdfError) {
          console.error("La cotización se guardó, pero falló la generación del PDF:", pdfError);
          setMensaje("La cotización " + (guardada.folio || "") + " se guardó correctamente.");
          setError("No se pudo generar el PDF: " + detalleError(pdfError) + ". Puedes volver a intentarlo con el botón «Descargar PDF».");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando cotización.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <main className="neo-app min-h-screen bg-slate-100 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 px-5 py-5 text-white sm:px-8">
        <div><p className="text-xl font-bold">NEO</p><p className="text-xs tracking-wider text-slate-300">TRANSPORTACIONES</p></div>
        <div className="flex flex-wrap gap-2">
          <Link href="/" className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Volver al panel</Link>
          <Link href="/servicios" className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-200">Servicios</Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-4 sm:p-8">
        <section className="rounded-3xl bg-gradient-to-r from-slate-900 to-cyan-800 p-6 text-white sm:p-9">
          <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">VENTAS Y OPERACIÓN</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Cotizaciones</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">Prepara propuestas profesionales, agrega una o varias partidas y descarga el documento PDF para compartirlo con tu cliente.</p>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Total", items.length],
            ["Pendientes", items.filter((c) => c.estado === "PENDIENTE").length],
            ["Por revisar", items.filter((c) => c.estado === "EN_REVISION").length],
            ["Aceptadas", items.filter((c) => c.estado === "ACEPTADA").length],
          ].map((x) => (
            <article key={String(x[0])} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-slate-500">{x[0]}</p><p className="mt-2 text-3xl font-bold">{x[1]}</p>
            </article>
          ))}
        </section>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Registro de cotizaciones</h2>
          <button type="button" onClick={nuevo} className="rounded-xl bg-cyan-700 px-5 py-3 text-sm font-bold text-white hover:bg-cyan-800">+ Nueva cotización</button>
        </div>

        {mensaje && (
          <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <span>{mensaje}</span>
            {ultimaCotizacion && (
              <button type="button" onClick={() => void descargarPdf(ultimaCotizacion)} disabled={pdfId === ultimaCotizacion.id} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                {pdfId === ultimaCotizacion.id ? "Preparando PDF..." : "Descargar PDF"}
              </button>
            )}
          </div>
        )}
        {error && <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

        {abierto && (
          <form onSubmit={guardar} className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold tracking-[0.15em] text-cyan-700">{editando ? "ACTUALIZAR PROPUESTA" : "NUEVA PROPUESTA"}</p>
                <h3 className="mt-1 text-xl font-bold">{editando ? "Editar cotización" : "Preparar cotización"}</h3>
                <p className="mt-1 text-sm text-slate-500">Completa los datos y agrega todas las partidas que necesites.</p>
              </div>
              <button type="button" onClick={() => setAbierto(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">Cancelar</button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className={etiqueta}>
                Cliente *
                <input
                  required
                  list="neo-clientes-disponibles"
                  value={form.cliente}
                  onChange={(e) => {
                    const nombre = e.target.value;
                    const existente = clientes.find((c) => c.nombre.trim().toLocaleLowerCase() === nombre.trim().toLocaleLowerCase());
                    setForm((prev) => ({
                      ...prev,
                      cliente: nombre,
                      cliente_id: existente?.id || "",
                      telefono: existente?.telefono || "",
                    }));
                  }}
                  className={campo}
                  placeholder="Nombre del cliente"
                  maxLength={200}
                />
                <datalist id="neo-clientes-disponibles">
                  {clientes.map((c) => <option key={c.id} value={c.nombre} />)}
                </datalist>
              </label>

              <label className={etiqueta}>
                Contacto
                <input
                  value={form.contacto}
                  onChange={(e) => cambiarCampo("contacto", e.target.value)}
                  className={campo}
                  placeholder="Persona responsable"
                  maxLength={200}
                />
              </label>

              <label className={etiqueta}>
                Fecha
                <input
                  type="date"
                  value={form.fecha_servicio}
                  onChange={(e) => cambiarCampo("fecha_servicio", e.target.value)}
                  className={campo}
                />
              </label>

              <label className={etiqueta}>
                Número de cotización
                <input
                  readOnly
                  value={editando ? (items.find((c) => c.id === editando)?.folio || "Se asigna al guardar") : "Se asigna al guardar"}
                  className={campo + " cursor-not-allowed bg-slate-50 font-semibold text-slate-500"}
                  aria-label="Número de cotización asignado automáticamente"
                />
              </label>
            </div>

            <section className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-lg font-bold text-slate-900">Partidas de la cotización</h4>
                  <p className="mt-1 text-sm text-slate-500">Agrega uno o varios conceptos. Los impuestos y los totales se calculan por partida.</p>
                </div>
                <button type="button" onClick={agregarPartida} className="rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-800">+ Agregar partida</button>
              </div>

              <div className="mt-4 space-y-4">
                {calculos.map((p, index) => (
                  <article key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-50 text-sm font-extrabold text-cyan-800">{index + 1}</span>
                        <div><p className="font-bold text-slate-900">Partida {index + 1}</p><p className="text-xs text-slate-500">Importe calculado por separado</p></div>
                      </div>
                      <button type="button" onClick={() => quitarPartida(p.id)} disabled={form.partidas.length <= 1} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">Quitar partida</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <label className={etiqueta + " lg:col-span-1"}>
                        Descripción *
                        <input required value={p.descripcion} onChange={(e) => actualizarPartida(p.id, { descripcion: e.target.value })} className={campo} placeholder="Ej. Flete local MTY - Apodaca" maxLength={700} />
                      </label>
                      <label className={etiqueta}>
                        Cantidad *
                        <input required type="number" min="0.001" step="0.001" value={p.cantidad} onChange={(e) => actualizarPartida(p.id, { cantidad: e.target.value })} className={campo} />
                      </label>
                      <label className={etiqueta}>
                        Costo unitario (MXN) *
                        <input required type="number" min="0" step="0.01" value={p.precio_unitario} onChange={(e) => actualizarPartida(p.id, { precio_unitario: e.target.value })} className={campo} placeholder="0.00" />
                      </label>
                      <label className={etiqueta}>
                        IVA (%)
                        <input type="number" min="0" max="100" step="0.01" value={p.iva_porcentaje} onChange={(e) => actualizarPartida(p.id, { iva_porcentaje: e.target.value })} className={campo} />
                      </label>
                      <label className={etiqueta}>
                        Retención (%)
                        <input type="number" min="0" max="100" step="0.01" value={p.retencion_porcentaje} onChange={(e) => actualizarPartida(p.id, { retencion_porcentaje: e.target.value })} className={campo} />
                      </label>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-4">
                      <div><p className="text-xs text-slate-500">Subtotal</p><p className="mt-1 font-semibold">{dinero(p.subtotal)}</p></div>
                      <div><p className="text-xs text-slate-500">IVA</p><p className="mt-1 font-semibold">{dinero(p.iva)}</p></div>
                      <div><p className="text-xs text-slate-500">Retención</p><p className="mt-1 font-semibold">{dinero(p.retencion)}</p></div>
                      <div><p className="text-xs text-slate-500">Total de partida</p><p className="mt-1 font-extrabold text-cyan-800">{dinero(p.total)}</p></div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subtotal</p><p className="mt-2 text-xl font-bold text-slate-900">{dinero(totales.subtotal)}</p></div>
                <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">IVA</p><p className="mt-2 text-xl font-bold text-slate-900">{dinero(totales.iva)}</p></div>
                <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Retención</p><p className="mt-2 text-xl font-bold text-slate-900">- {dinero(totales.retencion)}</p></div>
                <div className="rounded-xl bg-slate-900 p-4 text-white"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">Total cotizado</p><p className="mt-2 text-xl font-extrabold">{dinero(totales.total)}</p></div>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">Cálculo por partida: cantidad × costo unitario. El IVA se suma y la retención se resta. Los porcentajes se pueden ajustar según corresponda a cada concepto.</p>
            </section>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <label className={etiqueta}>
                Observaciones para el cliente
                <textarea rows={4} maxLength={2000} value={form.notas} onChange={(e) => cambiarCampo("notas", e.target.value)} className={campo} placeholder="Notas, consideraciones, alcances específicos o información adicional." />
              </label>
              <label className={etiqueta}>
                Términos y condiciones (editables para esta cotización)
                <textarea rows={8} maxLength={8000} value={form.condiciones} onChange={(e) => cambiarCampo("condiciones", e.target.value)} className={campo + " text-xs leading-5"} />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
              <p className="max-w-xl text-xs leading-5 text-slate-500">Al guardar una cotización nueva se asigna un folio interno de Neo y se descarga el PDF. Este folio no es un número de factura ni sustituye un CFDI.</p>
              <button disabled={guardando} className="rounded-xl bg-cyan-700 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-cyan-800 disabled:opacity-50">
                {guardando ? "Guardando y preparando PDF..." : editando ? "Guardar cambios" : "Guardar cotización y descargar PDF"}
              </button>
            </div>
          </form>
        )}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_210px_auto]">
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar folio, cliente, origen, destino..." className={campo} />
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={campo}>
              <option value="TODOS">Todos los estados</option>
              {estados.map((x) => <option key={x[0]} value={x[0]}>{x[1]}</option>)}
            </select>
            <button type="button" onClick={() => void cargar()} disabled={cargando} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">{cargando ? "Actualizando..." : "Actualizar"}</button>
          </div>

          {cargando ? (
            <p className="p-8 text-center text-sm text-slate-500">Cargando cotizaciones...</p>
          ) : filtrados.length === 0 ? (
            <div className="p-10 text-center"><p className="font-semibold">No hay cotizaciones para mostrar.</p><p className="mt-2 text-sm text-slate-500">Registra una propuesta o modifica la búsqueda.</p></div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[1240px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Folio / fecha</th><th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Servicio / ruta</th><th className="px-4 py-3">Partidas</th>
                    <th className="px-4 py-3 text-center">Total</th><th className="px-4 py-3">Estado</th><th className="min-w-[174px] px-3 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtrados.map((c) => (
                    <tr key={c.id} className="align-top hover:bg-slate-50/70">
                      <td className="px-4 py-4"><p className="font-bold text-slate-900">{c.folio || "Folio pendiente"}</p><p className="mt-1 text-xs text-slate-500">{fecha(c.created_at)}</p></td>
                      <td className="px-4 py-4"><p className="font-bold">{c.cliente}</p><p className="mt-1 text-xs text-slate-500">{c.contacto || c.telefono || "Sin contacto"}</p></td>
                      <td className="px-4 py-4"><p className="font-semibold">{c.servicio}</p><p className="mt-1 text-xs text-slate-500">{c.origen || "Origen pendiente"} → {c.destino || "Destino pendiente"}</p></td>
                      <td className="px-4 py-4"><p>{Array.isArray(c.partidas) && c.partidas.length ? c.partidas.length : "Sin desglose"}</p><p className="mt-1 text-xs text-slate-500">{c.fecha_servicio ? "Servicio: " + fecha(c.fecha_servicio) : "Fecha por confirmar"}</p></td>
                      <td className="px-4 py-4 text-center font-bold tabular-nums">{dinero(c.total ?? c.monto_estimado)}</td>
                      <td className="px-4 py-4"><span className={"rounded-full px-3 py-1 text-xs font-bold " + estadoClase(c.estado)}>{(estados.find((x) => x[0] === c.estado) || [c.estado, c.estado])[1]}</span></td>
                      <td className="min-w-[174px] overflow-visible px-3 py-4">
                        <div className="flex min-w-[148px] flex-col items-stretch gap-2">
                          <button
                            type="button"
                            onClick={() => editar(c)}
                            disabled={eliminandoId === c.id}
                            className="w-full whitespace-nowrap rounded-lg border border-cyan-200 px-3 py-2 text-xs font-bold text-cyan-800 hover:bg-cyan-50 disabled:opacity-50"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void descargarPdf(c)}
                            disabled={pdfId === c.id || eliminandoId === c.id}
                            style={{ color: "#ffffff", backgroundColor: "#102b43" }}
                            className="w-full min-w-[148px] whitespace-nowrap rounded-lg px-2 py-2 text-xs font-bold hover:!bg-[#0c7180] disabled:opacity-50"
                          >
                            {pdfId === c.id ? "Preparando PDF..." : "Descargar PDF"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void eliminar(c)}
                            disabled={eliminandoId === c.id || pdfId === c.id}
                            className="w-full whitespace-nowrap rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                          >
                            {eliminandoId === c.id ? "Eliminando..." : "Eliminar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">El folio es un identificador interno de cotización. No es un folio fiscal ni un número de factura.</p>
        </section>
        <footer className="py-8 text-center text-xs text-slate-400">Neo Transportaciones · Cotizaciones</footer>
      </div>
    </main>
  );
}
