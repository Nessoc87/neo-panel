import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Input = {
  id?: unknown; cliente_id?: unknown; cliente?: unknown; contacto?: unknown; telefono?: unknown;
  servicio?: unknown; origen?: unknown; destino?: unknown; mercancia?: unknown;
  peso?: unknown; tipo_unidad?: unknown; tipo_flete?: unknown; fecha_servicio?: unknown;
  monto_estimado?: unknown; estado?: unknown; notas?: unknown; origen_registro?: unknown;
  partidas?: unknown; subtotal?: unknown; iva?: unknown; retencion?: unknown; total?: unknown;
  vigencia_dias?: unknown; condiciones?: unknown;
};

const ESTADOS = ["PENDIENTE","EN_REVISION","COTIZADA","ACEPTADA","RECHAZADA","CANCELADA"];
const CONDICIONES_DEFAULT = [
  "1. Vigencia: esta propuesta es válida durante 15 días naturales a partir de su fecha de emisión.",
  "2. Confirmación: la programación del servicio está sujeta a disponibilidad y a la aceptación por escrito de esta cotización.",
  "3. Información del servicio: el cliente debe proporcionar datos completos y correctos sobre mercancía, peso, dimensiones, origen, destino, horarios, accesos y requisitos especiales.",
  "4. Alcance y cargos adicionales: maniobras, esperas, casetas, almacenajes, cambios de ruta, kilómetros adicionales o segundos intentos que no estén incluidos en esta propuesta se cotizarán por separado y requerirán autorización del cliente antes de realizarse.",
  "5. Programación: las fechas y horarios se confirman al aceptar el servicio. Cualquier ajuste estará sujeto a disponibilidad operativa.",
  "6. Cambios y cancelaciones: deberán solicitarse con al menos 24 horas de anticipación. Los gastos o trabajos ya realizados y los compromisos no recuperables podrán cobrarse, previa justificación.",
  "7. Recepción y entrega: se podrá solicitar nombre y firma de quien recibe, así como evidencia razonable de recolección o entrega.",
  "8. Pago: la forma, fecha y plazo de pago serán los acordados por escrito al confirmar el servicio.",
  "9. Impuestos: el IVA y las retenciones mostrados se calculan con los porcentajes capturados en cada partida. Su aplicación definitiva deberá corresponder al tratamiento fiscal de la operación y de las partes.",
  "10. Seguro: cualquier cobertura de seguro deberá aparecer expresamente indicada en las partidas o notas de esta cotización; de lo contrario, se entenderá no incluida."
].join("\n");

type PartidaNormalizada = {
  descripcion: string; cantidad: number; precio_unitario: number;
  iva_porcentaje: number; retencion_porcentaje: number;
  subtotal: number; iva: number; retencion: number; total: number;
};
type ResumenPartidas = {
  partidas: PartidaNormalizada[]; subtotal: number; iva: number; retencion: number; total: number;
};

function texto(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s || null;
}
function numero(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
function moneda(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}
function fecha(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0,10) !== v ? undefined : v;
}
function monto(v: unknown): number | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  const n = numero(v);
  return n !== null && n >= 0 ? n : undefined;
}
function vigencia(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return 15;
  const n = numero(v);
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 365 ? n : null;
}
function normalizarPartidas(raw: unknown): ResumenPartidas | null | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 50) return null;

  const partidas: PartidaNormalizada[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    const descripcion = texto(item.descripcion, 700);
    const cantidad = numero(item.cantidad);
    const precio = numero(item.precio_unitario);
    const ivaPct = numero(item.iva_porcentaje);
    const retencionPct = numero(item.retencion_porcentaje);

    if (!descripcion || cantidad === null || cantidad <= 0 || cantidad > 1000000 ||
      precio === null || precio < 0 || precio > 1000000000 ||
      ivaPct === null || ivaPct < 0 || ivaPct > 100 ||
      retencionPct === null || retencionPct < 0 || retencionPct > 100) return null;

    const subtotal = moneda(cantidad * precio);
    const iva = moneda(subtotal * ivaPct / 100);
    const retencion = moneda(subtotal * retencionPct / 100);
    partidas.push({
      descripcion, cantidad, precio_unitario: precio,
      iva_porcentaje: ivaPct, retencion_porcentaje: retencionPct,
      subtotal, iva, retencion, total: moneda(subtotal + iva - retencion),
    });
  }

  const subtotal = moneda(partidas.reduce((sum, item) => sum + item.subtotal, 0));
  const iva = moneda(partidas.reduce((sum, item) => sum + item.iva, 0));
  const retencion = moneda(partidas.reduce((sum, item) => sum + item.retencion, 0));
  return { partidas, subtotal, iva, retencion, total: moneda(subtotal + iva - retencion) };
}
async function autorizado() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value);
}
function error(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!(await autorizado())) return error("Inicia sesión para consultar cotizaciones.", 401);
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from("neo_cotizaciones").select("*").order("created_at", { ascending: false }).limit(1000);
    if (dbError) {
      console.error("Error consultando cotizaciones:", dbError.code);
      return error("No fue posible cargar cotizaciones.", 500);
    }
    return NextResponse.json({ ok: true, data: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return error("Ocurrió un error al consultar cotizaciones.", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!(await autorizado())) return error("Inicia sesión para registrar cotizaciones.", 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return error("Origen de solicitud no permitido.", 403);
  let body: Input;
  try { body = await request.json() as Input; } catch { return error("La solicitud no contiene JSON válido."); }

  const cliente = texto(body.cliente, 200);
  const servicio = texto(body.servicio, 100);
  if (!cliente || !servicio) return error("El cliente y el tipo de servicio son obligatorios.");
  const fechaServicio = fecha(body.fecha_servicio);
  const montoEstimado = monto(body.monto_estimado);
  const estado = texto(body.estado, 30) ?? "PENDIENTE";
  const partidas = normalizarPartidas(body.partidas);
  const diasVigencia = vigencia(body.vigencia_dias);

  if (fechaServicio === undefined) return error("La fecha del servicio no es válida.");
  if (partidas === null) return error("Revisa las partidas: agrega al menos una y valida descripción, cantidad, precio e impuestos.");
  if (partidas === undefined && montoEstimado === undefined) return error("El monto estimado debe ser un número igual o mayor a cero.");
  if (!ESTADOS.includes(estado)) return error("Selecciona un estado de cotización válido.");
  if (diasVigencia === null) return error("La vigencia debe ser un número de 1 a 365 días.");

  const record: Record<string, unknown> = {
    cliente_id: texto(body.cliente_id, 50), cliente, contacto: texto(body.contacto, 200),
    telefono: texto(body.telefono, 40), servicio,
    origen: texto(body.origen, 500), destino: texto(body.destino, 500),
    mercancia: texto(body.mercancia, 500), peso: texto(body.peso, 100),
    tipo_unidad: texto(body.tipo_unidad, 100), tipo_flete: texto(body.tipo_flete, 30),
    fecha_servicio: fechaServicio, estado,
    notas: texto(body.notas, 2000), origen_registro: texto(body.origen_registro, 50) ?? "PANEL",
    partidas: partidas?.partidas ?? [],
    subtotal: partidas?.subtotal ?? null, iva: partidas?.iva ?? null,
    retencion: partidas?.retencion ?? null, total: partidas?.total ?? montoEstimado,
    monto_estimado: partidas?.total ?? montoEstimado,
    vigencia_dias: diasVigencia,
    condiciones: texto(body.condiciones, 8000) ?? CONDICIONES_DEFAULT,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error: dbError } = await supabaseAdmin.from("neo_cotizaciones").insert(record).select("*").single();
    if (dbError) {
      console.error("Error creando cotización:", dbError.code);
      return error("No fue posible guardar la cotización.", 500);
    }
    return NextResponse.json({ ok: true, data, message: "Cotización registrada correctamente." }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return error("Ocurrió un error al guardar la cotización.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await autorizado())) return error("Inicia sesión para editar cotizaciones.", 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return error("Origen de solicitud no permitido.", 403);
  let body: Input;
  try { body = await request.json() as Input; } catch { return error("La solicitud no contiene JSON válido."); }

  const id = texto(body.id, 50);
  const cliente = texto(body.cliente, 200);
  const servicio = texto(body.servicio, 100);
  if (!id || !cliente || !servicio) return error("El identificador, cliente y servicio son obligatorios.");
  const fechaServicio = fecha(body.fecha_servicio);
  const montoEstimado = monto(body.monto_estimado);
  const estado = texto(body.estado, 30) ?? "PENDIENTE";
  const partidas = normalizarPartidas(body.partidas);
  const diasVigencia = body.vigencia_dias === undefined ? undefined : vigencia(body.vigencia_dias);

  if (fechaServicio === undefined) return error("La fecha del servicio no es válida.");
  if (partidas === null) return error("Revisa las partidas: agrega al menos una y valida descripción, cantidad, precio e impuestos.");
  if (body.partidas === undefined && montoEstimado === undefined && body.monto_estimado !== undefined && body.monto_estimado !== null && body.monto_estimado !== "") return error("El monto estimado no es válido.");
  if (!ESTADOS.includes(estado)) return error("Selecciona un estado de cotización válido.");
  if (diasVigencia === null) return error("La vigencia debe ser un número de 1 a 365 días.");

  const record: Record<string, unknown> = {
    cliente_id: texto(body.cliente_id, 50), cliente,
    telefono: texto(body.telefono, 40), servicio,
    origen: texto(body.origen, 500), destino: texto(body.destino, 500),
    mercancia: texto(body.mercancia, 500), peso: texto(body.peso, 100),
    tipo_unidad: texto(body.tipo_unidad, 100), tipo_flete: texto(body.tipo_flete, 30),
    fecha_servicio: fechaServicio, estado,
    notas: texto(body.notas, 2000), updated_at: new Date().toISOString(),
  };
  // Keep the previously saved contact when older API clients omit this optional field.
  if (body.contacto !== undefined) record.contacto = texto(body.contacto, 200);
  if (partidas !== undefined) {
    record.partidas = partidas.partidas;
    record.subtotal = partidas.subtotal;
    record.iva = partidas.iva;
    record.retencion = partidas.retencion;
    record.total = partidas.total;
    record.monto_estimado = partidas.total;
  } else if (body.monto_estimado !== undefined) {
    record.monto_estimado = montoEstimado;
  }
  if (diasVigencia !== undefined) record.vigencia_dias = diasVigencia;
  if (body.condiciones !== undefined) record.condiciones = texto(body.condiciones, 8000) ?? CONDICIONES_DEFAULT;

  try {
    const { data, error: dbError } = await supabaseAdmin.from("neo_cotizaciones")
      .update(record).eq("id", id).select("*").maybeSingle();
    if (dbError) {
      console.error("Error editando cotización:", dbError.code);
      return error("No fue posible actualizar la cotización.", 500);
    }
    if (!data) return error("No se encontró la cotización seleccionada.", 404);
    return NextResponse.json({ ok: true, data, message: "Cotización actualizada correctamente." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return error("Ocurrió un error al actualizar la cotización.", 500);
  }
}
