import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Input = {
  id?: unknown; cliente_id?: unknown; cliente?: unknown; telefono?: unknown;
  servicio?: unknown; origen?: unknown; destino?: unknown; mercancia?: unknown;
  peso?: unknown; tipo_unidad?: unknown; tipo_flete?: unknown; fecha_servicio?: unknown;
  monto_estimado?: unknown; estado?: unknown; notas?: unknown; origen_registro?: unknown;
};

const ESTADOS = ["PENDIENTE","EN_REVISION","COTIZADA","ACEPTADA","RECHAZADA","CANCELADA"];
function texto(v: unknown, max = 500): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s || null;
}
function fecha(v: unknown): string | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0,10) !== v ? undefined : v;
}
function monto(v: unknown): number | null | undefined {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
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
      .from("neo_cotizaciones")
      .select("id, cliente_id, cliente, telefono, servicio, origen, destino, mercancia, peso, tipo_unidad, tipo_flete, fecha_servicio, monto_estimado, estado, notas, origen_registro, servicio_id, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (dbError) {
      console.error("Error consultando cotizaciones:", dbError.code);
      return error("No fue posible cargar cotizaciones. Verifica que hayas aplicado la migración de módulos en Supabase.", 500);
    }
    return NextResponse.json({ ok: true, data: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch { return error("Ocurrió un error al consultar cotizaciones.", 500); }
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
  if (fechaServicio === undefined) return error("La fecha del servicio no es válida.");
  if (montoEstimado === undefined) return error("El monto estimado debe ser un número igual o mayor a cero.");
  if (!ESTADOS.includes(estado)) return error("Selecciona un estado de cotización válido.");

  const record = {
    cliente_id: texto(body.cliente_id, 50),
    cliente,
    telefono: texto(body.telefono, 40),
    servicio,
    origen: texto(body.origen, 500),
    destino: texto(body.destino, 500),
    mercancia: texto(body.mercancia, 500),
    peso: texto(body.peso, 100),
    tipo_unidad: texto(body.tipo_unidad, 100),
    tipo_flete: texto(body.tipo_flete, 30),
    fecha_servicio: fechaServicio,
    monto_estimado: montoEstimado,
    estado,
    notas: texto(body.notas, 2000),
    origen_registro: texto(body.origen_registro, 50) ?? "PANEL",
    updated_at: new Date().toISOString(),
  };
  try {
    const { data, error: dbError } = await supabaseAdmin.from("neo_cotizaciones").insert(record).select("*").single();
    if (dbError) {
      console.error("Error creando cotización:", dbError.code);
      return error("No fue posible guardar la cotización.", 500);
    }
    return NextResponse.json({ ok: true, data, message: "Cotización registrada correctamente." }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return error("Ocurrió un error al guardar la cotización.", 500); }
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
  if (fechaServicio === undefined) return error("La fecha del servicio no es válida.");
  if (montoEstimado === undefined) return error("El monto estimado debe ser un número igual o mayor a cero.");
  if (!ESTADOS.includes(estado)) return error("Selecciona un estado de cotización válido.");

  const record = {
    cliente_id: texto(body.cliente_id, 50), cliente, telefono: texto(body.telefono, 40), servicio,
    origen: texto(body.origen, 500), destino: texto(body.destino, 500),
    mercancia: texto(body.mercancia, 500), peso: texto(body.peso, 100),
    tipo_unidad: texto(body.tipo_unidad, 100), tipo_flete: texto(body.tipo_flete, 30),
    fecha_servicio: fechaServicio, monto_estimado: montoEstimado, estado,
    notas: texto(body.notas, 2000), updated_at: new Date().toISOString(),
  };
  try {
    const { data, error: dbError } = await supabaseAdmin.from("neo_cotizaciones").update(record).eq("id", id).select("*").maybeSingle();
    if (dbError) {
      console.error("Error editando cotización:", dbError.code);
      return error("No fue posible actualizar la cotización.", 500);
    }
    if (!data) return error("No se encontró la cotización seleccionada.", 404);
    return NextResponse.json({ ok: true, data, message: "Cotización actualizada correctamente." }, { headers: { "Cache-Control": "no-store" } });
  } catch { return error("Ocurrió un error al actualizar la cotización.", 500); }
}
