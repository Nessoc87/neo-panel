import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireNeoPermission } from "@/lib/neo-auth";

type ServiceInput = {
  cliente?: unknown;
  factura?: unknown;
  cantidad?: unknown;
  concepto?: unknown;
  conceptos_detalle?: unknown;
  costo_unitario?: unknown;
  iva_porcentaje?: unknown;
  retencion_porcentaje?: unknown;
  observaciones?: unknown;
  estatus?: unknown;
  paquete?: unknown;
  fecha_entrega?: unknown;
  fecha_pago?: unknown;
  comentarios?: unknown;
  motivo_cancelacion?: unknown;
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

type ConceptoNormalizado = {
  concepto: string;
  subconceptos: string[];
  cantidad: number;
  costo_unitario: number;
  iva_porcentaje: number;
  retencion_porcentaje: number;
  retencion_aplica: boolean;
  subtotal: number;
  iva: number;
  retencion: number;
  total: number;
};
type ResumenConceptos = {
  lineas: ConceptoNormalizado[]; concepto: string; subtotal: number;
  iva: number; retencion: number; iva_porcentaje: number; retencion_porcentaje: number;
};
function redondearDinero(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
function normalizarConceptos(raw: unknown, legacy: {
  concepto: unknown; cantidad: unknown; costo_unitario: unknown;
  iva_porcentaje: unknown; retencion_porcentaje: unknown;
}): ResumenConceptos | null {
  const elementos: unknown[] = Array.isArray(raw) ? raw : [{
    concepto: legacy.concepto, cantidad: legacy.cantidad, costo_unitario: legacy.costo_unitario,
    iva_porcentaje: legacy.iva_porcentaje, retencion_porcentaje: legacy.retencion_porcentaje,
    retencion_aplica: true,
  }];
  if (elementos.length < 1 || elementos.length > 50) return null;

  const lineas: ConceptoNormalizado[] = [];
  for (const elemento of elementos) {
    if (!elemento || typeof elemento !== "object" || Array.isArray(elemento)) return null;
    const item = elemento as Record<string, unknown>;
    const concepto = textValue(item.concepto, 700);
    const cantidad = numericValue(item.cantidad, 1);
    const costo = numericValue(item.costo_unitario, 0);
    const ivaPct = numericValue(item.iva_porcentaje, 16);
    const retAplica = item.retencion_aplica !== false;
    const retPct = retAplica ? numericValue(item.retencion_porcentaje, 0) : 0;

    let subconceptosRaw: unknown[] = [];
    if (Array.isArray(item.subconceptos)) {
      subconceptosRaw = item.subconceptos;
    } else if (typeof item.subconceptos === "string") {
      subconceptosRaw = item.subconceptos.split(/\r?\n/);
    } else if (item.subconceptos !== undefined && item.subconceptos !== null) {
      return null;
    }
    if (subconceptosRaw.length > 30) return null;
    const subconceptos = subconceptosRaw
      .map((subconcepto) => typeof subconcepto === "string" ? textValue(subconcepto, 300) : "")
      .filter(Boolean);

    if (!concepto || cantidad === null || cantidad <= 0 || costo === null || costo < 0 ||
      ivaPct === null || ivaPct < 0 || ivaPct > 100 ||
      retPct === null || retPct < 0 || retPct > 100) return null;

    const subtotal = redondearDinero(cantidad * costo);
    const iva = redondearDinero(subtotal * ivaPct / 100);
    const retencion = retAplica ? redondearDinero(subtotal * retPct / 100) : 0;

    lineas.push({
      concepto,
      subconceptos,
      cantidad,
      costo_unitario: costo,
      iva_porcentaje: ivaPct,
      retencion_porcentaje: retPct,
      retencion_aplica: retAplica,
      subtotal,
      iva,
      retencion,
      total: redondearDinero(subtotal + iva - retencion),
    });
  }

  const subtotal = redondearDinero(lineas.reduce((s, l) => s + l.subtotal, 0));
  const iva = redondearDinero(lineas.reduce((s, l) => s + l.iva, 0));
  const retencion = redondearDinero(lineas.reduce((s, l) => s + l.retencion, 0));

  return {
    lineas,
    concepto: lineas
      .map((linea) => [linea.concepto, ...linea.subconceptos].join(" — "))
      .join(" — "),
    subtotal,
    iva,
    retencion,
    iva_porcentaje: subtotal > 0 ? Number((iva / subtotal * 100).toFixed(10)) : 0,
    retencion_porcentaje: subtotal > 0 ? Number((retencion / subtotal * 100).toFixed(10)) : 0,
  };
}

export async function GET(request: NextRequest) {
  const denied = await requireNeoPermission(request, "services.view");
  if (denied) return denied;

  try {
    const { data, error } = await supabaseAdmin
      .from("servicios")
      .select("*")
      .order("created_at", { ascending: false })
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
  const denied = await requireNeoPermission(request, "services.create");
  if (denied) return denied;

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
  const facturaSolicitada = textValue(body.factura, 100) || null;
  const motivoCancelacion = textValue(body.motivo_cancelacion, 1000) || null;
  const resumen = normalizarConceptos(body.conceptos_detalle, {
    concepto: body.concepto, cantidad: body.cantidad, costo_unitario: body.costo_unitario,
    iva_porcentaje: body.iva_porcentaje, retencion_porcentaje: body.retencion_porcentaje,
  });
  if (!cliente) return NextResponse.json({ok:false,message:"Selecciona o escribe el cliente."},{status:400});
  if (!resumen) return NextResponse.json({ok:false,message:"Revisa los conceptos: agrega entre 1 y 50 partidas con descripción, cantidad, precio e impuestos válidos."},{status:400});

  const fechaEntrega = optionalDate(body.fecha_entrega);
  const fechaPago = optionalDate(body.fecha_pago);

  if (!cliente) {
    return NextResponse.json(
      { ok: false, message: "Selecciona o escribe el cliente." },
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

  const estatusNormalizado = estatus.toUpperCase();
  const factura = estatusNormalizado === "FACTURADO" ? facturaSolicitada : null;

  if (estatusNormalizado === "FACTURADO" && !factura) {
    return NextResponse.json(
      { ok: false, message: "Captura el número de factura antes de marcar el servicio como Facturado." },
      { status: 400 }
    );
  }
  if (estatusNormalizado === "CANCELADO" && !motivoCancelacion) {
    return NextResponse.json(
      { ok: false, message: "Indica el motivo de cancelación antes de guardar." },
      { status: 400 }
    );
  }
  if (estatusNormalizado === "PAGADO" && !fechaPago) {
    return NextResponse.json(
      { ok: false, message: "Selecciona la fecha de pago antes de marcar el servicio como Pagado." },
      { status: 400 }
    );
  }

  const record = {
    cliente,
    factura,
    cantidad: 1,
    concepto: resumen.concepto,
    costo_unitario: resumen.subtotal,
    iva_porcentaje: resumen.iva_porcentaje,
    retencion_porcentaje: resumen.retencion_porcentaje,
    conceptos_detalle: resumen.lineas,
    observaciones: textValue(body.observaciones) || null,
    estatus: estatus.toUpperCase(),
    paquete: textValue(body.paquete, 200) || null,
    fecha_entrega: fechaEntrega,
    fecha_pago: fechaPago,
    comentarios: textValue(body.comentarios) || null,
    motivo_cancelacion: motivoCancelacion,
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
  const denied = await requireNeoPermission(request, "services.edit");
  if (denied) return denied;

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
  const motivoCancelacion = textValue(body.motivo_cancelacion, 1000) || null;
  const resumen = normalizarConceptos(body.conceptos_detalle, {
    concepto: body.concepto, cantidad: body.cantidad, costo_unitario: body.costo_unitario,
    iva_porcentaje: body.iva_porcentaje, retencion_porcentaje: body.retencion_porcentaje,
  });
  if (!cliente || !resumen) return NextResponse.json({ok:false,message:"El cliente y al menos un concepto válido son obligatorios."},{status:400});

  const fechaEntrega = optionalDate(body.fecha_entrega);
  const fechaPago = optionalDate(body.fecha_pago);

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

  if (estatus === "FACTURADO" && !factura) {
    return NextResponse.json(
      { ok: false, message: "Captura el número de factura antes de marcar el servicio como Facturado." },
      { status: 400 }
    );
  }
  if (estatus === "CANCELADO" && !motivoCancelacion) {
    return NextResponse.json(
      { ok: false, message: "Indica el motivo de cancelación antes de guardar." },
      { status: 400 }
    );
  }
  if (estatus === "PAGADO" && !fechaPago) {
    return NextResponse.json(
      { ok: false, message: "Selecciona la fecha de pago antes de marcar el servicio como Pagado." },
      { status: 400 }
    );
  }

  const record = {
    cliente,
    factura,
    cantidad: 1,
    concepto: resumen.concepto,
    costo_unitario: resumen.subtotal,
    iva_porcentaje: resumen.iva_porcentaje,
    retencion_porcentaje: resumen.retencion_porcentaje,
    conceptos_detalle: resumen.lineas,
    observaciones: textValue(body.observaciones) || null,
    estatus,
    paquete: textValue(body.paquete, 200) || null,
    fecha_entrega: fechaEntrega,
    fecha_pago: fechaPago,
    comentarios: textValue(body.comentarios) || null,
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