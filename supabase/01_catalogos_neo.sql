-- Catálogos iniciales para Neo Panel.
-- Ejecutar en Supabase > SQL Editor antes de desplegar el código actualizado.
-- Se puede volver a ejecutar: actualiza los valores de estos 9 conceptos y los 5 clientes.
-- No elimina ni modifica la tabla existente public.servicios.

create extension if not exists pgcrypto;

create table if not exists public.neo_clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.neo_conceptos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  precio_unitario numeric(14,2),
  precio_manual boolean not null default false,
  iva_porcentaje numeric(5,2) not null default 16 check (iva_porcentaje >= 0 and iva_porcentaje <= 100),
  retencion_porcentaje numeric(5,2) not null default 0 check (retencion_porcentaje >= 0 and retencion_porcentaje <= 100),
  retencion_aplica boolean not null default true,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint neo_conceptos_precio_config check (precio_manual or precio_unitario is not null),
  constraint neo_conceptos_retencion_config check (retencion_aplica or retencion_porcentaje = 0)
);

alter table public.neo_clientes enable row level security;
alter table public.neo_conceptos enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.neo_clientes to service_role;
grant select, insert, update, delete on table public.neo_conceptos to service_role;

insert into public.neo_clientes (nombre, activo)
values
  ('BANORTE', true),
  ('BANORTE SEGUROS', true),
  ('CAPS', true),
  ('ALDO AUTOPARTES', true),
  ('ALFA SINTENTICOS', true)
on conflict (nombre) do update set
  activo = excluded.activo,
  updated_at = now();

insert into public.neo_conceptos
  (nombre, precio_unitario, precio_manual, iva_porcentaje, retencion_porcentaje, retencion_aplica, activo, orden)
values
  ('FLETE LOCAL 1.5', 1500, false, 16, 4, true, true, 10),
  ('FLETE LOCAL 1.5 C/RAMPA', 1500, false, 16, 4, true, true, 20),
  ('FLETE LOCAL 3.5', 3200, false, 16, 4, true, true, 30),
  ('FLETE LOCAL 3.5 C/RAMPA', 3500, false, 16, 4, true, true, 40),
  ('MANIOBRAS', 800, false, 16, 0, false, true, 50),
  ('FLETE FORANEO 1.5', null, true, 16, 4, true, true, 60),
  ('FLETE FORANEO 1.5 C/RAMPA', null, true, 16, 4, true, true, 70),
  ('FLETE FORANEO 3.5', null, true, 16, 4, true, true, 80),
  ('FLETE FORANEO 3.5 C/RAMPA', null, true, 16, 4, true, true, 90)
on conflict (nombre) do update set
  precio_unitario = excluded.precio_unitario,
  precio_manual = excluded.precio_manual,
  iva_porcentaje = excluded.iva_porcentaje,
  retencion_porcentaje = excluded.retencion_porcentaje,
  retencion_aplica = excluded.retencion_aplica,
  activo = excluded.activo,
  orden = excluded.orden,
  updated_at = now();
