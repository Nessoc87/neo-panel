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
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function textoNormalizado(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function pesoValido(value: unknown): boolean {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const match = String(value).trim().match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return false;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0;
}

function respuesta(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { ok: false, message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

/**
 * Endpoint privado para que el workflow EXISTENTE de n8n registre una
 * cotización que ya fue generada. Protegido con la clave privada de Neo.
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
  const servicio = texto(datos.servicio ?? datos.tipo_servicio, 100);
  const servicioNormalizado = textoNormalizado(servicio);
  const esSoloManiobra = servicioNormalizado === "maniobra";
  const esFleteConManiobra =
    servicioNormalizado.includes("flete") && servicioNormalizado.includes("maniobra");

  const origen = texto(datos.origen ?? datos.origin, 500);
  const destino = texto(datos.destino ?? datos.destination, 500);
  const mercancia = texto(datos.mercancia ?? datos.carga, 500);
  const peso = texto(datos.peso, 100);
  const tipoUnidad = texto(datos.tipo_unidad ?? datos.tipoUnidad ?? datos.unidad, 100);
  const tipoFleteRaw = texto(datos.tipo_flete ?? datos.tipoFlete, 30);
  const tipoFleteNormalizado = textoNormalizado(tipoFleteRaw);
  const tipoFlete =
    tipoFleteNormalizado === "foraneo"
      ? "foráneo"
      : tipoFleteNormalizado === "local"
        ? "local"
        : tipoFleteRaw;

  const fechaServicio = fecha(datos.fecha_servicio ?? datos.fecha);
  const montoEstimado = monto(datos.monto_estimado ?? datos.total ?? datos.monto);

  const faltan: string[] = [];
  if (!cliente) faltan.push("nombre del cliente o teléfono");
  if (!servicio) faltan.push("servicio");

  if (fechaServicio === undefined) {
    return respuesta("La fecha del servicio no es válida.");
  }
  if (!fechaServicio) faltan.push("fecha del servicio");

  if (montoEstimado === null || montoEstimado === undefined) {
    return respuesta(
      "No se guardó la cotización: el importe debe ser un número válido mayor que cero.",
      422,
      { code: "IMPORTE_INVALIDO" }
    );
  }

  let lugarManiobra: string | null = null;
  let tipoManiobra: string | null = null;
  let personas: number | null = null;

  if (esSoloManiobra || esFleteConManiobra) {
    lugarManiobra = texto(datos.lugarManiobra ?? datos.lugar_maniobra, 500);
    tipoManiobra = texto(datos.tipoManiobra ?? datos.tipo_maniobra, 300);
    const numeroPersonas = Number(datos.personas);

    if (esSoloManiobra || esFleteConManiobra) {
      if (!lugarManiobra) faltan.push("lugar de maniobra");
      if (!tipoManiobra) faltan.push("tipo de maniobra");
      if (!Number.isInteger(numeroPersonas) || numeroPersonas < 1) {
        faltan.push("cantidad de personas para maniobra");
      } else {
        personas = numeroPersonas;
      }
    }
  }

  if (!esSoloManiobra) {
    if (!origen) faltan.push("origen");
    if (!destino) faltan.push("destino");
    if (!mercancia) faltan.push("mercancía");
    if (!peso || !pesoValido(peso)) faltan.push("peso válido mayor que cero");
    if (!tipoUnidad) faltan.push("tipo de unidad");

    if (servicioNormalizado.includes("flete")) {
      if (!["local", "foraneo"].includes(tipoFleteNormalizado)) {
        faltan.push("tipo de flete (local o foráneo)");
      }
    }
  }

  if (faltan.length) {
    return respuesta(
      "No se guardó la cotización porque faltan datos obligatorios o válidos.",
      422,
      { code: "DATOS_INCOMPLETOS", faltan }
    );
  }

  const notasBase = texto(datos.notas ?? datos.resumen, 2000);
  const detallesManiobra = (esSoloManiobra || esFleteConManiobra)
    ? [
        lugarManiobra ? `Lugar de maniobra: ${lugarManiobra}` : null,
        tipoManiobra ? `Tipo de maniobra: ${tipoManiobra}` : null,
        personas !== null ? `Personas: ${personas}` : null,
      ].filter(Boolean).join(" | ")
    : "";

  const notas = [notasBase, detallesManiobra]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000) || null;

  const record = {
    cliente,
    telefono,
    servicio,
    origen,
    destino,
    mercancia,
    peso,
    tipo_unidad: tipoUnidad,
    tipo_flete: tipoFlete,
    fecha_servicio: fechaServicio,
    monto_estimado: montoEstimado,
    estado: "COTIZADA",
    notas,
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
