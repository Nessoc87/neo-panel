-- Neo Panel: campos ampliados de clientes y módulos de cotizaciones/envíos.
-- Ejecutar en Supabase > SQL Editor una sola vez.
-- No elimina ni reemplaza datos existentes.

begin;

alter table public.neo_clientes
  add column if not exists telefono text,
  add column if not exists correo text,
  add column if not exists rfc text,
  add column if not exists razon_social text,
  add column if not exists codigo_postal text,
  add column if not exists direccion text,
  add column if not exists notas text;

create table if not exists public.neo_cotizaciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.neo_clientes(id) on delete set null,
  cliente text not null,
  telefono text,
  servicio text not null default 'Flete',
  origen text,
  destino text,
  mercancia text,
  peso text,
  tipo_unidad text,
  tipo_flete text,
  fecha_servicio date,
  monto_estimado numeric(14,2) check (monto_estimado is null or monto_estimado >= 0),
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE','EN_REVISION','COTIZADA','ACEPTADA','RECHAZADA','CANCELADA')),
  notas text,
  origen_registro text not null default 'PANEL',
  servicio_id uuid references public.servicios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists neo_cotizaciones_estado_created_idx
  on public.neo_cotizaciones (estado, created_at desc);
create index if not exists neo_cotizaciones_cliente_idx
  on public.neo_cotizaciones (cliente_id);

create table if not exists public.neo_envios (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null unique references public.servicios(id) on delete cascade,
  estatus_operativo text not null default 'PROGRAMADO'
    check (estatus_operativo in ('PROGRAMADO','ASIGNADO','EN_RUTA','ENTREGADO','INCIDENCIA','CANCELADO')),
  origen text,
  destino text,
  tipo_unidad text,
  operador text,
  telefono_operador text,
  placas text,
  fecha_programada date,
  fecha_entrega_real date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists neo_envios_estado_created_idx
  on public.neo_envios (estatus_operativo, created_at desc);

alter table public.neo_cotizaciones enable row level security;
alter table public.neo_envios enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.neo_cotizaciones to service_role;
grant select, insert, update, delete on public.neo_envios to service_role;

commit;
