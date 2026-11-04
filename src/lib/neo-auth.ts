import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const EMPLOYEE_SESSION_COOKIE_NAME = "neo_employee_session";
export const EMPLOYEE_SESSION_SECONDS = 60 * 60 * 12;

export type NeoPrincipal = {
  id: string | null;
  email: string;
  fullName: string;
  role: string;
  roleId: string | null;
  isOwner: boolean;
  permissions: string[];
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function readPrincipal(ownerToken?: string, employeeToken?: string): Promise<NeoPrincipal | null> {
  if (verifySessionToken(ownerToken)) {
    return {
      id: null,
      email: process.env.NEO_ADMIN_USER || "administrador",
      fullName: "Administrador principal",
      role: "Administrador principal",
      roleId: null,
      isOwner: true,
      permissions: ["*"],
    };
  }

  if (!employeeToken || employeeToken.length < 32) return null;

  try {
    const tokenHash = hashToken(employeeToken);

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("neo_user_sessions")
      .select("user_id")
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (sessionError || !session?.user_id) return null;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("neo_usuarios")
      .select("auth_user_id, email, full_name, role_id, active, invitation_pending, custom_permissions_enabled, role:neo_roles(name)")
      .eq("auth_user_id", session.user_id)
      .maybeSingle();

    if (
      profileError ||
      !profile ||
      profile.active !== true ||
      profile.invitation_pending === true
    ) {
      return null;
    }

    const permissionQuery = profile.custom_permissions_enabled
      ? supabaseAdmin
          .from("neo_user_permissions")
          .select("permission_key")
          .eq("user_id", profile.auth_user_id)
      : supabaseAdmin
          .from("neo_role_permissions")
          .select("permission_key")
          .eq("role_id", profile.role_id);

    const { data: permissionRows, error: permissionsError } = await permissionQuery;
    if (permissionsError) return null;

    const roleValue = profile.role as { name?: string } | { name?: string }[] | null;
    const role = Array.isArray(roleValue) ? roleValue[0]?.name : roleValue?.name;

    return {
      id: profile.auth_user_id,
      email: profile.email,
      fullName: profile.full_name,
      role: typeof role === "string" ? role : "Empleado",
      roleId: profile.role_id,
      isOwner: false,
      permissions: (permissionRows ?? []).map((row) => row.permission_key),
    };
  } catch (error) {
    console.error("No se pudo consultar la sesión de Neo:", error);
    return null;
  }
}

export async function getNeoPrincipal(request?: NextRequest): Promise<NeoPrincipal | null> {
  if (request) {
    return readPrincipal(
      request.cookies.get(SESSION_COOKIE_NAME)?.value,
      request.cookies.get(EMPLOYEE_SESSION_COOKIE_NAME)?.value,
    );
  }

  const store = await cookies();
  return readPrincipal(
    store.get(SESSION_COOKIE_NAME)?.value,
    store.get(EMPLOYEE_SESSION_COOKIE_NAME)?.value,
  );
}

export async function requireNeoPermission(
  request: NextRequest,
  permission: string,
): Promise<NextResponse | null> {
  const principal = await getNeoPrincipal(request);
  if (!principal) {
    return NextResponse.json(
      { ok: false, message: "Tu sesión no está activa. Inicia sesión nuevamente." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (principal.isOwner || principal.permissions.includes("*") || principal.permissions.includes(permission)) {
    return null;
  }
  return NextResponse.json(
    { ok: false, message: "No tienes permiso para realizar esta acción." },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}

export async function requireNeoOwner(request: NextRequest): Promise<NextResponse | null> {
  const principal = await getNeoPrincipal(request);
  if (!principal) {
    return NextResponse.json(
      { ok: false, message: "Tu sesión no está activa. Inicia sesión nuevamente." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!principal.isOwner) {
    return NextResponse.json(
      { ok: false, message: "Solo el administrador principal puede administrar usuarios." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return null;
}

export async function createEmployeeSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + EMPLOYEE_SESSION_SECONDS * 1000).toISOString();
  const { error } = await supabaseAdmin.from("neo_user_sessions").insert({
    token_hash: hashToken(token),
    user_id: userId,
    expires_at: expiresAt,
  });
  if (error) throw new Error("No fue posible crear la sesión del empleado.");
  return { token, expiresAt };
}

export async function revokeEmployeeSession(token?: string): Promise<void> {
  if (!token || token.length < 32) return;
  const { error } = await supabaseAdmin
    .from("neo_user_sessions")
    .delete()
    .eq("token_hash", hashToken(token));
  if (error) console.error("No se pudo revocar la sesión de Neo:", error.code);
}

export async function registerActivity(
  principal: NeoPrincipal,
  action: string,
  entityType: string,
  entityId: string | null,
  description: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabaseAdmin.from("neo_activity_log").insert({
      actor_user_id: principal.id,
      actor_email: principal.email,
      actor_name: principal.fullName,
      action,
      entity_type: entityType,
      entity_id: entityId,
      description,
      metadata,
    });
  } catch (error) {
    console.error("No se pudo guardar el historial de actividad:", error);
  }
}

export function getNeoHomePath(principal: NeoPrincipal): string {
  if (principal.isOwner || principal.permissions.includes("dashboard.view")) return "/";
  if (principal.permissions.includes("quotes.view")) return "/cotizaciones";
  if (principal.permissions.includes("shipments.view")) return "/envios-activos";
  if (principal.permissions.includes("conversations.view")) return "/conversaciones";
  if (principal.permissions.includes("services.view")) return "/servicios";
  if (principal.permissions.includes("clients.view")) return "/clientes";
  return "/login";
}
