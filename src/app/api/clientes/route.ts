import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ClienteInput = {
  id?: unknown;
  nombre?: unknown;
  telefono?: unknown;
  correo?: unknown;
  rfc?: unknown;
  razon_social?: unknown;
  codigo_postal?: unknown;
  direccion?: unknown;
  notas?: unknown;
  activo?: unknown;
};

function value(input: unknown, max = 500): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().slice(0, max);
  return trimmed || null;
}

async function autorizado() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value);
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  if (!(await autorizado())) return jsonError("Inicia sesión para consultar clientes.", 401);

  try {
    const { data, error } = await supabaseAdmin
      .from("neo_clientes")
      .select("id, nombre, telefono, correo, rfc, razon_social, codigo_postal, direccion, notas, activo, created_at, updated_at")
      .order("nombre", { ascending: true });

    if (error) {
      console.error("Error consultando clientes Neo:", error.code);
      return jsonError("No fue posible cargar los clientes. Verifica que hayas aplicado la migración de módulos en Supabase.", 500);
    }

    return NextResponse.json({ ok: true, data: data ?? [] }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("Ocurrió un error al consultar los clientes.", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!(await autorizado())) return jsonError("Inicia sesión para registrar clientes.", 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return jsonError("Origen de solicitud no permitido.", 403);

  let body: ClienteInput;
  try {
    body = (await request.json()) as ClienteInput;
  } catch {
    return jsonError("La solicitud no contiene JSON válido.");
  }

  const nombre = value(body.nombre, 200);
  if (!nombre) return jsonError("El nombre del cliente es obligatorio.");

  const record = {
    nombre,
    telefono: value(body.telefono, 40),
    correo: value(body.correo, 200),
    rfc: value(body.rfc, 20)?.toUpperCase() ?? null,
    razon_social: value(body.razon_social, 200),
    codigo_postal: value(body.codigo_postal, 12),
    direccion: value(body.direccion, 500),
    notas: value(body.notas, 2000),
    activo: body.activo === false ? false : true,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("neo_clientes")
      .insert(record)
      .select("id, nombre, telefono, correo, rfc, razon_social, codigo_postal, direccion, notas, activo, created_at, updated_at")
      .single();

    if (error) {
      if (error.code === "23505") return jsonError("Ya existe un cliente con ese nombre.");
      console.error("Error creando cliente Neo:", error.code);
      return jsonError("No fue posible guardar el cliente.", 500);
    }

    return NextResponse.json({ ok: true, data, message: "Cliente guardado correctamente." }, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("Ocurrió un error al guardar el cliente.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await autorizado())) return jsonError("Inicia sesión para editar clientes.", 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return jsonError("Origen de solicitud no permitido.", 403);

  let body: ClienteInput;
  try {
    body = (await request.json()) as ClienteInput;
  } catch {
    return jsonError("La solicitud no contiene JSON válido.");
  }

  const id = value(body.id, 50);
  const nombre = value(body.nombre, 200);
  if (!id) return jsonError("No se recibió el identificador del cliente.");
  if (!nombre) return jsonError("El nombre del cliente es obligatorio.");

  const record = {
    nombre,
    telefono: value(body.telefono, 40),
    correo: value(body.correo, 200),
    rfc: value(body.rfc, 20)?.toUpperCase() ?? null,
    razon_social: value(body.razon_social, 200),
    codigo_postal: value(body.codigo_postal, 12),
    direccion: value(body.direccion, 500),
    notas: value(body.notas, 2000),
    activo: body.activo !== false,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("neo_clientes")
      .update(record)
      .eq("id", id)
      .select("id, nombre, telefono, correo, rfc, razon_social, codigo_postal, direccion, notas, activo, created_at, updated_at")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") return jsonError("Ya existe otro cliente con ese nombre.");
      console.error("Error actualizando cliente Neo:", error.code);
      return jsonError("No fue posible actualizar el cliente.", 500);
    }
    if (!data) return jsonError("No se encontró el cliente seleccionado.", 404);

    return NextResponse.json({ ok: true, data, message: "Cliente actualizado correctamente." }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("Ocurrió un error al actualizar el cliente.", 500);
  }
}
