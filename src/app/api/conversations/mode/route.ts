import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  // 1. Verificar que el usuario haya iniciado sesión.
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!verifySessionToken(token)) {
    return NextResponse.json(
      { ok: false, message: "Tu sesión ha expirado. Inicia sesión nuevamente." },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  // 2. Leer y validar los datos recibidos.
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "La solicitud no contiene JSON válido." },
      { status: 400 }
    );
  }

  const data =
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};

  let telefono =
    typeof data.telefono === "string"
      ? data.telefono.replace(/\D/g, "")
      : "";

  const modo =
    typeof data.modo === "string"
      ? data.modo.trim().toUpperCase()
      : "";

  if (telefono.startsWith("521")) {
    telefono = telefono.replace(/^521/, "52");
  }

  if (
    telefono.length < 10 ||
    telefono.length > 15 ||
    !["BOT", "HUMANO"].includes(modo)
  ) {
    return NextResponse.json(
      {
        ok: false,
        message: "Indica un teléfono válido y el modo BOT o HUMANO.",
      },
      { status: 400 }
    );
  }

  // 3. Obtener la dirección y la clave privadas de n8n.
  const url = process.env.NEO_CAMBIAR_MODO_URL;
  const key = process.env.NEO_BANDEJA_KEY;

  if (
    !url ||
    !key ||
    url.includes("PEGA_AQUI") ||
    key.includes("PEGA_AQUI")
  ) {
    console.error("Falta configurar la conexión privada con n8n.");

    return NextResponse.json(
      { ok: false, message: "La conexión con n8n no está configurada." },
      { status: 500 }
    );
  }

  // 4. Enviar la solicitud al webhook de n8n.
  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-neo-bandeja-key": key,
        Accept: "application/json",
      },
      body: JSON.stringify({
        telefono,
        modo,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    const responseText = await upstream.text();

    let result: Record<string, unknown> = {};

    try {
      const parsed: unknown = JSON.parse(responseText);

      if (parsed && typeof parsed === "object") {
        result = parsed as Record<string, unknown>;
      }
    } catch {
      // Se mantiene el mensaje genérico si la respuesta no es JSON.
    }

    if (!upstream.ok || result.ok === false) {
      console.error(
        "n8n rechazó el cambio de modo. Estado:",
        upstream.status
      );

      return NextResponse.json(
        {
          ok: false,
          message:
            typeof result.message === "string"
              ? result.message
              : "n8n no pudo actualizar el modo de atención.",
        },
        {
          status: upstream.status >= 400 && upstream.status < 500
            ? 400
            : 502,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message:
          typeof result.message === "string"
            ? result.message
            : "Solicitud enviada correctamente a n8n.",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error(
      "Error de conexión con n8n:",
      error instanceof Error ? error.message : "Error desconocido"
    );

    return NextResponse.json(
      {
        ok: false,
        message: "No fue posible conectar con n8n. Inténtalo nuevamente.",
      },
      { status: 502 }
    );
  }
}