
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";

function secureCompare(first: string, second: string): boolean {
  const a = Buffer.from(first, "utf8");
  const b = Buffer.from(second, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "La solicitud no contiene datos válidos." },
      { status: 400 }
    );
  }

  const data =
    body !== null && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};

  const username =
    typeof data.username === "string" ? data.username : "";

  const password =
    typeof data.password === "string" ? data.password : "";

  const configuredUser = process.env.NEO_ADMIN_USER;
  const configuredPassword = process.env.NEO_ADMIN_PASSWORD;
  const configuredSecret = process.env.NEO_SESSION_SECRET;

  if (!configuredUser || !configuredPassword || !configuredSecret) {
    console.error("Falta configurar una o más variables privadas de Neo.");
    return NextResponse.json(
      { error: "El acceso no está configurado correctamente." },
      { status: 500 }
    );
  }

  const validUser = secureCompare(username, configuredUser);
  const validPassword = secureCompare(password, configuredPassword);

  if (!validUser || !validPassword) {
    return NextResponse.json(
      { error: "Usuario o contraseña incorrectos." },
      { status: 401 }
    );
  }

  const token = createSessionToken(configuredUser);

  const response = NextResponse.json({ ok: true });

  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });

  response.headers.set("Cache-Control", "no-store");

  return response;
}
