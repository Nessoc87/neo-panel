"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import * as XLSX from "xlsx";

type Estatus = "PENDIENTE" | "FACTURADO" | "PAGADO" | "CANCELADO";

type ConceptoDetalle = {
  concepto: string;
  cantidad: number | string;
  costo_unitario: number | string;
  iva_porcentaje: number | string;
  retencion_porcentaje: number | string;
  retencion_aplica?: boolean;
  subtotal?: number | string;
  iva?: number | string;
  retencion?: number | string;
  total?: number | string;
};

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
  conceptos_detalle?: ConceptoDetalle[] | null;
  observaciones: string | null;
  estatus: Estatus;
  paquete: string | null;
  fecha_entrega: string | null;
  fecha_pago: string | null;
  comentarios: string | null;
  motivo_cancelacion: string | null;
  created_at: string;
  updated_at: string;
};

type LineaConcepto = {
  id: string;
  concepto_base: string;
  concepto_manual: string;
  cantidad: string;
  costo_unitario: string;
  iva_porcentaje: string;
  retencion_porcentaje: string;
  retencion_aplica: boolean;
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
  lineas: LineaConcepto[];
  observaciones: string;
  estatus: Estatus;
  paquete: string;
  fecha_entrega: string;
  fecha_pago: string;
  comentarios: string;
  motivo_cancelacion: string;
};

type FormularioRapido = {
  factura: string;
  estatus: Estatus;
  paquete: string;
  fecha_entrega: string;
  fecha_pago: string;
  observaciones: string;
  comentarios: string;
  motivo_cancelacion: string;
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

function crearLineaVacia(id: string): LineaConcepto {
  return {
    id, concepto_base: "", concepto_manual: "", cantidad: "1",
    costo_unitario: "", iva_porcentaje: "16", retencion_porcentaje: "0",
    retencion_aplica: true,
  };
}

function crearFormularioVacio(): Formulario {
  return {
    cliente: "", factura: "", lineas: [crearLineaVacia("linea-inicial")],
    observaciones: "", estatus: "PENDIENTE", paquete: "",
    fecha_entrega: "", fecha_pago: "", comentarios: "", motivo_cancelacion: "",
  };
}

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

function redondearDinero(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function nombreLinea(linea: LineaConcepto): string {
  return linea.concepto_base === CONCEPTO_MANUAL
    ? linea.concepto_manual.trim()
    : linea.concepto_base.trim();
}

function lineasDeServicio(servicio: Servicio, catalogo: ConceptoCatalogo[]): LineaConcepto[] {
  const guardadas = Array.isArray(servicio.conceptos_detalle) ? servicio.conceptos_detalle : [];
  // Registros antiguos: reconstruir una sola partida sin alterar cantidades o importes.
  const origen: ConceptoDetalle[] = guardadas.length ? guardadas : [{
    concepto: servicio.concepto, cantidad: servicio.cantidad,
    costo_unitario: servicio.costo_unitario, iva_porcentaje: servicio.iva_porcentaje,
    retencion_porcentaje: servicio.retencion_porcentaje,
  }];
  return origen.map((detalle, index) => {
    const nombre = String(detalle.concepto ?? "").trim();
    const catalogado = catalogo.find((item) => item.nombre === nombre);
    return {
      id: `linea-guardada-${index}`,
      concepto_base: catalogado ? catalogado.nombre : CONCEPTO_MANUAL,
      concepto_manual: catalogado ? "" : nombre,
      cantidad: String(detalle.cantidad ?? 1),
      costo_unitario: String(detalle.costo_unitario ?? 0),
      iva_porcentaje: String(detalle.iva_porcentaje ?? 16),
      retencion_porcentaje: String(detalle.retencion_porcentaje ?? 0),
      retencion_aplica: typeof detalle.retencion_aplica === "boolean"
        ? detalle.retencion_aplica
        : catalogado?.retencion_aplica ?? true,
    };
  });
}

function cantidadPartidas(servicio: Servicio): number {
  return Array.isArray(servicio.conceptos_detalle) && servicio.conceptos_detalle.length
    ? servicio.conceptos_detalle.length
    : 1;
}

function descripcionPartidas(servicio: Servicio): string {
  const items = Array.isArray(servicio.conceptos_detalle) ? servicio.conceptos_detalle : [];
  if (!items.length) return servicio.concepto;
  return items.map((linea) => {
    const subtotal = linea.subtotal !== undefined
      ? dinero(linea.subtotal)
      : dinero(numero(linea.cantidad) * numero(linea.costo_unitario));
    return `${linea.concepto} · ${numero(linea.cantidad).toLocaleString("es-MX")} × ${dinero(linea.costo_unitario)} = ${subtotal}`;
  }).join("\n");
}

export default function ServiciosPage() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [clientes, setClientes] = useState<ClienteCatalogo[]>([]);
  const [conceptos, setConceptos] = useState<ConceptoCatalogo[]>([]);
  const [form, setForm] = useState<Formulario>(crearFormularioVacio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edicionRapida, setEdicionRapida] = useState<Servicio | null>(null);
  const [formRapido, setFormRapido] = useState<FormularioRapido>({
    factura: "",
    estatus: "PENDIENTE",
    paquete: "",
    fecha_entrega: "",
    fecha_pago: "",
    observaciones: "",
    comentarios: "",
    motivo_cancelacion: "",
  });
  const [guardandoRapido, setGuardandoRapido] = useState(false);
  const [errorRapido, setErrorRapido] = useState("");
  const [mensajeRapido, setMensajeRapido] = useState("");
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

  // Orden interno independiente por estatus. Se recalcula al cambiar el estatus
  // de un servicio y nunca altera ni sustituye el folio real de factura.
  const ordenesInternos = useMemo(() => {
    const colaDelEstatus = servicios
      .filter((servicio) => servicio.estatus === filtroEstatus)
      .sort((a, b) => {
        const diferencia = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return diferencia !== 0 ? diferencia : a.id.localeCompare(b.id);
      });

    return new Map(colaDelEstatus.map((servicio, indice) => [servicio.id, indice + 1]));
  }, [servicios, filtroEstatus]);

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

  const resumenConceptos = useMemo(() => {
    const lineas = form.lineas.map((linea) => {
      const base = redondearDinero(numero(linea.cantidad) * numero(linea.costo_unitario));
      const ivaLinea = redondearDinero(base * numero(linea.iva_porcentaje) / 100);
      const retencionLinea = linea.retencion_aplica
        ? redondearDinero(base * numero(linea.retencion_porcentaje) / 100)
        : 0;
      return {
        ...linea,
        concepto: nombreLinea(linea),
        subtotal: base,
        iva: ivaLinea,
        retencion: retencionLinea,
        total: redondearDinero(base + ivaLinea - retencionLinea),
      };
    });
    return {
      lineas,
      subtotal: redondearDinero(lineas.reduce((suma, linea) => suma + linea.subtotal, 0)),
      iva: redondearDinero(lineas.reduce((suma, linea) => suma + linea.iva, 0)),
      retencion: redondearDinero(lineas.reduce((suma, linea) => suma + linea.retencion, 0)),
      total: redondearDinero(lineas.reduce((suma, linea) => suma + linea.total, 0)),
    };
  }, [form.lineas]);

  const descripcionFinal = resumenConceptos.lineas.map((linea) => linea.concepto).filter(Boolean).join(" — ");

  function cambiar<K extends keyof Formulario>(clave: K, valor: Formulario[K]) {
    setForm((anterior) => ({ ...anterior, [clave]: valor }));
  }

  function actualizarLinea(id: string, cambios: Partial<LineaConcepto>) {
    setForm((actual) => ({
      ...actual,
      lineas: actual.lineas.map((linea) => linea.id === id ? { ...linea, ...cambios } : linea),
    }));
  }

  function seleccionarConceptoLinea(id: string, valor: string) {
    if (valor === CONCEPTO_MANUAL) {
      actualizarLinea(id, {
        concepto_base: CONCEPTO_MANUAL, concepto_manual: "", costo_unitario: "",
        iva_porcentaje: "16", retencion_porcentaje: "0", retencion_aplica: true,
      });
      return;
    }
    const concepto = conceptos.find((item) => item.nombre === valor);
    if (!concepto) {
      actualizarLinea(id, {
        concepto_base: "", concepto_manual: "", costo_unitario: "",
        iva_porcentaje: "16", retencion_porcentaje: "0", retencion_aplica: true,
      });
      return;
    }
    actualizarLinea(id, {
      concepto_base: concepto.nombre,
      concepto_manual: "",
      costo_unitario: concepto.precio_manual || concepto.precio_unitario === null
        ? "" : String(concepto.precio_unitario),
      iva_porcentaje: String(concepto.iva_porcentaje),
      retencion_porcentaje: concepto.retencion_aplica ? String(concepto.retencion_porcentaje) : "0",
      retencion_aplica: concepto.retencion_aplica,
    });
  }

  function agregarLinea() {
    if (form.lineas.length >= 50) return;
    setForm((actual) => ({
      ...actual,
      lineas: [...actual.lineas, crearLineaVacia(`linea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)],
    }));
  }

  function eliminarLinea(id: string) {
    setForm((actual) => ({
      ...actual,
      lineas: actual.lineas.length <= 1 ? actual.lineas : actual.lineas.filter((linea) => linea.id !== id),
    }));
  }

  function editar(servicio: Servicio) {
    setEditandoId(servicio.id);
    setForm({
      cliente: servicio.cliente ?? "",
      factura: servicio.factura ?? "",
      lineas: lineasDeServicio(servicio, conceptos),
      observaciones: servicio.observaciones ?? "",
      estatus: servicio.estatus ?? "PENDIENTE",
      paquete: servicio.paquete ?? "",
      fecha_entrega: servicio.fecha_entrega?.slice(0, 10) ?? "",
      fecha_pago: servicio.fecha_pago?.slice(0, 10) ?? "",
      comentarios: servicio.comentarios ?? "",
      motivo_cancelacion: servicio.motivo_cancelacion ?? "",
    });
    setError("");
    setMensaje("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function abrirEdicionRapida(servicio: Servicio) {
    setEdicionRapida(servicio);
    setFormRapido({
      factura: servicio.factura ?? "",
      estatus: servicio.estatus ?? "PENDIENTE",
      paquete: servicio.paquete ?? "",
      fecha_entrega: servicio.fecha_entrega?.slice(0, 10) ?? "",
      fecha_pago: servicio.fecha_pago?.slice(0, 10) ?? "",
      observaciones: servicio.observaciones ?? "",
      comentarios: servicio.comentarios ?? "",
      motivo_cancelacion: servicio.motivo_cancelacion ?? "",
    });
    setErrorRapido("");
    setMensajeRapido("");
  }

  function cambiarRapido<K extends keyof FormularioRapido>(
    clave: K,
    valor: FormularioRapido[K]
  ) {
    setFormRapido((actual) => ({ ...actual, [clave]: valor }));
  }

  async function guardarEdicionRapida(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!edicionRapida) return;

    setGuardandoRapido(true);
    setErrorRapido("");

    if (formRapido.estatus === "FACTURADO" && !formRapido.factura.trim()) {
      setErrorRapido("Captura el número de factura antes de marcar el servicio como Facturado.");
      setGuardandoRapido(false);
      return;
    }
    if (formRapido.estatus === "PAGADO" && !formRapido.fecha_pago) {
      setErrorRapido("Selecciona la fecha de pago antes de marcar el servicio como Pagado.");
      setGuardandoRapido(false);
      return;
    }
    if (formRapido.estatus === "CANCELADO" && !formRapido.motivo_cancelacion.trim()) {
      setErrorRapido("Escribe el motivo antes de cancelar el servicio.");
      setGuardandoRapido(false);
      return;
    }

    try {
      const res = await fetch("/api/servicios/quick", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: edicionRapida.id,
          ...formRapido,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        data?: Servicio;
      };

      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.message || "No fue posible guardar los cambios rápidos.");
      }

      setServicios((actuales) =>
        actuales.map((servicio) =>
          servicio.id === json.data!.id ? json.data! : servicio
        )
      );
      setEdicionRapida(null);
      setErrorRapido("");
      setMensajeRapido("Cambios guardados. El servicio se actualizó sin modificar sus conceptos ni importes.");
    } catch (e) {
      setErrorRapido(e instanceof Error ? e.message : "Ocurrió un error al guardar los cambios.");
    } finally {
      setGuardandoRapido(false);
    }
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(crearFormularioVacio());
    setError("");
    setMensaje("");
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setGuardando(true);
    setError("");
    setMensaje("");

    if (!form.cliente.trim()) {
      setError("Selecciona un cliente del catálogo.");
      setGuardando(false);
      return;
    }
    if (form.lineas.length < 1 || form.lineas.length > 50) {
      setError("Agrega entre 1 y 50 conceptos al servicio.");
      setGuardando(false);
      return;
    }

    const invalido = resumenConceptos.lineas.find((linea) =>
      !linea.concepto ||
      !Number.isFinite(numero(linea.cantidad)) || numero(linea.cantidad) <= 0 ||
      linea.costo_unitario.trim() === "" ||
      !Number.isFinite(numero(linea.costo_unitario)) || numero(linea.costo_unitario) < 0 ||
      !Number.isFinite(numero(linea.iva_porcentaje)) || numero(linea.iva_porcentaje) < 0 || numero(linea.iva_porcentaje) > 100 ||
      !Number.isFinite(numero(linea.retencion_porcentaje)) || numero(linea.retencion_porcentaje) < 0 || numero(linea.retencion_porcentaje) > 100
    );
    if (invalido) {
      setError("Revisa cada concepto: descripción, cantidad, precio, IVA y retención deben tener valores válidos.");
      setGuardando(false);
      return;
    }
    if (form.estatus === "FACTURADO" && !form.factura.trim()) {
      setError("Para marcar el servicio como Facturado, captura el número de factura.");
      setGuardando(false);
      return;
    }
    if (form.estatus === "CANCELADO" && !form.motivo_cancelacion.trim()) {
      setError("Para cancelar el servicio, escribe el motivo de cancelación.");
      setGuardando(false);
      return;
    }
    if (form.estatus === "PAGADO" && !form.fecha_pago) {
      setError("Para marcar el servicio como Pagado, selecciona la fecha de pago.");
      setGuardando(false);
      return;
    }

    try {
      const conceptosDetalle = resumenConceptos.lineas.map((linea) => ({
        concepto: linea.concepto,
        cantidad: Number(linea.cantidad),
        costo_unitario: Number(linea.costo_unitario),
        iva_porcentaje: Number(linea.iva_porcentaje),
        retencion_porcentaje: linea.retencion_aplica ? Number(linea.retencion_porcentaje) : 0,
        retencion_aplica: linea.retencion_aplica,
      }));
      const body = {
        ...(editandoId ? { id: editandoId } : {}),
        cliente: form.cliente,
        factura: form.factura,
        concepto: descripcionFinal,
        conceptos_detalle: conceptosDetalle,
        // Compatibilidad con los campos históricos del servicio.
        cantidad: 1,
        costo_unitario: resumenConceptos.subtotal,
        iva_porcentaje: resumenConceptos.subtotal > 0
          ? Number((resumenConceptos.iva / resumenConceptos.subtotal * 100).toFixed(10)) : 0,
        retencion_porcentaje: resumenConceptos.subtotal > 0
          ? Number((resumenConceptos.retencion / resumenConceptos.subtotal * 100).toFixed(10)) : 0,
        observaciones: form.observaciones,
        estatus: form.estatus,
        paquete: form.paquete,
        fecha_entrega: form.fecha_entrega || null,
        fecha_pago: form.fecha_pago || null,
        comentarios: form.comentarios,
        motivo_cancelacion: form.motivo_cancelacion,
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
      if (!res.ok || !json.ok) throw new Error(json.message || "No fue posible guardar el servicio.");
      const texto = editandoId ? "Servicio actualizado correctamente." : "Servicio registrado correctamente.";
      setFiltroEstatus(form.estatus);
      setCantidadVisible(5);
      setEditandoId(null);
      setForm(crearFormularioVacio());
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
      Partidas: cantidadPartidas(s),
      Conceptos: descripcionPartidas(s),
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
      "Motivo de cancelación": s.motivo_cancelacion ?? "",
      "Fecha de registro": s.created_at ?? "",
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    hoja["!cols"] = [
      { wch: 25 }, { wch: 18 }, { wch: 12 }, { wch: 70 }, { wch: 17 },
      { wch: 17 }, { wch: 17 }, { wch: 16 }, { wch: 20 }, { wch: 18 },
      { wch: 18 }, { wch: 35 }, { wch: 35 }, { wch: 22 }, { wch: 18 },
    ];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Servicios");
    XLSX.writeFile(libro, `neo-servicios-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <main className="neo-app min-h-screen bg-slate-100 text-slate-800">
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
            Registra un servicio con uno o varios conceptos. Cada partida conserva su propia cantidad, precio, IVA y retención; la app suma los importes automáticamente.
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
              <p className="mt-1 text-sm text-slate-500">Selecciona un cliente y agrega todas las partidas que forman parte del servicio.</p>
            </div>
            {editandoId && <button type="button" onClick={cancelarEdicion} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cancelar edición</button>}
          </div>

          <form onSubmit={guardar} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className={claseEtiqueta}>Cliente *
                <select className={claseCampo} value={form.cliente} onChange={(e)=>cambiar("cliente",e.target.value)} required disabled={cargandoCatalogos||clientes.length===0}>
                  <option value="">{cargandoCatalogos?"Cargando clientes...":"Selecciona un cliente"}</option>
                  {clientes.map((cliente)=><option key={cliente.id} value={cliente.nombre}>{cliente.nombre}</option>)}
                </select>
              </label>
              <label className={claseEtiqueta}>Número de factura{form.estatus==="FACTURADO"?" *":""}
                {form.estatus==="FACTURADO"
                  ? <input className={claseCampo} value={form.factura} onChange={(e)=>cambiar("factura",e.target.value)} placeholder="Captura el número de factura" maxLength={100} required/>
                  : <input className={claseCampo} value={editandoId?(form.factura||"Sin número asignado"):"Se asigna al guardar"} readOnly aria-readonly="true"/>}
                <span className="mt-1 block text-xs font-normal text-slate-500">{form.estatus==="FACTURADO"?"Confirma el número consecutivo o captura el folio que corresponda.":editandoId?"El número consecutivo existente se conserva al editar.":"El sistema asignará el siguiente número consecutivo al registrar el servicio."}</span>
              </label>
              <label className={claseEtiqueta}>Paquete o referencia
                <input className={claseCampo} value={form.paquete} onChange={(e)=>cambiar("paquete",e.target.value)} placeholder="Nombre o referencia" maxLength={200}/>
              </label>
              <label className={claseEtiqueta}>Estatus
                <select className={claseCampo} value={form.estatus} onChange={(e)=>cambiar("estatus",e.target.value as Estatus)}>{estatusOpciones.map((opcion)=><option key={opcion} value={opcion}>{textoEstatus(opcion)}</option>)}</select>
              </label>
              <label className={claseEtiqueta}>Fecha de entrega
                <input className={claseCampo} type="date" value={form.fecha_entrega} onChange={(e)=>cambiar("fecha_entrega",e.target.value)}/>
              </label>
              {(form.estatus==="PAGADO"||Boolean(form.fecha_pago))&&<label className={claseEtiqueta}>Fecha de pago{form.estatus==="PAGADO"?" *":""}
                <input className={claseCampo} type="date" value={form.fecha_pago} onChange={(e)=>cambiar("fecha_pago",e.target.value)} required={form.estatus==="PAGADO"}/>
                {form.estatus==="PAGADO"&&<span className="mt-1 block text-xs font-normal text-cyan-800">La fecha de pago es obligatoria para guardar este estatus.</span>}
              </label>}
              {form.estatus==="CANCELADO"&&<label className={`${claseEtiqueta} sm:col-span-2 lg:col-span-3`}>Motivo de cancelación *
                <textarea className={claseCampo} value={form.motivo_cancelacion} onChange={(e)=>cambiar("motivo_cancelacion",e.target.value)} rows={3} placeholder="Explica por qué se cancela este servicio" maxLength={1000} required/>
                <span className="mt-1 block text-xs font-normal text-rose-700">Debes registrar el motivo para poder cancelar el servicio.</span>
              </label>}
            </div>

            <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-bold text-slate-900">Conceptos del servicio</h3><p className="mt-1 text-sm text-slate-500">Agrega una o varias partidas. Cada una tiene su propia cantidad, precio e impuestos.</p></div>
                <button type="button" onClick={agregarLinea} disabled={form.lineas.length>=50||guardando} className="rounded-xl bg-cyan-800 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-cyan-900 disabled:cursor-not-allowed disabled:opacity-50">+ Agregar concepto</button>
              </div>
              {form.lineas.map((linea,index)=>{
                const calculo=resumenConceptos.lineas[index];
                const conceptoCatalogo=conceptos.find((item)=>item.nombre===linea.concepto_base);
                return <article key={linea.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-50 text-sm font-bold text-cyan-800">{index+1}</span><div><p className="text-sm font-bold text-slate-900">Partida {index+1}</p><p className="text-xs text-slate-500">{linea.concepto_base&&linea.concepto_base!==CONCEPTO_MANUAL?linea.concepto_base:linea.concepto_base===CONCEPTO_MANUAL?"Concepto personalizado":"Selecciona un concepto"}</p></div></div>
                    <button type="button" onClick={()=>eliminarLinea(linea.id)} disabled={form.lineas.length<=1||guardando} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">Quitar partida</button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className={claseEtiqueta}>Concepto *
                      <select className={claseCampo} value={linea.concepto_base} onChange={(e)=>seleccionarConceptoLinea(linea.id,e.target.value)} required disabled={cargandoCatalogos||conceptos.length===0}>
                        <option value="">Selecciona un concepto</option>
                        {conceptos.map((concepto)=><option key={concepto.id} value={concepto.nombre}>{concepto.nombre}</option>)}
                        <option value={CONCEPTO_MANUAL}>Otro concepto (manual)</option>
                      </select>
                    </label>
                    {linea.concepto_base===CONCEPTO_MANUAL&&<label className={claseEtiqueta}>Descripción del concepto *
                      <input className={claseCampo} value={linea.concepto_manual} onChange={(e)=>actualizarLinea(linea.id,{concepto_manual:e.target.value})} placeholder="Describe el servicio o concepto" maxLength={700} required/>
                    </label>}
                    <label className={claseEtiqueta}>Cantidad *
                      <input className={claseCampo} type="number" value={linea.cantidad} onChange={(e)=>actualizarLinea(linea.id,{cantidad:e.target.value})} min="0.01" step="any" required/>
                    </label>
                    <label className={claseEtiqueta}>Precio unitario (MXN) *
                      <input className={claseCampo} type="number" value={linea.costo_unitario} onChange={(e)=>actualizarLinea(linea.id,{costo_unitario:e.target.value})} min="0" step="0.01" required placeholder="Precio de esta partida"/>
                      {conceptoCatalogo?.precio_manual&&<span className="mt-1 block text-xs font-normal text-amber-700">Este concepto requiere capturar el precio manualmente.</span>}
                    </label>
                    <label className={claseEtiqueta}>IVA (%)
                      <input className={claseCampo} type="number" value={linea.iva_porcentaje} onChange={(e)=>actualizarLinea(linea.id,{iva_porcentaje:e.target.value})} min="0" max="100" step="0.01" required/>
                    </label>
                    <label className={claseEtiqueta}>{linea.retencion_aplica?"Retención (%)":"Retención (no aplica)"}
                      <input className={claseCampo} type="number" value={linea.retencion_porcentaje} onChange={(e)=>actualizarLinea(linea.id,{retencion_porcentaje:e.target.value})} min="0" max="100" step="0.01" required disabled={!linea.retencion_aplica}/>
                    </label>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4">
                    <div><p className="text-xs text-slate-500">Subtotal</p><p className="mt-1 text-sm font-semibold">{dinero(calculo?.subtotal??0)}</p></div>
                    <div><p className="text-xs text-slate-500">IVA</p><p className="mt-1 text-sm font-semibold">{dinero(calculo?.iva??0)}</p></div>
                    <div><p className="text-xs text-slate-500">Retención</p><p className="mt-1 text-sm font-semibold">{linea.retencion_aplica?dinero(calculo?.retencion??0):"No aplica"}</p></div>
                    <div><p className="text-xs text-slate-500">Total de partida</p><p className="mt-1 text-sm font-bold text-cyan-900">{dinero(calculo?.total??0)}</p></div>
                  </div>
                </article>;
              })}
              <p className="text-xs text-slate-500">Puedes agregar hasta 50 conceptos en un mismo servicio. Los servicios anteriores se conservan y se abren como una sola partida.</p>
            </section>

            <section className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
              <h3 className="font-bold text-slate-800">Resumen de importes del servicio</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs text-slate-500">Subtotal</p><p className="mt-1 font-semibold">{dinero(resumenConceptos.subtotal)}</p></div>
                <div><p className="text-xs text-slate-500">IVA</p><p className="mt-1 font-semibold">{dinero(resumenConceptos.iva)}</p></div>
                <div><p className="text-xs text-slate-500">Retención</p><p className="mt-1 font-semibold">{dinero(resumenConceptos.retencion)}</p></div>
                <div><p className="text-xs text-slate-500">Total del servicio</p><p className="mt-1 text-xl font-bold text-cyan-900">{dinero(resumenConceptos.total)}</p></div>
              </div>
              <p className="mt-3 text-xs text-slate-500">El total se calcula sumando cada partida con sus propios impuestos y retenciones.</p>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={claseEtiqueta}>Observaciones
                <textarea className={claseCampo} value={form.observaciones} onChange={(e) => cambiar("observaciones", e.target.value)} rows={3} placeholder="Notas internas sobre el servicio" />
              </label>
              <label className={claseEtiqueta}>Comentarios
                <textarea className={claseCampo} value={form.comentarios} onChange={(e) => cambiar("comentarios", e.target.value)} rows={3} placeholder="Seguimiento, acuerdos o información adicional" />
              </label>
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

          {mensajeRapido && (
            <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {mensajeRapido}
            </div>
          )}

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
            <table className="min-w-[1320px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-900 text-white"><tr>
                <th className="px-4 py-3">Cliente / orden interno / factura</th><th className="px-4 py-3">Conceptos y partidas</th><th className="px-4 py-3 text-right">Partidas</th><th className="px-4 py-3 text-right">Subtotal</th><th className="px-4 py-3 text-right">IVA</th><th className="px-4 py-3 text-right">Retención</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Entrega / antigüedad</th><th className="px-4 py-3">Pago</th><th className="px-4 py-3">Estatus</th><th className="px-4 py-3">Detalles</th><th className="px-4 py-3">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {cargando ? (
                  <tr><td colSpan={12} className="px-4 py-12 text-center text-slate-500">Cargando servicios...</td></tr>
                ) : filtrados.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-12 text-center text-slate-500">{servicios.length === 0 ? "Todavía no hay servicios registrados." : busqueda.trim() ? "No hay servicios que coincidan con la búsqueda." : `No hay servicios con estatus ${textoEstatus(filtroEstatus).toLowerCase()}.`}</td></tr>
                ) : visibles.map((s) => (
                  <tr key={s.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-4">
                      <p className="font-bold text-slate-900">{s.cliente}</p>
                      <p className="mt-1 text-xs font-semibold text-teal-800">Orden interno: {ordenesInternos.get(s.id) ?? "—"}</p>
                      <p className="mt-1 text-xs text-slate-500">Factura real: {s.factura || "Sin factura"}</p>
                      {s.paquete && <p className="mt-1 text-xs text-slate-500">Ref.: {s.paquete}</p>}
                    </td>
                    <td className="max-w-sm px-4 py-4">
                      <p className="whitespace-pre-wrap font-semibold text-slate-800">{s.concepto}</p>
                      {Array.isArray(s.conceptos_detalle) && s.conceptos_detalle.length>0 && <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                        {s.conceptos_detalle.map((linea,indice)=><p key={`${s.id}-${indice}`} className="text-xs leading-5 text-slate-500">
                          {linea.concepto}: {numero(linea.cantidad).toLocaleString("es-MX")} × {dinero(linea.costo_unitario)} = <strong className="text-slate-700">{dinero(linea.subtotal??numero(linea.cantidad)*numero(linea.costo_unitario))}</strong>
                        </p>)}
                      </div>}
                    </td>
                    <td className="px-4 py-4 text-right">{cantidadPartidas(s)}</td>
                    <td className="px-4 py-4 text-right font-semibold">{dinero(s.subtotal)}</td>
                    <td className="px-4 py-4 text-right">{dinero(s.iva)}</td>
                    <td className="px-4 py-4 text-right">{dinero(s.retencion)}</td>
                    <td className="px-4 py-4 text-right font-bold">{dinero(s.total)}</td>
                    <td className="px-4 py-4"><p>{fechaMostrar(s.fecha_entrega)}</p><p className="mt-1 text-xs text-slate-500">{diasEntrega(s.fecha_entrega)}</p></td>
                    <td className="px-4 py-4">{fechaMostrar(s.fecha_pago)}</td>
                    <td className="px-4 py-4"><span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${claseEstatus(s.estatus)}`}>{textoEstatus(s.estatus)}</span></td>
                    <td className="max-w-xs px-4 py-4">{s.observaciones && <p className="mb-2 whitespace-pre-wrap text-xs text-slate-600"><strong>Observaciones: </strong>{s.observaciones}</p>}{s.comentarios && <p className="whitespace-pre-wrap text-xs text-slate-600"><strong>Comentarios: </strong>{s.comentarios}</p>}{s.motivo_cancelacion && <p className="whitespace-pre-wrap text-xs text-rose-700"><strong>Motivo de cancelación: </strong>{s.motivo_cancelacion}</p>}{!s.observaciones && !s.comentarios && !s.motivo_cancelacion && <span className="text-xs text-slate-400">Sin detalles</span>}</td>
                    <td className="px-4 py-4">
                      <div className="flex min-w-[128px] flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => abrirEdicionRapida(s)}
                          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800 hover:bg-teal-100"
                        >
                          Edición rápida
                        </button>
                        <button
                          type="button"
                          onClick={() => editar(s)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          Editar completo
                        </button>
                      </div>
                    </td>
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

        {edicionRapida && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6">
            <button
              type="button"
              aria-label="Cerrar edición rápida"
              onClick={() => setEdicionRapida(null)}
              className="absolute inset-0 h-full w-full cursor-default"
            />
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="quick-edit-title"
              className="relative z-10 max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
            >
              <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-teal-700">Actualización administrativa</p>
                  <h2 id="quick-edit-title" className="mt-1 text-xl font-extrabold text-slate-900">Edición rápida</h2>
                  <p className="mt-1 text-sm text-slate-600">{edicionRapida.cliente} · Factura actual: {edicionRapida.factura || "Sin factura"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEdicionRapida(null)}
                  disabled={guardandoRapido}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cerrar
                </button>
              </header>

              <form onSubmit={guardarEdicionRapida} className="space-y-5 px-5 py-5 sm:px-6">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Servicio seleccionado</p>
                  <p className="mt-1 font-semibold text-slate-900">{edicionRapida.concepto}</p>
                  <p className="mt-1 text-sm text-slate-600">Total: <strong>{dinero(edicionRapida.total)}</strong></p>
                  <p className="mt-2 text-xs text-slate-500">Esta pantalla solo cambia factura y datos administrativos. Los conceptos, cantidades, precios e impuestos no se modifican.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={claseEtiqueta}>Estatus *
                    <select
                      className={claseCampo}
                      value={formRapido.estatus}
                      onChange={(e) => cambiarRapido("estatus", e.target.value as Estatus)}
                      required
                    >
                      {estatusOpciones.map((opcion) => (
                        <option key={opcion} value={opcion}>{textoEstatus(opcion)}</option>
                      ))}
                    </select>
                  </label>

                  {(formRapido.estatus === "FACTURADO" || Boolean(edicionRapida.factura)) && (
                    <label className={`${claseEtiqueta} rounded-xl border ${edicionRapida.estatus !== "FACTURADO" && formRapido.estatus === "FACTURADO" ? "border-amber-300 bg-amber-50 p-3" : "border-slate-200 p-3"}`}>
                      Número de factura{formRapido.estatus === "FACTURADO" ? " *" : ""}
                      <input
                        className={claseCampo}
                        value={formRapido.factura}
                        onChange={(e) => cambiarRapido("factura", e.target.value)}
                        placeholder="Ej. 2056"
                        maxLength={100}
                        required={formRapido.estatus === "FACTURADO"}
                        autoFocus={edicionRapida.estatus !== "FACTURADO" && formRapido.estatus === "FACTURADO"}
                      />
                      <span className="mt-1 block text-xs font-normal text-slate-600">
                        {edicionRapida.estatus !== "FACTURADO" && formRapido.estatus === "FACTURADO"
                          ? "Ingresa el folio real de la factura para confirmar el cambio a Facturado."
                          : "Puedes corregir el folio sin abrir las partidas del servicio."}
                      </span>
                    </label>
                  )}

                  <label className={claseEtiqueta}>Paquete o referencia
                    <input
                      className={claseCampo}
                      value={formRapido.paquete}
                      onChange={(e) => cambiarRapido("paquete", e.target.value)}
                      placeholder="Nombre o referencia"
                      maxLength={200}
                    />
                  </label>

                  <label className={claseEtiqueta}>Fecha de entrega
                    <input
                      className={claseCampo}
                      type="date"
                      value={formRapido.fecha_entrega}
                      onChange={(e) => cambiarRapido("fecha_entrega", e.target.value)}
                    />
                  </label>

                  {(formRapido.estatus === "PAGADO" || Boolean(formRapido.fecha_pago)) && (
                    <label className={claseEtiqueta}>Fecha de pago{formRapido.estatus === "PAGADO" ? " *" : ""}
                      <input
                        className={claseCampo}
                        type="date"
                        value={formRapido.fecha_pago}
                        onChange={(e) => cambiarRapido("fecha_pago", e.target.value)}
                        required={formRapido.estatus === "PAGADO"}
                      />
                    </label>
                  )}

                  {formRapido.estatus === "CANCELADO" && (
                    <label className={`${claseEtiqueta} sm:col-span-2`}>Motivo de cancelación *
                      <textarea
                        className={claseCampo}
                        value={formRapido.motivo_cancelacion}
                        onChange={(e) => cambiarRapido("motivo_cancelacion", e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="Explica por qué se cancela el servicio"
                        required
                      />
                    </label>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={claseEtiqueta}>Observaciones
                    <textarea
                      className={claseCampo}
                      value={formRapido.observaciones}
                      onChange={(e) => cambiarRapido("observaciones", e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="Notas internas sobre el servicio"
                    />
                  </label>
                  <label className={claseEtiqueta}>Comentarios
                    <textarea
                      className={claseCampo}
                      value={formRapido.comentarios}
                      onChange={(e) => cambiarRapido("comentarios", e.target.value)}
                      rows={3}
                      maxLength={2000}
                      placeholder="Seguimiento, acuerdos o información adicional"
                    />
                  </label>
                </div>

                {errorRapido && (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {errorRapido}
                  </div>
                )}

                <footer className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-white py-4">
                  <button
                    type="button"
                    onClick={() => setEdicionRapida(null)}
                    disabled={guardandoRapido}
                    className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={guardandoRapido}
                    className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-bold text-white hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60"
                  >
                    {guardandoRapido ? "Guardando..." : "Guardar cambios"}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}

        <footer className="pb-5 text-center text-xs text-slate-400">Neo Transportaciones · Panel privado</footer>
      </div>
    </main>
  );
}
