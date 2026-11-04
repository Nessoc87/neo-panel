import { NextRequest, NextResponse } from "next/server";
import { requireNeoOwner, getNeoPrincipal, registerActivity } from "@/lib/neo-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function apiError(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function getCatalog() {
  const [rolesResult, permissionsResult] = await Promise.all([
    supabaseAdmin.from("neo_roles").select("id, name, description").order("name"),
    supabaseAdmin.from("neo_permissions").select("permission_key, module, action, label, description, sort_order").order("sort_order"),
  ]);
  if (rolesResult.error || permissionsResult.error) throw new Error("No fue posible consultar roles y permisos.");
  return { roles: rolesResult.data ?? [], permissions: permissionsResult.data ?? [] };
}

export async function GET(request: NextRequest) {
  const denied = await requireNeoOwner(request);
  if (denied) return denied;

  try {
    const [usersResult, catalog] = await Promise.all([
      supabaseAdmin
        .from("neo_usuarios")
        .select("auth_user_id, email, full_name, role_id, active, invitation_pending, custom_permissions_enabled, created_at, updated_at, role:neo_roles(id, name, description)")
        .order("created_at", { ascending: false }),
      getCatalog(),
    ]);
    if (usersResult.error) throw usersResult.error;

    const userIds = (usersResult.data ?? []).map((user) => user.auth_user_id);
    const overridesResult = userIds.length
      ? await supabaseAdmin.from("neo_user_permissions").select("user_id, permission_key").in("user_id", userIds)
      : { data: [], error: null };
    if (overridesResult.error) throw overridesResult.error;

    const overridesByUser = new Map<string, string[]>();
    for (const row of overridesResult.data ?? []) {
      const current = overridesByUser.get(row.user_id) ?? [];
      current.push(row.permission_key);
      overridesByUser.set(row.user_id, current);
    }

    const rolePermissionResult = await supabaseAdmin
      .from("neo_role_permissions")
      .select("role_id, permission_key");
    if (rolePermissionResult.error) throw rolePermissionResult.error;
    const rolePermissions = new Map<string, string[]>();
    for (const row of rolePermissionResult.data ?? []) {
      const current = rolePermissions.get(row.role_id) ?? [];
      current.push(row.permission_key);
      rolePermissions.set(row.role_id, current);
    }

    const users = (usersResult.data ?? []).map((user) => ({
      ...user,
      permissions: user.custom_permissions_enabled
        ? overridesByUser.get(user.auth_user_id) ?? []
        : rolePermissions.get(user.role_id) ?? [],
    }));

    return NextResponse.json({ ok: true, users, ...catalog }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Error consultando usuarios Neo:", error);
    return apiError("No fue posible cargar los usuarios y permisos.", 500);
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireNeoOwner(request);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return apiError("Origen de solicitud no permitido.", 403);

  let body: Record<string, unknown>;
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    body = input as Record<string, unknown>;
  } catch {
    return apiError("La solicitud no contiene datos válidos.");
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.full_name === "string" ? body.full_name.trim().slice(0, 120) : "";
  const roleId = typeof body.role_id === "string" ? body.role_id : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !fullName || !roleId) {
    return apiError("Captura nombre, correo válido y perfil.");
  }

  const { data: role, error: roleError } = await supabaseAdmin
    .from("neo_roles").select("id, name").eq("id", roleId).maybeSingle();
  if (roleError || !role) return apiError("El perfil seleccionado no existe.");

  const siteUrl = process.env.NEO_APP_URL || "https://neo-panel-neo-transportaciones.vercel.app";
  try {
    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: siteUrl.replace(/\/$/, "") + "/auth/accept",
    });
    if (inviteError || !invited.user) {
      return apiError(inviteError?.message || "Supabase no pudo enviar la invitación.", 400);
    }

    const { error: insertError } = await supabaseAdmin.from("neo_usuarios").insert({
      auth_user_id: invited.user.id,
      email,
      full_name: fullName,
      role_id: roleId,
      active: true,
      invitation_pending: true,
      invited_by: (await getNeoPrincipal(request))?.email || "owner",
    });

    if (insertError) {
      await supabaseAdmin.auth.admin.deleteUser(invited.user.id);
      if (insertError.code === "23505") return apiError("Ya existe un usuario de Neo con ese correo.");
      throw insertError;
    }

    const principal = await getNeoPrincipal(request);
    if (principal) {
      await registerActivity(principal, "invite", "user", invited.user.id, "Invitó a " + email, { role: role.name });
    }

    return NextResponse.json({
      ok: true,
      message: "Invitación enviada a " + email + ".",
      user: { id: invited.user.id, email, full_name: fullName, role: role.name, invitation_pending: true },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Error invitando usuario Neo:", error);
    return apiError("No fue posible crear el usuario. Verifica que el correo de invitación esté configurado en Supabase.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const denied = await requireNeoOwner(request);
  if (denied) return denied;
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return apiError("Origen de solicitud no permitido.", 403);

  let body: Record<string, unknown>;
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    body = input as Record<string, unknown>;
  } catch {
    return apiError("La solicitud no contiene datos válidos.");
  }

  const userId = typeof body.user_id === "string" ? body.user_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return apiError("El identificador del usuario no es válido.");
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.active === "boolean") update.active = body.active;
  if (typeof body.role_id === "string") {
    const { data: role } = await supabaseAdmin.from("neo_roles").select("id").eq("id", body.role_id).maybeSingle();
    if (!role) return apiError("El perfil seleccionado no existe.");
    update.role_id = body.role_id;
  }
  if (typeof body.custom_permissions_enabled === "boolean") {
    update.custom_permissions_enabled = body.custom_permissions_enabled;
  }
  if (Object.keys(update).length === 1 && body.permissions === undefined) {
    return apiError("No se recibieron cambios para guardar.");
  }

  try {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("neo_usuarios")
      .select("auth_user_id, email, full_name, active")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (existingError || !existing) return apiError("No se encontró el usuario.", 404);

    if (Array.isArray(body.permissions)) {
      const permissions = [...new Set(body.permissions.filter((x): x is string => typeof x === "string"))];
      const { data: allowed, error: allowedError } = await supabaseAdmin
        .from("neo_permissions").select("permission_key").in("permission_key", permissions);
      if (allowedError || (allowed ?? []).length !== permissions.length) {
        return apiError("La lista de permisos contiene opciones no válidas.");
      }
      const { error: deleteError } = await supabaseAdmin.from("neo_user_permissions").delete().eq("user_id", userId);
      if (deleteError) throw deleteError;
      if (permissions.length) {
        const { error: insertError } = await supabaseAdmin.from("neo_user_permissions").insert(
          permissions.map((permission_key) => ({ user_id: userId, permission_key })),
        );
        if (insertError) throw insertError;
      }
    }

    const { data, error: updateError } = await supabaseAdmin
      .from("neo_usuarios").update(update).eq("auth_user_id", userId)
      .select("auth_user_id, email, full_name, role_id, active, invitation_pending, custom_permissions_enabled, updated_at")
      .single();
    if (updateError) throw updateError;

    if (body.active === false) {
      await supabaseAdmin.from("neo_user_sessions").delete().eq("user_id", userId);
    }

    const principal = await getNeoPrincipal(request);
    if (principal) {
      const action = body.active === false ? "deactivate" : body.active === true ? "activate" : "update";
      await registerActivity(principal, action, "user", userId, "Actualizó el acceso de " + existing.email, {
        active: data.active,
        role_id: data.role_id,
        custom_permissions_enabled: data.custom_permissions_enabled,
      });
    }

    return NextResponse.json({ ok: true, user: data, message: "Los permisos del usuario se actualizaron correctamente." }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Error actualizando usuario Neo:", error);
    return apiError("No fue posible actualizar los permisos del usuario.", 500);
  }
}
