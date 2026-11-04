"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

type Role = { id: string; name: string; description: string };
type Permission = { permission_key: string; module: string; action: string; label: string; description: string; sort_order: number };
type NeoUser = {
  auth_user_id: string;
  email: string;
  full_name: string;
  role_id: string;
  active: boolean;
  invitation_pending: boolean;
  custom_permissions_enabled: boolean;
  created_at: string;
  updated_at: string;
  role: Role | null;
  permissions: string[];
};
type Payload = { users: NeoUser[]; roles: Role[]; permissions: Permission[] };

const moduleLabels: Record<string, string> = {
  dashboard: "Panel principal",
  quotes: "Cotizaciones",
  shipments: "Envíos activos",
  conversations: "Conversaciones",
  clients: "Clientes",
  services: "Servicios",
  catalogs: "Catálogos",
  users: "Usuarios",
  activity: "Historial",
};

export default function UsuariosClient() {
  const [data, setData] = useState<Payload>({ users: [], roles: [], permissions: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [editing, setEditing] = useState<Record<string, { role_id: string; active: boolean; custom: boolean; permissions: string[] }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const result = await response.json();
      if (response.status === 401) { window.location.assign("/login"); return; }
      if (!response.ok || !result.ok) throw new Error(result.message || "No fue posible cargar el personal.");
      const payload = result as Payload;
      setData(payload);
      setRoleId((current) => current || payload.roles[0]?.id || "");
      setEditing(Object.fromEntries(payload.users.map((user) => [user.auth_user_id, {
        role_id: user.role_id,
        active: user.active,
        custom: user.custom_permissions_enabled,
        permissions: [...user.permissions],
      }])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar usuarios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const permission of data.permissions) {
      const rows = map.get(permission.module) ?? [];
      rows.push(permission);
      map.set(permission.module, rows);
    }
    return [...map.entries()];
  }, [data.permissions]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name, email, role_id: roleId }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "No se pudo enviar la invitación.");
      setMessage(result.message);
      setName("");
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el usuario.");
    } finally {
      setSaving(false);
    }
  }

  function changeUser(id: string, patch: Partial<{ role_id: string; active: boolean; custom: boolean; permissions: string[] }>) {
    setEditing((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function togglePermission(id: string, key: string) {
    const current = editing[id]?.permissions ?? [];
    const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
    changeUser(id, { permissions: next });
  }

  async function saveUser(user: NeoUser) {
    const form = editing[user.auth_user_id];
    if (!form) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.auth_user_id,
          role_id: form.role_id,
          active: form.active,
          custom_permissions_enabled: form.custom,
          permissions: form.permissions,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "No se pudieron guardar los permisos.");
      setMessage("Cambios guardados para " + user.full_name + ".");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar cambios.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-widest text-cyan-800">ADMINISTRACIÓN DE ACCESOS</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">Usuarios y permisos</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Invita a tu equipo y define qué puede consultar o modificar cada persona. Cada empleado utiliza su propio correo y contraseña.</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-right">
            <p className="text-xs font-medium text-slate-500">Personal registrado</p>
            <p className="text-2xl font-bold text-slate-900">{data.users.length}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.2fr)]">
        <form onSubmit={invite} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Invitar empleado</h3>
          <p className="mt-1 text-sm text-slate-500">Supabase enviará un correo para activar la cuenta y crear una contraseña personal.</p>
          <label className="mt-5 block text-sm font-semibold text-slate-700">Nombre completo
            <input value={name} onChange={(e)=>setName(e.target.value)} required maxLength={120} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-cyan-700"/>
          </label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Correo electrónico
            <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required maxLength={200} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-cyan-700"/>
          </label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">Perfil inicial
            <select value={roleId} onChange={(e)=>setRoleId(e.target.value)} required className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal">
              {data.roles.map((role)=><option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
          </label>
          <button type="submit" disabled={saving || loading || !roleId} className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-cyan-800 disabled:opacity-50">
            {saving ? "Enviando..." : "Enviar invitación"}
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-slate-900">Personal y accesos</h3>
            <button type="button" onClick={()=>void load()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Actualizar</button>
          </div>
          {loading ? <p className="py-10 text-center text-sm text-slate-500">Cargando usuarios...</p> :
           data.users.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">Todavía no has invitado empleados.</p> :
           <div className="mt-4 space-y-4">
             {data.users.map((user)=> {
               const form = editing[user.auth_user_id] ?? { role_id:user.role_id, active:user.active, custom:user.custom_permissions_enabled, permissions:user.permissions };
               return <article key={user.auth_user_id} className="rounded-xl border border-slate-200 p-4">
                 <div className="flex flex-wrap items-start justify-between gap-3">
                   <div>
                     <h4 className="font-bold text-slate-900">{user.full_name}</h4>
                     <p className="text-xs text-slate-500">{user.email}</p>
                     <p className="mt-1 text-xs text-slate-500">Alta: {new Date(user.created_at).toLocaleDateString("es-MX")}</p>
                   </div>
                   <span className={"rounded-full px-2.5 py-1 text-xs font-bold " + (!user.active ? "bg-rose-100 text-rose-700" : user.invitation_pending ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700")}>
                     {!user.active ? "Desactivado" : user.invitation_pending ? "Invitación pendiente" : "Activo"}
                   </span>
                 </div>
                 <div className="mt-4 grid gap-3 sm:grid-cols-2">
                   <label className="text-xs font-bold text-slate-600">Perfil
                     <select value={form.role_id} onChange={(e)=>changeUser(user.auth_user_id,{role_id:e.target.value})} className="mt-1.5 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm font-normal">
                       {data.roles.map((role)=><option key={role.id} value={role.id}>{role.name}</option>)}
                     </select>
                   </label>
                   <label className="flex items-center gap-2 self-end rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                     <input type="checkbox" checked={form.active} onChange={(e)=>changeUser(user.auth_user_id,{active:e.target.checked})}/>
                     Cuenta activa
                   </label>
                 </div>
                 <label className="mt-4 flex items-start gap-2 text-sm font-semibold text-slate-700">
                   <input type="checkbox" checked={form.custom} onChange={(e)=>changeUser(user.auth_user_id,{custom:e.target.checked})} className="mt-1"/>
                   Permisos personalizados (reemplazan los del perfil)
                 </label>
                 {form.custom && <div className="mt-3 grid gap-3 sm:grid-cols-2">
                   {groups.map(([module, permissions])=><div key={module} className="rounded-lg bg-slate-50 p-3">
                     <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{moduleLabels[module] ?? module}</p>
                     <div className="space-y-2">
                       {permissions.map((permission)=><label key={permission.permission_key} className="flex items-start gap-2 text-xs text-slate-700">
                         <input type="checkbox" checked={form.permissions.includes(permission.permission_key)} onChange={()=>togglePermission(user.auth_user_id,permission.permission_key)} className="mt-0.5"/>
                         <span>{permission.label}</span>
                       </label>)}
                     </div>
                   </div>)}
                 </div>}
                 <div className="mt-4 flex justify-end">
                   <button type="button" disabled={saving} onClick={()=>void saveUser(user)} className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-800 disabled:opacity-50">Guardar cambios</button>
                 </div>
               </article>;
             })}
           </div>}
        </div>
      </section>

      {(error || message) && <div role={error ? "alert" : "status"} className={"rounded-xl p-4 text-sm " + (error ? "border border-rose-200 bg-rose-50 text-rose-700" : "border border-emerald-200 bg-emerald-50 text-emerald-800")}>{error || message}</div>}
    </main>
  );
}
