import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Input = Record<string, unknown>;

function texto(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim().slice(0, max);
  return result || null;
}

function compararClave(recibida: string, esperada: string): boolean {
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

function fecha(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}

function monto(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function respuesta(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { ok: false, message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Endpoint privado para que el workflow EXISTENTE de n8n registre una
 * cotización. Protegido con la misma clave privada que Neo ya usa con n8n.
 * Solo permite crear registros; no permite consultar, editar ni eliminar.
 */
export async function POST(request: NextRequest) {
  const claveEsperada = process.env.NEO_BANDEJA_KEY;
  if (!claveEsperada || claveEsperada.includes("PEGA_AQUI")) {
    return respuesta("La conexión privada de cotizaciones no está configurada.", 503);
  }

  const claveRecibida = request.headers.get("x-neo-bandeja-key") ?? "";
  if (!compararClave(claveRecibida, claveEsperada)) {
    return respuesta("No autorizado.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respuesta("La solicitud no contiene JSON válido.");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return respuesta("Se esperaba un objeto JSON con los datos de la cotización.");
  }

  const objeto = body as Input;
  const datos =
    objeto.data && typeof objeto.data === "object" && !Array.isArray(objeto.data)
      ? objeto.data as Input
      : objeto;

  const telefonoRaw = texto(datos.telefono ?? datos.phone ?? datos.numero, 40);
  const telefono = telefonoRaw ? telefonoRaw.replace(/[^\d+]/g, "").slice(0, 20) : null;
  const nombre = texto(datos.cliente ?? datos.nombre_cliente ?? datos.nombre, 200);
  const cliente = nombre || (telefono ? `Prospecto WhatsApp (${telefono})` : null);
  const servicio = texto(datos.servicio ?? datos.tipo_servicio, 100) ?? "Flete";
  const origen = texto(datos.origen ?? datos.origin, 500);
  const destino = texto(datos.destino ?? datos.destination, 500);

  const faltan: string[] = [];
  if (!origen) faltan.push("origen");
  if (!destino) faltan.push("destino");
  if (!cliente) faltan.push("nombre del cliente o teléfono");

  if (faltan.length) {
    return respuesta(
      "No se guardó la cotización porque faltan datos obligatorios.",
      422,
      { code: "DATOS_INCOMPLETOS", faltan }
    );
  }

  const fechaServicio = fecha(datos.fecha_servicio ?? datos.fecha);
  const montoEstimado = monto(datos.monto_estimado ?? datos.monto);
  if (fechaServicio === undefined) return respuesta("La fecha del servicio no es válida.");
  if (montoEstimado === undefined) return respuesta("El monto estimado debe ser un número igual o mayor a cero.");

  const record = {
    cliente,
    telefono,
    servicio,
    origen,
    destino,
    mercancia: texto(datos.mercancia ?? datos.carga, 500),
    peso: texto(datos.peso, 100),
    tipo_unidad: texto(datos.tipo_unidad ?? datos.unidad, 100),
    tipo_flete: texto(datos.tipo_flete, 30),
    fecha_servicio: fechaServicio,
    monto_estimado: montoEstimado,
    estado: "PENDIENTE",
    notas: texto(datos.notas ?? datos.resumen, 2000),
    origen_registro: "WHATSAPP",
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("neo_cotizaciones")
      .insert(record)
      .select("id, cliente, telefono, servicio, origen, destino, estado, origen_registro, created_at")
      .single();

    if (error) {
      console.error("Error registrando cotización desde n8n:", error.code);
      return respuesta("No fue posible guardar la cotización en Supabase.", 500);
    }

    return NextResponse.json(
      { ok: true, message: "Cotización de WhatsApp registrada.", data },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return respuesta("Ocurrió un error al registrar la cotización.", 500);
  }
}
