import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ServiceInput = {
  cliente?: unknown;
  factura?: unknown;
  cantidad?: unknown;
  concepto?: unknown;
  costo_unitario?: unknown;
  iva_porcentaje?: unknown;
  retencion_porcentaje?: unknown;
  observaciones?: unknown;
  estatus?: unknown;
  paquete?: unknown;
  fecha_entrega?: unknown;
  fecha_pago?: unknown;
  comentarios?: unknown;
};

function textValue(value: unknown, maxLength = 2000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function numericValue(
  value: unknown,
  fallback: number
): number | null {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = typeof value === "number" ? value : Number(value);

  return Number.isFinite(number) ? number : null;
}

function optionalDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") return undefined;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return undefined;
  }

  return value;
}

async function requireSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return verifySessionToken(token);
}

export async function GET() {
  if (!(await requireSession())) {
    return NextResponse.json(
      { ok: false, message: "Inicia sesión para consultar los servicios." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("servicios")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1000);

    if (error) {
      console.error("Error consultando servicios:", error.code);

      return NextResponse.json(
        { ok: false, message: "No fue posible consultar los servicios." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, data: data ?? [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "Ocurrió un error consultando los servicios." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await requireSession())) {
    return NextResponse.json(
      { ok: false, message: "Inicia sesión para registrar servicios." },
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

  let body: ServiceInput;

  try {
    body = (await request.json()) as ServiceInput;
  } catch {
    return NextResponse.json(
      { ok: false, message: "La solicitud no contiene JSON válido." },
      { status: 400 }
    );
  }

  const cliente = textValue(body.cliente, 200);
  const factura = textValue(body.factura, 100) || null;
  const concepto = textValue(body.concepto, 1000);
  const cantidad = numericValue(body.cantidad, 1);
  const costoUnitario = numericValue(body.costo_unitario, 0);
  const ivaPorcentaje = numericValue(body.iva_porcentaje, 16);
  const retencionPorcentaje = numericValue(
    body.retencion_porcentaje,
    0
  );

  const fechaEntrega = optionalDate(body.fecha_entrega);
  const fechaPago = optionalDate(body.fecha_pago);

  if (!cliente) {
    return NextResponse.json(
      { ok: false, message: "Selecciona o escribe el cliente." },
      { status: 400 }
    );
  }

  if (!concepto) {
    return NextResponse.json(
      { ok: false, message: "El concepto del servicio es obligatorio." },
      { status: 400 }
    );
  }

  if (
    cantidad === null ||
    cantidad <= 0 ||
    costoUnitario === null ||
    costoUnitario < 0 ||
    ivaPorcentaje === null ||
    ivaPorcentaje < 0 ||
    ivaPorcentaje > 100 ||
    retencionPorcentaje === null ||
    retencionPorcentaje < 0 ||
    retencionPorcentaje > 100
  ) {
    return NextResponse.json(
      {
        ok: false,
        message: "Revisa cantidad, costo unitario, IVA y retención.",
      },
      { status: 400 }
    );
  }

  if (fechaEntrega === undefined || fechaPago === undefined) {
    return NextResponse.json(
      { ok: false, message: "Una de las fechas no es válida." },
      { status: 400 }
    );
  }

  const estatus = textValue(body.estatus, 50) || "PENDIENTE";

  const allowedStatuses = [
    "PENDIENTE",
    "FACTURADO",
    "PAGADO",
    "CANCELADO",
  ];

  if (!allowedStatuses.includes(estatus.toUpperCase())) {
    return NextResponse.json(
      { ok: false, message: "Selecciona un estatus permitido." },
      { status: 400 }
    );
  }

  const record = {
    cliente,
    factura,
    cantidad,
    concepto,
    costo_unitario: costoUnitario,
    iva_porcentaje: ivaPorcentaje,
    retencion_porcentaje: retencionPorcentaje,
    observaciones: textValue(body.observaciones) || null,
    estatus: estatus.toUpperCase(),
    paquete: textValue(body.paquete, 200) || null,
    fecha_entrega: fechaEntrega,
    fecha_pago: fechaPago,
    comentarios: textValue(body.comentarios) || null,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("servicios")
      .insert(record)
      .select("*")
      .single();

    if (error) {
      console.error("Error guardando servicio:", error.code);

      return NextResponse.json(
        { ok: false, message: "No fue posible guardar el servicio." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, data },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "Ocurrió un error al guardar el servicio." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
export async function PATCH(request: NextRequest) {
  if (!(await requireSession())) {
    return NextResponse.json(
      {
        ok: false,
        message: "Inicia sesión para editar servicios.",
      },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
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

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    )
  ) {
    return NextResponse.json(
      { ok: false, message: "El identificador del servicio no es válido." },
      { status: 400 }
    );
  }

  const cliente = textValue(body.cliente, 200);
  const factura = textValue(body.factura, 100) || null;
  const concepto = textValue(body.concepto, 1000);

  const cantidad = numericValue(body.cantidad, 1);
  const costoUnitario = numericValue(body.costo_unitario, 0);
  const ivaPorcentaje = numericValue(body.iva_porcentaje, 16);
  const retencionPorcentaje = numericValue(body.retencion_porcentaje, 0);

  const fechaEntrega = optionalDate(body.fecha_entrega);
  const fechaPago = optionalDate(body.fecha_pago);

  if (!cliente || !concepto) {
    return NextResponse.json(
      {
        ok: false,
        message: "El cliente y el concepto son obligatorios.",
      },
      { status: 400 }
    );
  }

  if (
    cantidad === null ||
    cantidad <= 0 ||
    costoUnitario === null ||
    costoUnitario < 0 ||
    ivaPorcentaje === null ||
    ivaPorcentaje < 0 ||
    ivaPorcentaje > 100 ||
    retencionPorcentaje === null ||
    retencionPorcentaje < 0 ||
    retencionPorcentaje > 100
  ) {
    return NextResponse.json(
      {
        ok: false,
        message: "Revisa cantidad, costo unitario, IVA y retención.",
      },
      { status: 400 }
    );
  }

  if (fechaEntrega === undefined || fechaPago === undefined) {
    return NextResponse.json(
      { ok: false, message: "Una de las fechas no es válida." },
      { status: 400 }
    );
  }

  const estatus = textValue(body.estatus, 50).toUpperCase();

  const allowedStatuses = [
    "PENDIENTE",
    "FACTURADO",
    "PAGADO",
    "CANCELADO",
  ];

  if (!allowedStatuses.includes(estatus)) {
    return NextResponse.json(
      { ok: false, message: "Selecciona un estatus permitido." },
      { status: 400 }
    );
  }

  const record = {
    cliente,
    factura,
    cantidad,
    concepto,
    costo_unitario: costoUnitario,
    iva_porcentaje: ivaPorcentaje,
    retencion_porcentaje: retencionPorcentaje,
    observaciones: textValue(body.observaciones) || null,
    estatus,
    paquete: textValue(body.paquete, 200) || null,
    fecha_entrega: fechaEntrega,
    fecha_pago: fechaPago,
    comentarios: textValue(body.comentarios) || null,
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
      console.error("Error editando servicio:", error.code);

      return NextResponse.json(
        { ok: false, message: "No fue posible actualizar el servicio." },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    if (!data) {
      return NextResponse.json(
        { ok: false, message: "No se encontró el servicio seleccionado." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { ok: true, data, message: "Servicio actualizado correctamente." },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "Ocurrió un error al actualizar el servicio." },
      { status: 500 }
    );
  }
}