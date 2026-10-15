import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";

type ApiResult = {
  ok?: boolean;
  message?: string;
  error?: string;
};

export async function POST(request: NextRequest) {
  // 1. Verificar la sesión privada de Neo Panel.
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!verifySessionToken(token)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Tu sesión ha expirado. Inicia sesión nuevamente.",
      },
      { status: 401 }
    );
  }

  // 2. Comprobar que la petición venga del mismo sitio.
  const origin = request.headers.get("origin");

  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { ok: false, message: "Origen de solicitud no permitido." },
      { status: 403 }
    );
  }

  // 3. Leer y validar los datos.
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

  const nombre =
    typeof data.nombre === "string"
      ? data.nombre.trim().slice(0, 200)
      : "";

  const mensaje =
    typeof data.mensaje === "string"
      ? data.mensaje.trim()
      : "";

  if (telefono.startsWith("521")) {
    telefono = telefono.replace(/^521/, "52");
  }

  if (telefono.length < 10 || telefono.length > 15) {
    return NextResponse.json(
      { ok: false, message: "El teléfono del cliente no es válido." },
      { status: 400 }
    );
  }

  if (!mensaje) {
    return NextResponse.json(
      { ok: false, message: "Escribe una respuesta antes de enviarla." },
      { status: 400 }
    );
  }

  if (mensaje.length > 4000) {
    return NextResponse.json(
      {
        ok: false,
        message: "El mensaje supera el máximo de 4000 caracteres.",
      },
      { status: 400 }
    );
  }

  // 4. Leer la configuración privada de n8n.
  const url = process.env.NEO_RESPUESTA_MANUAL_URL;
  const key = process.env.NEO_BANDEJA_KEY;

  if (!url || !key) {
    console.error("Falta configurar la conexión de respuestas manuales.");

    return NextResponse.json(
      {
        ok: false,
        message: "La conexión con n8n no está configurada.",
      },
      { status: 500 }
    );
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "https:") {
      return NextResponse.json(
        {
          ok: false,
          message: "La dirección de n8n debe utilizar HTTPS.",
        },
        { status: 500 }
      );
    }

    // 5. Enviar los datos al Webhook existente.
    const upstream = await fetch(parsedUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-neo-bandeja-key": key,
        Accept: "application/json",
      },
      body: JSON.stringify({
        telefono,
        nombre,
        mensaje,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    const responseText = await upstream.text();

    let result: ApiResult = {};

    try {
      const parsed: unknown = JSON.parse(responseText);

      if (parsed && typeof parsed === "object") {
        result = parsed as ApiResult;
      }
    } catch {
      // Se rechazará una respuesta que no confirme el resultado.
    }

    if (!upstream.ok || result.ok !== true) {
      console.error(
        "El webhook de respuestas manuales no confirmó el envío.",
        "Estado HTTP:",
        upstream.status
      );

      return NextResponse.json(
        {
          ok: false,
          message:
            result.message ||
            result.error ||
            "n8n no confirmó la recepción de la respuesta.",
        },
        {
          status: 502,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message:
          result.message ||
          "n8n aceptó la respuesta para procesarla.",
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error(
      "Error conectando con el webhook de respuestas manuales:",
      error instanceof Error ? error.message : "Error desconocido"
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "No fue posible conectar con n8n. Comprueba el Webhook y su disponibilidad.",
      },
      { status: 502 }
    );
  }
}