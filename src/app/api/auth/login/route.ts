import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";
import {
  createEmployeeSession,
  EMPLOYEE_SESSION_COOKIE_NAME,
  EMPLOYEE_SESSION_SECONDS,
  revokeEmployeeSession,
} from "@/lib/neo-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function secureCompare(first: string, second: string): boolean {
  const a = Buffer.from(first, "utf8");
  const b = Buffer.from(second, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function clearOwnerCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origen de solicitud no permitido." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "La solicitud no contiene datos válidos." }, { status: 400 });
  }

  const data = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const username = typeof data.username === "string" ? data.username.trim() : "";
  const password = typeof data.password === "string" ? data.password : "";

  const configuredUser = process.env.NEO_ADMIN_USER;
  const configuredPassword = process.env.NEO_ADMIN_PASSWORD;
  const configuredSecret = process.env.NEO_SESSION_SECRET;

  // Conservar intacto el acceso actual del administrador principal.
  if (
    configuredUser && configuredPassword && configuredSecret &&
    secureCompare(username, configuredUser) &&
    secureCompare(password, configuredPassword)
  ) {
    await revokeEmployeeSession(request.cookies.get(EMPLOYEE_SESSION_COOKIE_NAME)?.value);
    const token = createSessionToken(configuredUser);
    const response = NextResponse.json({ ok: true, user: { name: "Administrador principal", role: "Administrador principal" } });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });
    response.cookies.set(EMPLOYEE_SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  // Los empleados entran con su correo individual y contraseña de Supabase Auth.
  const supabaseUrl = process.env.SUPABASE_URL;
  const authKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !authKey || !username || !password) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }

  try {
    const authClient = createClient(supabaseUrl, authKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: username.toLowerCase(),
      password,
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("neo_usuarios")
      .select("auth_user_id, email, full_name, active, invitation_pending")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile || !profile.active) {
      return NextResponse.json({ error: "Esta cuenta no tiene acceso activo al panel de Neo." }, { status: 403 });
    }
    if (profile.invitation_pending) {
      return NextResponse.json({ error: "Primero debes aceptar la invitación que enviamos a tu correo." }, { status: 403 });
    }

    await revokeEmployeeSession(request.cookies.get(EMPLOYEE_SESSION_COOKIE_NAME)?.value);
    const session = await createEmployeeSession(profile.auth_user_id);
    const response = NextResponse.json({
      ok: true,
      user: { name: profile.full_name, email: profile.email },
    });
    response.cookies.set(EMPLOYEE_SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: EMPLOYEE_SESSION_SECONDS,
    });
    clearOwnerCookie(response);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Error iniciando sesión de empleado:", error);
    return NextResponse.json({ error: "No fue posible iniciar sesión. Verifica la configuración de acceso." }, { status: 500 });
  }
}
