"use client";

import Image from "next/image";
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

type ClienteCatalogo = { id: string; nombre: string };

type ConceptoCatalogo = {
  id: string;
  nombre: string;
  precio_unitario: number | string | null;
  precio_manual: boolean;
  iva_porcentaje: number | string;
  retencion_porcentaje: number | string;
  retencion_aplica: boolean;
  orden: number;
};

type Formulario = {
  cliente: string;
  factura: string;
  cantidad: string;
  concepto_base: string;
  concepto_manual: string;
  subconceptos: string;
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

type RespuestaCatalogos = {
  ok?: boolean;
  message?: string;
  clientes?: ClienteCatalogo[];
  conceptos?: ConceptoCatalogo[];
};

const CONCEPTO_MANUAL = "__CONCEPTO_MANUAL__";

const formularioVacio: Formulario = {
  cliente: "",
  factura: "",
  cantidad: "1",
  concepto_base: "",
  concepto_manual: "",
  subconceptos: "",
  costo_unitario: "",
  iva_porcentaje: "16",
  retencion_porcentaje: "0",
  observaciones: "",
  estatus: "PENDIENTE",
  paquete: "",
  fecha_entrega: "",
  fecha_pago: "",
  comentarios: "",
};

const estatusOpciones: Estatus[] = ["PENDIENTE", "FACTURADO", "PAGADO", "CANCELADO"];

const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const claseCampo =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";
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

function separarDescripcion(servicio: Servicio, conceptos: ConceptoCatalogo[]) {
  const conceptoCoincidente = [...conceptos]
    .sort((a, b) => b.nombre.length - a.nombre.length)
    .find(
      (concepto) =>
        servicio.concepto === concepto.nombre ||
        servicio.concepto.startsWith(`${concepto.nombre} — `)
    );

  if (!conceptoCoincidente) {
    return {
      concepto_base: CONCEPTO_MANUAL,
      concepto_manual: servicio.concepto,
      subconceptos: "",
    };
  }

  const resto = servicio.concepto.slice(conceptoCoincidente.nombre.length).replace(/^ — /, "");
  return {
    concepto_base: conceptoCoincidente.nombre,
    concepto_manual: "",
    subconceptos: resto ? resto.split(" — ").join("\n") : "",
  };
}

function crearDescripcionFinal(formulario: Formulario): string {
  const principal =
    formulario.concepto_base === CONCEPTO_MANUAL
      ? formulario.concepto_manual.trim()
      : formulario.concepto_base.trim();
  const adicionales = formulario.subconceptos
    .split(/\r?\n/)
    .map((elemento) => elemento.trim())
    .filter(Boolean);
  return [principal, ...adicionales].filter(Boolean).join(" — ");
}

export default function ServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [clientes, setClientes] = useState<ClienteCatalogo[]>([]);
  const [conceptos, setConceptos] = useState<ConceptoCatalogo[]>([]);
  const [form, setForm] = useState<Formulario>(formularioVacio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState<Estatus>("PENDIENTE");
  const [cantidadVisible, setCantidadVisible] = useState(5);
  const [cargando, setCargando] = useState(true);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [errorCatalogos, setErrorCatalogos] = useState("");
  const [mensaje, setMensaje] = useState("");

  const cargarServicios = useCallback(async () => {
    setCargando(true);
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
      setServicios(
        [...json.data].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los servicios.");
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarCatalogos = useCallback(async () => {
    setCargandoCatalogos(true);
    setErrorCatalogos("");
    try {
      const res = await fetch("/api/catalogos", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as RespuestaCatalogos;
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok || !json.ok || !Array.isArray(json.clientes) || !Array.isArray(json.conceptos)) {
        throw new Error(json.message || "No fue posible cargar los clientes y conceptos.");
      }
      setClientes(json.clientes);
      setConceptos(json.conceptos);
    } catch (e) {
      setErrorCatalogos(e instanceof Error ? e.message : "Error al cargar los catálogos.");
    } finally {
      setCargandoCatalogos(false);
    }
  }, []);

  useEffect(() => {
    void cargarServicios();
    void cargarCatalogos();
  }, [cargarServicios, cargarCatalogos]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase("es-MX");
    return servicios.filter((s) => {
      const estadoOK = s.estatus === filtroEstatus;
      const contenido = [s.cliente, s.factura, s.concepto, s.paquete, s.observaciones, s.comentarios, s.estatus]
        .filter(Boolean).join(" ").toLocaleLowerCase("es-MX");
      return estadoOK && contenido.includes(q);
    });
  }, [servicios, busqueda, filtroEstatus]);

  const visibles = useMemo(
    () => filtrados.slice(-cantidadVisible),
    [filtrados, cantidadVisible]
  );

  const resumen = useMemo(() => ({
    cantidad: servicios.length,
    pendientes: servicios.filter((s) => s.estatus === "PENDIENTE").length,
    facturados: servicios.filter((s) => s.estatus === "FACTURADO").length,
    pagados: servicios.filter((s) => s.estatus === "PAGADO").length,
    total: servicios.filter((s) => s.estatus !== "CANCELADO").reduce((suma, s) => suma + numero(s.total), 0),
  }), [servicios]);

  const conceptoSeleccionado = conceptos.find((concepto) => concepto.nombre === form.concepto_base);
  const retencionAplica = form.concepto_base === CONCEPTO_MANUAL ? true : (conceptoSeleccionado?.retencion_aplica ?? true);
  const descripcionFinal = crearDescripcionFinal(form);
  const subtotal = numero(form.cantidad) * numero(form.costo_unitario);
  const iva = subtotal * numero(form.iva_porcentaje) / 100;
  const retencion = retencionAplica ? subtotal * numero(form.retencion_porcentaje) / 100 : 0;
  const total = subtotal + iva - retencion;

  function cambiar<K extends keyof Formulario>(clave: K, valor: Formulario[K]) {
    setForm((anterior) => ({ ...anterior, [clave]: valor }));
  }

  function seleccionarConcepto(valor: string) {
    if (valor === CONCEPTO_MANUAL) {
      setForm((anterior) => ({
        ...anterior,
        concepto_base: CONCEPTO_MANUAL,
        concepto_manual: "",
        subconceptos: "",
        costo_unitario: "",
        iva_porcentaje: "16",
        retencion_porcentaje: "0",
      }));
      return;
    }

    const concepto = conceptos.find((item) => item.nombre === valor);
    if (!concepto) {
      setForm((anterior) => ({ ...anterior, concepto_base: "", concepto_manual: "", subconceptos: "", costo_unitario: "" }));
      return;
    }

    setForm((anterior) => ({
      ...anterior,
      concepto_base: concepto.nombre,
      concepto_manual: "",
      subconceptos: "",
      costo_unitario: concepto.precio_manual || concepto.precio_unitario === null ? "" : String(concepto.precio_unitario),
      iva_porcentaje: String(concepto.iva_porcentaje),
      retencion_porcentaje: concepto.retencion_aplica ? String(concepto.retencion_porcentaje) : "0",
    }));
  }

  function editar(servicio: Servicio) {
    const separado = separarDescripcion(servicio, conceptos);
    setEditandoId(servicio.id);
    setForm({
      cliente: servicio.cliente ?? "",
      factura: servicio.factura ?? "",
      cantidad: String(servicio.cantidad ?? 1),
      ...separado,
      costo_unitario: String(servicio.costo_unitario ?? 0),
      iva_porcentaje: String(servicio.iva_porcentaje ?? 16),
      retencion_porcentaje: String(servicio.retencion_porcentaje ?? 0),
      observaciones: servicio.observaciones ?? "",
      estatus: servicio.estatus ?? "PENDIENTE",
      paquete: servicio.paquete ?? "",
      fecha_entrega: servicio.fecha_entrega?.slice(0, 10) ?? "",
      fecha_pago: servicio.fecha_pago?.slice(0, 10) ?? "",
      comentarios: servicio.comentarios ?? "",
    });
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

    const conceptoFinal = crearDescripcionFinal(form);
    if (!form.cliente.trim()) {
      setError("Selecciona un cliente del catálogo.");
      setGuardando(false);
      return;
    }
    if (!conceptoFinal) {
      setError("Selecciona un concepto y agrega su descripción.");
      setGuardando(false);
      return;
    }
    if (!form.costo_unitario || !Number.isFinite(Number(form.costo_unitario))) {
      setError("Captura el costo unitario del servicio.");
      setGuardando(false);
      return;
    }

    try {
      const body = {
        ...(editandoId ? { id: editandoId } : {}),
        cliente: form.cliente,
        factura: form.factura,
        cantidad: Number(form.cantidad),
        concepto: conceptoFinal,
        costo_unitario: Number(form.costo_unitario),
        iva_porcentaje: Number(form.iva_porcentaje),
        retencion_porcentaje: retencionAplica ? Number(form.retencion_porcentaje) : 0,
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
      const estatusGuardado = form.estatus;
      setFiltroEstatus(estatusGuardado);
      setCantidadVisible(5);
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
      IVA: numero(s.iva),
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
      { wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 45 }, { wch: 17 },
      { wch: 17 }, { wch: 17 }, { wch: 17 }, { wch: 17 }, { wch: 16 },
      { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 35 }, { wch: 35 },
      { wch: 22 },
    ];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Servicios");
    XLSX.writeFile(libro, `neo-servicios-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-800">
      <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <a href="/" aria-label="Neo Transportaciones, inicio" className="inline-flex items-center">
            <Image src="/neo-logo.png" alt="NEO Transportaciones" width={220} height={114} priority className="h-14 w-auto object-contain sm:h-16" />
          </a>
          <nav className="flex flex-wrap gap-2">
            <a href="/" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Panel principal</a>
            <a href="/conversaciones" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Conversaciones</a>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cerrar sesión</button>
            </form>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
        <section className="rounded-3xl bg-gradient-to-r from-slate-900 to-cyan-800 p-6 text-white sm:p-8">
          <p className="text-xs font-bold tracking-[0.2em] text-cyan-300">ADMINISTRACIÓN</p>
          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Servicios</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
            Selecciona clientes y conceptos del catálogo; el precio, IVA y retención se precargan automáticamente. Puedes agregar subconceptos manuales a cualquier concepto.
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

        {errorCatalogos && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-semibold">No se pudieron cargar los catálogos</p><p className="mt-1">{errorCatalogos}</p><button type="button" onClick={() => void cargarCatalogos()} className="mt-3 rounded-lg border border-rose-300 px-3 py-2 font-semibold hover:bg-rose-100">Reintentar</button></div>}
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-semibold">No se pudo completar la operación</p><p className="mt-1">{error}</p></div>}
        {mensaje && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{mensaje}</div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{editandoId ? "Editar servicio" : "Registrar servicio"}</h2>
              <p className="mt-1 text-sm text-slate-500">Selecciona un cliente y un concepto. Los subconceptos son opcionales.</p>
            </div>
            {editandoId && <button type="button" onClick={cancelarEdicion} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancelar edición</button>}
          </div>

          <form onSubmit={guardar} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className={claseEtiqueta}>Cliente *
                <select className={claseCampo} value={form.cliente} onChange={(e) => cambiar("cliente", e.target.value)} required disabled={cargandoCatalogos || clientes.length === 0}>
                  <option value="">{cargandoCatalogos ? "Cargando clientes..." : "Selecciona un cliente"}</option>
                  {clientes.map((cliente) => <option key={cliente.id} value={cliente.nombre}>{cliente.nombre}</option>)}
                </select>
              </label>
              <label className={claseEtiqueta}>Número consecutivo de factura
                <input className={claseCampo} value={editandoId ? (form.factura || "Sin número asignado") : "Se asigna al guardar"} readOnly aria-readonly="true" />
                <span className="mt-1 block text-xs font-normal text-slate-500">{editandoId ? "El número existente se conserva al editar." : "El sistema asignará el siguiente número consecutivo al registrar el servicio."}</span>
              </label>
              <label className={claseEtiqueta}>Paquete o referencia
                <input className={claseCampo} value={form.paquete} onChange={(e) => cambiar("paquete", e.target.value)} placeholder="Nombre o referencia" maxLength={200} />
              </label>
              <label className={claseEtiqueta}>Concepto principal *
                <select className={claseCampo} value={form.concepto_base} onChange={(e) => seleccionarConcepto(e.target.value)} required disabled={cargandoCatalogos || conceptos.length === 0}>
                  <option value="">{cargandoCatalogos ? "Cargando conceptos..." : "Selecciona un concepto"}</option>
                  {conceptos.map((concepto) => <option key={concepto.id} value={concepto.nombre}>{concepto.nombre}</option>)}
                  <option value={CONCEPTO_MANUAL}>Otro concepto (manual)</option>
                </select>
              </label>
              {form.concepto_base === CONCEPTO_MANUAL && <label className={claseEtiqueta}>Nombre del concepto manual *
                <input className={claseCampo} value={form.concepto_manual} onChange={(e) => cambiar("concepto_manual", e.target.value)} placeholder="Escribe el concepto" maxLength={700} required />
              </label>}
              <label className={claseEtiqueta}>Subconceptos adicionales (opcional)
                <textarea className={claseCampo} value={form.subconceptos} onChange={(e) => cambiar("subconceptos", e.target.value)} rows={3} placeholder={"Uno por línea. Ejemplo:\nCarga adicional\nTiempo de espera"} />
                <span className="mt-1 block text-xs font-normal text-slate-500">Puedes escribir varios, uno por línea. Se unirán al concepto principal en la descripción guardada.</span>
              </label>
              <label className={claseEtiqueta}>Cantidad *
                <input className={claseCampo} type="number" value={form.cantidad} onChange={(e) => cambiar("cantidad", e.target.value)} min="0.01" step="any" required />
              </label>
              <label className={claseEtiqueta}>Costo unitario (MXN) *
                <input className={claseCampo} type="number" value={form.costo_unitario} onChange={(e) => cambiar("costo_unitario", e.target.value)} min="0" step="0.01" required placeholder="Se completa según el concepto" />
                {conceptoSeleccionado?.precio_manual && <span className="mt-1 block text-xs font-normal text-amber-700">Este concepto requiere capturar el precio manualmente.</span>}
              </label>
              <label className={claseEtiqueta}>IVA (%)
                <input className={claseCampo} type="number" value={form.iva_porcentaje} onChange={(e) => cambiar("iva_porcentaje", e.target.value)} min="0" max="100" step="0.01" required />
              </label>
              <label className={claseEtiqueta}>{retencionAplica ? "Retención (%)" : "Retención (no aplica)"}
                <input className={claseCampo} type="number" value={form.retencion_porcentaje} onChange={(e) => cambiar("retencion_porcentaje", e.target.value)} min="0" max="100" step="0.01" required disabled={!retencionAplica} />
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

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Descripción final del concepto</p>
              <p className="mt-2 break-words font-semibold text-slate-800">{descripcionFinal || "Selecciona un concepto para ver la descripción final."}</p>
              <p className="mt-1 text-xs text-slate-500">Esta descripción unida se guardará en el registro y aparecerá en la tabla y en Excel.</p>
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
                <div><p className="text-xs text-slate-500">Retención</p><p className="mt-1 font-semibold">{retencionAplica ? dinero(retencion) : "No aplica"}</p></div>
                <div><p className="text-xs text-slate-500">Total estimado</p><p className="mt-1 text-xl font-bold text-cyan-900">{dinero(total)}</p></div>
              </div>
              <p className="mt-3 text-xs text-slate-500">Cálculo estimado: subtotal más IVA menos retención.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={guardando || cargandoCatalogos || Boolean(errorCatalogos)} className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60">
                {guardando ? "Guardando..." : editandoId ? "Guardar cambios" : "Registrar servicio"}
              </button>
              {editandoId && <button type="button" onClick={cancelarEdicion} disabled={guardando} className="rounded-xl border border-slate-300 px-6 py-3 text-sm font-semibold hover:bg-slate-50">Descartar cambios</button>}
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><h2 className="text-xl font-bold">Servicios {textoEstatus(filtroEstatus).toLowerCase()}</h2><p className="mt-1 text-sm text-slate-500">Cada estatus tiene su propia lista. Los cinco registros más recientes aparecen primero en la vista.</p></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void cargarServicios()} disabled={cargando} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">{cargando ? "Actualizando..." : "Actualizar"}</button>
              <button type="button" onClick={exportarExcel} disabled={filtrados.length === 0} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Exportar Excel</button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Listas de servicios por estatus">
            {estatusOpciones.map((opcion) => {
              const cantidad = servicios.filter((servicio) => servicio.estatus === opcion).length;
              const activo = filtroEstatus === opcion;
              return (
                <button
                  key={opcion}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  onClick={() => { setFiltroEstatus(opcion); setCantidadVisible(5); }}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${activo ? "border-cyan-800 bg-cyan-800 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  {textoEstatus(opcion)} <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${activo ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>{cantidad}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3">
            <label className={claseEtiqueta}>Buscar en {textoEstatus(filtroEstatus).toLowerCase()}
              <input className={claseCampo} type="search" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setCantidadVisible(5); }} placeholder="Cliente, factura, concepto o paquete" />
            </label>
          </div>

          <p className="mt-4 text-sm text-slate-500">Mostrando {visibles.length} de {filtrados.length} servicio(s) en la lista de {textoEstatus(filtroEstatus).toLowerCase()}.</p>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[1450px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-900 text-white"><tr>
                <th className="px-4 py-3">Cliente / factura</th><th className="px-4 py-3">Concepto</th><th className="px-4 py-3 text-right">Cantidad</th><th className="px-4 py-3 text-right">Costo unitario</th><th className="px-4 py-3 text-right">Subtotal</th><th className="px-4 py-3 text-right">IVA</th><th className="px-4 py-3 text-right">Retención</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Entrega / antigüedad</th><th className="px-4 py-3">Pago</th><th className="px-4 py-3">Estatus</th><th className="px-4 py-3">Detalles</th><th className="px-4 py-3">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {cargando ? (
                  <tr><td colSpan={13} className="px-4 py-12 text-center text-slate-500">Cargando servicios...</td></tr>
                ) : filtrados.length === 0 ? (
                  <tr><td colSpan={13} className="px-4 py-12 text-center text-slate-500">{servicios.length === 0 ? "Todavía no hay servicios registrados." : busqueda.trim() ? "No hay servicios que coincidan con la búsqueda." : `No hay servicios con estatus ${textoEstatus(filtroEstatus).toLowerCase()}.`}</td></tr>
                ) : visibles.map((s) => (
                  <tr key={s.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-4"><p className="font-bold text-slate-900">{s.cliente}</p><p className="mt-1 text-xs text-slate-500">Factura: {s.factura || "Sin factura"}</p>{s.paquete && <p className="mt-1 text-xs text-slate-500">Ref.: {s.paquete}</p>}</td>
                    <td className="max-w-xs whitespace-pre-wrap px-4 py-4">{s.concepto}</td>
                    <td className="px-4 py-4 text-right">{numero(s.cantidad).toLocaleString("es-MX")}</td>
                    <td className="px-4 py-4 text-right">{dinero(s.costo_unitario)}</td>
                    <td className="px-4 py-4 text-right">{dinero(s.subtotal)}</td>
                    <td className="px-4 py-4 text-right">{dinero(s.iva)}</td>
                    <td className="px-4 py-4 text-right">{dinero(s.retencion)}</td>
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
          {filtrados.length > visibles.length && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setCantidadVisible((actual) => actual + 5)}
                className="rounded-xl border border-cyan-200 bg-white px-5 py-3 text-sm font-bold text-cyan-800 transition hover:bg-cyan-50"
              >
                Cargar 5 más ({filtrados.length - visibles.length} restantes)
              </button>
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">En pantallas pequeñas puedes deslizar la tabla horizontalmente. Exportar Excel descarga todos los registros que coinciden con la búsqueda en la lista seleccionada, no solo los que se muestran en pantalla.</p>
        </section>

        <footer className="pb-5 text-center text-xs text-slate-400">Neo Transportaciones · Panel privado</footer>
      </div>
    </main>
  );
}
