import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ESTADOS = ["PROGRAMADO","ASIGNADO","EN_RUTA","ENTREGADO","INCIDENCIA","CANCELADO"];
type Input = {
  servicio_id?: unknown; estatus_operativo?: unknown; origen?: unknown; destino?: unknown;
  tipo_unidad?: unknown; operador?: unknown; telefono_operador?: unknown; placas?: unknown;
  fecha_programada?: unknown; fecha_entrega_real?: unknown; notas?: unknown;
};
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
async function autorizado() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value);
}
function error(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  if (!(await autorizado())) return error("Inicia sesión para consultar los envíos.", 401);
  try {
    const { data: servicios, error: serviciosError } = await supabaseAdmin
      .from("servicios")
      .select("id, cliente, factura, cantidad, concepto, costo_unitario, total, estatus, paquete, fecha_entrega, observaciones, comentarios, created_at")
      .in("estatus", ["PENDIENTE","FACTURADO","PAGADO"])
      .order("created_at", { ascending: false })
      .limit(1000);
    if (serviciosError) {
      console.error("Error consultando servicios activos:", serviciosError.code);
      return error("No fue posible cargar los servicios existentes.", 500);
    }
    const ids = (servicios ?? []).map((s) => s.id);
    let seguimientos: Record<string, unknown>[] = [];
    if (ids.length) {
      const { data, error: seguimientoError } = await supabaseAdmin
        .from("neo_envios")
        .select("id, servicio_id, estatus_operativo, origen, destino, tipo_unidad, operador, telefono_operador, placas, fecha_programada, fecha_entrega_real, notas, created_at, updated_at")
        .in("servicio_id", ids);
      if (seguimientoError) {
        console.error("Error consultando seguimiento de envíos:", seguimientoError.code);
        return error("No fue posible cargar el seguimiento. Verifica que hayas aplicado la migración de módulos en Supabase.", 500);
      }
      seguimientos = (data ?? []) as Record<string, unknown>[];
    }
    const porServicio = new Map(seguimientos.map((s) => [String(s.servicio_id), s]));
    const result = (servicios ?? [])
      .map((servicio) => ({ ...servicio, seguimiento: porServicio.get(String(servicio.id)) ?? null }))
      .filter((servicio) => {
        const estado = (servicio.seguimiento as Record<string, unknown> | null)?.estatus_operativo;
        return estado !== "ENTREGADO" && estado !== "CANCELADO";
      });
    return NextResponse.json({ ok: true, data: result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return error("Ocurrió un error al consultar los envíos activos.", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!(await autorizado())) return error("Inicia sesión para actualizar envíos.", 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return error("Origen de solicitud no permitido.", 403);
  let body: Input;
  try { body = await request.json() as Input; } catch { return error("La solicitud no contiene JSON válido."); }

  const serviceId = texto(body.servicio_id, 50);
  const status = texto(body.estatus_operativo, 30) ?? "PROGRAMADO";
  if (!serviceId) return error("Selecciona un servicio válido.");
  if (!ESTADOS.includes(status)) return error("Selecciona un estado operativo válido.");

  const fechaProgramada = fecha(body.fecha_programada);
  const fechaReal = fecha(body.fecha_entrega_real);
  if (fechaProgramada === undefined || fechaReal === undefined) return error("Revisa las fechas de programación y entrega.");

  try {
    const { data: servicio, error: serviceError } = await supabaseAdmin
      .from("servicios")
      .select("id, estatus")
      .eq("id", serviceId)
      .maybeSingle();
    if (serviceError) {
      console.error("Error validando servicio de envío:", serviceError.code);
      return error("No fue posible validar el servicio seleccionado.", 500);
    }
    if (!servicio) return error("El servicio seleccionado no existe.", 404);
    if (servicio.estatus === "CANCELADO") return error("No puedes dar seguimiento a un servicio cancelado.");

    const record = {
      servicio_id: serviceId,
      estatus_operativo: status,
      origen: texto(body.origen, 500),
      destino: texto(body.destino, 500),
      tipo_unidad: texto(body.tipo_unidad, 100),
      operador: texto(body.operador, 200),
      telefono_operador: texto(body.telefono_operador, 40),
      placas: texto(body.placas, 30),
      fecha_programada: fechaProgramada,
      fecha_entrega_real: fechaReal,
      notas: texto(body.notas, 2000),
      updated_at: new Date().toISOString(),
    };
    const { data, error: dbError } = await supabaseAdmin
      .from("neo_envios")
      .upsert(record, { onConflict: "servicio_id" })
      .select("*")
      .single();
    if (dbError) {
      console.error("Error guardando seguimiento de envío:", dbError.code);
      return error("No fue posible guardar el seguimiento. Verifica que hayas aplicado la migración de módulos en Supabase.", 500);
    }
    return NextResponse.json({ ok: true, data, message: "Seguimiento actualizado correctamente." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return error("Ocurrió un error al actualizar el envío.", 500);
  }
}
