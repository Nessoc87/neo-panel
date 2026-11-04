import { NextRequest, NextResponse } from "next/server";
import { createEmployeeSession, EMPLOYEE_SESSION_COOKIE_NAME } from "@/lib/neo-auth";
import { EMPLOYEE_SESSION_SECONDS } from "@/lib/neo-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false, message: "Origen de solicitud no permitido." }, { status: 403 });
  }

  let input: unknown;
  try { input = await request.json(); } catch {
    return NextResponse.json({ ok: false, message: "La solicitud no contiene datos válidos." }, { status: 400 });
  }
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const accessToken = typeof body.access_token === "string" ? body.access_token.trim() : "";
  const tokenHash = typeof body.token_hash === "string" ? body.token_hash.trim() : "";
  const type = typeof body.type === "string" ? body.type : "";
  const password = typeof body.password === "string" ? body.password : "";

  const validTokenType = type === "invite" || type === "recovery";
  if ((!accessToken && !tokenHash) || !validTokenType || password.length < 10 || password.length > 128) {
    return NextResponse.json({ ok: false, message: "El enlace no es válido o la contraseña no cumple los requisitos." }, { status: 400 });
  }

  try {
    let invitedUserId: string;

    if (accessToken) {
      const { data: verified, error: verifyError } = await supabaseAdmin.auth.getUser(accessToken);
      if (verifyError || !verified.user) {
        return NextResponse.json({ ok: false, message: "La invitación venció o ya fue utilizada. Solicita una nueva invitación al administrador." }, { status: 400 });
      }
      invitedUserId = verified.user.id;
    } else {
      const { data: verified, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as "invite" | "recovery",
      });
      if (verifyError || !verified.user) {
        return NextResponse.json({ ok: false, message: "La invitación venció o ya fue utilizada. Solicita una nueva invitación al administrador." }, { status: 400 });
      }
      invitedUserId = verified.user.id;
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("neo_usuarios")
      .select("auth_user_id, active, invitation_pending")
      .eq("auth_user_id", invitedUserId)
      .maybeSingle();

    if (profileError || !profile || !profile.active || !profile.invitation_pending) {
      return NextResponse.json({ ok: false, message: "La cuenta no está autorizada para aceptar esta invitación." }, { status: 403 });
    }

    const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(invitedUserId, { password });
    if (passwordError) throw passwordError;

    const { error: activateError } = await supabaseAdmin
      .from("neo_usuarios")
      .update({ invitation_pending: false, updated_at: new Date().toISOString() })
      .eq("auth_user_id", invitedUserId);
    if (activateError) throw activateError;

    const session = await createEmployeeSession(invitedUserId);
    const response = NextResponse.json({ ok: true, message: "Invitación aceptada. Tu cuenta ya está activa." });
    response.cookies.set(EMPLOYEE_SESSION_COOKIE_NAME, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: EMPLOYEE_SESSION_SECONDS,
    });
    response.cookies.set("neo_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Error aceptando invitación Neo:", error);
    return NextResponse.json({ ok: false, message: "No fue posible completar la invitación. Solicita una nueva al administrador." }, { status: 500 });
  }
}
