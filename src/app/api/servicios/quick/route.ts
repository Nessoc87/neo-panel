import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type EstatusServicio = "PENDIENTE" | "FACTURADO" | "PAGADO" | "CANCELADO";

function textValue(value: unknown, maxLength = 2000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function optionalDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return undefined;
  }
  return value;
}

async function requireSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export async function PATCH(request: NextRequest) {
  if (!(await requireSession())) {
    return NextResponse.json(
      { ok: false, message: "Inicia sesión para editar servicios." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { ok: false, message: "Origen de solicitud no permitido." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Solicitud no válida.");
    }
    body = input as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, message: "La solicitud no contiene datos válidos." },
      { status: 400 }
    );
  }

  const id = textValue(body.id, 50);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json(
      { ok: false, message: "El identificador del servicio no es válido." },
      { status: 400 }
    );
  }

  const estatus = textValue(body.estatus, 50).toUpperCase() as EstatusServicio;
  const estadosPermitidos: EstatusServicio[] = ["PENDIENTE", "FACTURADO", "PAGADO", "CANCELADO"];
  if (!estadosPermitidos.includes(estatus)) {
    return NextResponse.json(
      { ok: false, message: "Selecciona un estatus permitido." },
      { status: 400 }
    );
  }

  const factura = textValue(body.factura, 100) || null;
  const paquete = textValue(body.paquete, 200) || null;
  const fechaEntrega = optionalDate(body.fecha_entrega);
  const fechaPago = optionalDate(body.fecha_pago);
  const observaciones = textValue(body.observaciones) || null;
  const comentarios = textValue(body.comentarios) || null;
  const motivoCancelacion = textValue(body.motivo_cancelacion, 1000) || null;

  if (fechaEntrega === undefined || fechaPago === undefined) {
    return NextResponse.json(
      { ok: false, message: "Una de las fechas no es válida." },
      { status: 400 }
    );
  }
  if (estatus === "FACTURADO" && !factura) {
    return NextResponse.json(
      { ok: false, message: "Captura el número de factura antes de marcar el servicio como Facturado." },
      { status: 400 }
    );
  }
  if (estatus === "PAGADO" && !fechaPago) {
    return NextResponse.json(
      { ok: false, message: "Selecciona la fecha de pago antes de marcar el servicio como Pagado." },
      { status: 400 }
    );
  }
  if (estatus === "CANCELADO" && !motivoCancelacion) {
    return NextResponse.json(
      { ok: false, message: "Indica el motivo de cancelación antes de guardar." },
      { status: 400 }
    );
  }

  // Deliberately limited update: concepts, quantities, prices, VAT,
  // withholding and generated amount columns are never overwritten here.
  const record = {
    factura,
    estatus,
    paquete,
    fecha_entrega: fechaEntrega,
    fecha_pago: fechaPago,
    observaciones,
    comentarios,
    motivo_cancelacion: motivoCancelacion,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("servicios")
      .update(record)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Error en edición rápida de servicio:", error.code);
      return NextResponse.json(
        { ok: false, message: "No fue posible actualizar los datos administrativos." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, message: "No se encontró el servicio seleccionado." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { ok: true, data, message: "Datos administrativos actualizados correctamente." },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "Ocurrió un error al actualizar los datos administrativos." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
