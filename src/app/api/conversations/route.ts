import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/auth";

export async function GET() {
  // 1. Comprobar que el usuario haya iniciado sesión.
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!verifySessionToken(token)) {
    return NextResponse.json(
      { error: "Debes iniciar sesión para consultar las conversaciones." },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  // 2. Leer las variables privadas del servidor.
  const url = process.env.NEO_BANDEJA_URL;
  const key = process.env.NEO_BANDEJA_KEY;

  if (!url || !key || key === "PEGA_AQUI_TU_CLAVE_PRIVADA") {
    return NextResponse.json(
      { error: "Falta configurar la conexión privada con n8n." },
      { status: 500 }
    );
  }

  // 3. Consultar el webhook de n8n sin exponer la clave al navegador.
  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        "x-neo-bandeja-key": key,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!upstream.ok) {
      console.error(
        "El webhook de conversaciones respondió con estado:",
        upstream.status
      );

      return NextResponse.json(
        {
          error: "n8n no aceptó la solicitud de conversaciones.",
          upstreamStatus: upstream.status,
        },
        {
          status: 502,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const data: unknown = await upstream.json();

    return NextResponse.json(
      { ok: true, data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(
      "No fue posible consultar el webhook de conversaciones:",
      error instanceof Error ? error.message : "Error desconocido"
    );

    return NextResponse.json(
      {
        error:
          "No se pudo conectar con n8n. Comprueba la dirección y la disponibilidad del servicio.",
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}