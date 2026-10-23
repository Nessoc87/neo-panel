"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type Cliente = {
  id: string; nombre: string; telefono: string | null; correo: string | null;
  rfc: string | null; razon_social: string | null; codigo_postal: string | null;
  direccion: string | null; notas: string | null; activo: boolean;
};
type ClienteForm = {
  nombre: string; telefono: string; correo: string; rfc: string;
  razon_social: string; codigo_postal: string; direccion: string; notas: string; activo: boolean;
};
const vacio: ClienteForm = { nombre:"", telefono:"", correo:"", rfc:"", razon_social:"", codigo_postal:"", direccion:"", notas:"", activo:true };
const campo = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100";
const etiqueta = "block text-sm font-semibold text-slate-700";

export default function ClientesClient() {
  const [clientes,setClientes] = useState<Cliente[]>([]);
  const [form,setForm] = useState<ClienteForm>(vacio);
  const [editando,setEditando] = useState<string | null>(null);
  const [abierto,setAbierto] = useState(false);
  const [busqueda,setBusqueda] = useState("");
  const [filtro,setFiltro] = useState("ACTIVOS");
  const [cargando,setCargando] = useState(true);
  const [guardando,setGuardando] = useState(false);
  const [error,setError] = useState("");
  const [mensaje,setMensaje] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    try {
      const res = await fetch("/api/clientes",{cache:"no-store"});
      const json = await res.json();
      if(res.status === 401){window.location.assign("/login");return;}
      if(!res.ok || json.ok !== true || !Array.isArray(json.data)) throw new Error(json.message || "No se pudieron cargar los clientes.");
      setClientes(json.data);
    } catch(e) { setError(e instanceof Error ? e.message : "Error al cargar clientes."); }
    finally { setCargando(false); }
  },[]);
  useEffect(()=>{void Promise.resolve().then(cargar);},[cargar]);

  const filtrados = useMemo(()=>{
    const q=busqueda.trim().toLocaleLowerCase("es-MX");
    return clientes.filter(c=>{
      const estado=filtro==="TODOS" || (filtro==="ACTIVOS" ? c.activo : !c.activo);
      const texto=[c.nombre,c.telefono,c.correo,c.rfc,c.razon_social,c.direccion].filter(Boolean).join(" ").toLocaleLowerCase("es-MX");
      return estado && texto.includes(q);
    });
  },[clientes,busqueda,filtro]);

  function nuevo(){setEditando(null);setForm(vacio);setError("");setMensaje("");setAbierto(true);}
  function editar(c:Cliente){
    setEditando(c.id);setForm({nombre:c.nombre||"",telefono:c.telefono||"",correo:c.correo||"",rfc:c.rfc||"",razon_social:c.razon_social||"",codigo_postal:c.codigo_postal||"",direccion:c.direccion||"",notas:c.notas||"",activo:c.activo});
    setError("");setMensaje("");setAbierto(true);window.scrollTo({top:0,behavior:"smooth"});
  }
  async function guardar(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); if(!form.nombre.trim()){setError("El nombre del cliente es obligatorio.");return;}
    setGuardando(true);setError("");setMensaje("");
    try{
      const res=await fetch("/api/clientes",{method:editando?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,id:editando})});
      const json=await res.json();if(res.status===401){window.location.assign("/login");return;}
      if(!res.ok||json.ok!==true)throw new Error(json.message||"No se pudo guardar el cliente.");
      setMensaje(json.message||"Cliente guardado.");setAbierto(false);setEditando(null);setForm(vacio);await cargar();
    }catch(err){setError(err instanceof Error?err.message:"Ocurrió un error al guardar.");}
    finally{setGuardando(false);}
  }
  async function cambiarEstado(c:Cliente){
    const activo=!c.activo;
    if(!window.confirm(activo?"¿Reactivar este cliente?":"¿Desactivar este cliente? Se conservará su historial."))return;
    setError("");setMensaje("");
    try{
      const res=await fetch("/api/clientes",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...c,activo})});
      const json=await res.json();if(res.status===401){window.location.assign("/login");return;}
      if(!res.ok||json.ok!==true)throw new Error(json.message||"No se pudo actualizar.");
      setMensaje(activo?"Cliente reactivado.":"Cliente desactivado.");await cargar();
    }catch(err){setError(err instanceof Error?err.message:"Error al cambiar el estado.");}
  }
  function campoForm(key:keyof ClienteForm, label:string, opts:{type?:string;wide?:boolean;placeholder?:string}={}){
    const wide=opts.wide?"sm:col-span-2 lg:col-span-3":"";
    if(key==="activo")return null;
    const value=form[key] as string;
    const onChange=(v:string)=>setForm(prev=>({...prev,[key]:v}));
    return <label key={key} className={etiqueta+" "+wide}>{label}<input type={opts.type||"text"} value={value} onChange={e=>onChange(e.target.value)} className={campo} placeholder={opts.placeholder||""} maxLength={key==="notas"?2000:key==="direccion"?500:200}/></label>;
  }

  return <main className="neo-app min-h-screen bg-slate-100 text-slate-800">
    <header className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 px-5 py-5 text-white sm:px-8">
      <div><p className="text-xl font-bold">NEO</p><p className="text-xs tracking-wider text-slate-300">TRANSPORTACIONES</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/" className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Volver al panel</Link><a href="/servicios" className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-200">Servicios</a></div>
    </header>
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      <section className="rounded-3xl bg-gradient-to-r from-slate-900 to-cyan-800 p-6 text-white sm:p-9"><p className="text-xs font-bold tracking-[0.2em] text-cyan-300">DIRECTORIO</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">Clientes</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">Administra datos de contacto y facturación de tus clientes.</p></section>
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Registrados</p><p className="mt-2 text-3xl font-bold">{clientes.length}</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Activos</p><p className="mt-2 text-3xl font-bold">{clientes.filter(c=>c.activo).length}</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Inactivos</p><p className="mt-2 text-3xl font-bold">{clientes.filter(c=>!c.activo).length}</p></article>
      </section>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Directorio de clientes</h2><button onClick={nuevo} className="rounded-xl bg-cyan-700 px-5 py-3 text-sm font-bold text-white hover:bg-cyan-800">+ Agregar cliente</button></div>
      {mensaje&&<div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{mensaje}</div>}
      {error&&<div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {abierto&&<form onSubmit={guardar} className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">{editando?"Editar cliente":"Nuevo cliente"}</h3><button type="button" onClick={()=>{setAbierto(false);setEditando(null);setError("");}} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">Cancelar</button></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campoForm("nombre","Nombre comercial *",{placeholder:"Ej. BANORTE"})}
          {campoForm("razon_social","Razón social")}
          {campoForm("rfc","RFC")}
          {campoForm("telefono","Teléfono",{type:"tel"})}
          {campoForm("correo","Correo electrónico",{type:"email"})}
          {campoForm("codigo_postal","Código postal")}
          {campoForm("direccion","Dirección de facturación",{wide:true})}
          {campoForm("notas","Notas",{wide:true})}
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.activo} onChange={e=>setForm(prev=>({...prev,activo:e.target.checked}))} className="h-4 w-4 accent-cyan-700"/>Cliente activo</label>
        </div>
        <button disabled={guardando} className="mt-6 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-cyan-800 disabled:opacity-50">{guardando?"Guardando...":editando?"Guardar cambios":"Guardar cliente"}</button>
      </form>}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto]"><input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por nombre, RFC, teléfono o correo..." className={campo}/><select value={filtro} onChange={e=>setFiltro(e.target.value)} className={campo}><option value="ACTIVOS">Solo activos</option><option value="INACTIVOS">Solo inactivos</option><option value="TODOS">Todos</option></select><button onClick={()=>void cargar()} disabled={cargando} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">{cargando?"Actualizando...":"Actualizar"}</button></div>
        {cargando?<p className="p-8 text-center text-sm text-slate-500">Cargando clientes...</p>:filtrados.length===0?<div className="p-10 text-center"><p className="font-semibold">No hay clientes para mostrar.</p><p className="mt-2 text-sm text-slate-500">Prueba otra búsqueda o agrega un cliente.</p></div>:<div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Contacto</th><th className="px-4 py-3">Datos fiscales</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">
          {filtrados.map(c=><tr key={c.id} className="align-top hover:bg-slate-50/70"><td className="px-4 py-4"><p className="font-bold">{c.nombre}</p>{c.razon_social&&<p className="mt-1 text-xs text-slate-500">{c.razon_social}</p>}{c.direccion&&<p className="mt-2 max-w-xs whitespace-pre-wrap text-xs text-slate-500">{c.direccion}</p>}</td><td className="px-4 py-4"><p>{c.telefono||"Sin teléfono"}</p><p className="mt-1 text-xs text-slate-500">{c.correo||"Sin correo"}</p></td><td className="px-4 py-4"><p>{c.rfc||"Sin RFC"}</p>{c.codigo_postal&&<p className="mt-1 text-xs text-slate-500">C.P. {c.codigo_postal}</p>}</td><td className="px-4 py-4"><span className={"rounded-full px-3 py-1 text-xs font-bold "+(c.activo?"bg-emerald-100 text-emerald-800":"bg-slate-100 text-slate-600")}>{c.activo?"Activo":"Inactivo"}</span></td><td className="px-4 py-4"><div className="flex flex-wrap gap-2"><button onClick={()=>editar(c)} className="rounded-lg border border-cyan-200 px-3 py-2 text-xs font-bold text-cyan-800 hover:bg-cyan-50">Editar</button><button onClick={()=>void cambiarEstado(c)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">{c.activo?"Desactivar":"Reactivar"}</button></div></td></tr>)}
        </tbody></table></div>}
        <p className="mt-3 text-xs text-slate-500">Desactivar un cliente no elimina su historial ni sus servicios anteriores.</p>
      </section>
      <footer className="py-8 text-center text-xs text-slate-400">Neo Transportaciones · Directorio de clientes</footer>
    </div>
  </main>;
}
