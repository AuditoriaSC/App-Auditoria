-- Inventarios v1.1: esquema aislado de la auditoria 1.0.
-- Las tablas se exponen solo a authenticated y permanecen protegidas por RLS.

create table public.inventory_module_access (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_reports (
  id uuid primary key default gen_random_uuid(),
  local_codigo text not null references public.locales(codigo_interno) on delete restrict,
  local_name_snapshot text not null,
  region text not null,
  responsible_id uuid not null references public.responsibles(id) on delete restrict,
  responsible_code_snapshot text not null,
  responsible_name_snapshot text not null,
  inventory_date date not null,
  front_regularization_date date not null,
  allow_regularization_date_edit boolean not null default false,
  assigned_auditor_id uuid not null references public.profiles(id) on delete restrict,
  assigned_auditor_name_snapshot text not null,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'archivo_cargado', 'cruces_pendientes', 'cruces_validados', 'diferencias_revisadas', 'listo_para_informe')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (front_regularization_date >= inventory_date)
);

create table public.inventory_files (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.inventory_reports(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  extension text not null check (extension in ('pdf', 'xls', 'xlsx')),
  mime_type text,
  size_bytes bigint not null check (size_bytes > 0),
  upload_status text not null default 'uploaded'
    check (upload_status in ('uploading', 'uploaded', 'failed')),
  uploaded_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.inventory_cross_catalog (
  id uuid primary key default gen_random_uuid(),
  inventory_code text not null,
  raw_material_code text not null,
  raw_material_name text not null,
  conversion_factor numeric not null default 1 check (conversion_factor > 0),
  source_unit text,
  destination_unit text,
  cross_group text,
  type text not null check (type in ('inventario', 'costo', 'gasto')),
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_code, raw_material_code, cross_group)
);

create table public.inventory_report_crosses (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.inventory_reports(id) on delete cascade,
  catalog_cross_id uuid references public.inventory_cross_catalog(id) on delete set null,
  inventory_code text not null,
  item_name text not null,
  raw_material_code text,
  raw_material_name text not null,
  conversion_factor numeric not null default 1 check (conversion_factor > 0),
  source_unit text,
  destination_unit text,
  quantity numeric not null default 0,
  difference numeric not null default 0,
  valuation numeric,
  type text not null check (type in ('inventario', 'costo', 'gasto')),
  cross_group text,
  validation_status text not null default 'propuesto'
    check (validation_status in ('propuesto', 'validado', 'aceptado')),
  modified_by uuid references public.profiles(id) on delete set null,
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_report_differences (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.inventory_reports(id) on delete cascade,
  report_cross_id uuid references public.inventory_report_crosses(id) on delete cascade,
  inventory_code text not null,
  item_name text not null,
  cross_group text,
  difference numeric not null check (difference <> 0),
  impact numeric,
  kind text not null check (kind in ('faltante', 'sobrante')),
  created_at timestamptz not null default now(),
  check (
    (kind = 'faltante' and difference < 0)
    or (kind = 'sobrante' and difference > 0)
  )
);

create index inventory_reports_status_idx on public.inventory_reports(status);
create index inventory_reports_region_idx on public.inventory_reports(region);
create index inventory_reports_auditor_idx on public.inventory_reports(assigned_auditor_id);
create index inventory_files_report_idx on public.inventory_files(report_id);
create index inventory_cross_catalog_inventory_code_idx on public.inventory_cross_catalog(inventory_code);
create index inventory_report_crosses_report_idx on public.inventory_report_crosses(report_id);
create index inventory_report_differences_report_kind_idx on public.inventory_report_differences(report_id, kind);

create or replace function app_private.has_inventory_access()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null and (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'super_admin'
    )
    or exists (
      select 1
      from public.inventory_module_access a
      where a.user_id = auth.uid()
        and a.is_active
    )
  )
$$;

revoke all on function app_private.has_inventory_access() from public;
grant execute on function app_private.has_inventory_access() to authenticated;

grant select, insert, update, delete on table
  public.inventory_module_access,
  public.inventory_reports,
  public.inventory_files,
  public.inventory_cross_catalog,
  public.inventory_report_crosses,
  public.inventory_report_differences
to authenticated;

alter table public.inventory_module_access enable row level security;
alter table public.inventory_reports enable row level security;
alter table public.inventory_files enable row level security;
alter table public.inventory_cross_catalog enable row level security;
alter table public.inventory_report_crosses enable row level security;
alter table public.inventory_report_differences enable row level security;

create policy "inventory_access_select_self_or_super_admin"
  on public.inventory_module_access for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from app_private.current_profile_context() ctx
      where ctx.role = 'super_admin'
    )
  );

create policy "inventory_access_manage_super_admin"
  on public.inventory_module_access for all to authenticated
  using (exists (
    select 1 from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
  ))
  with check (exists (
    select 1 from app_private.current_profile_context() ctx
    where ctx.role = 'super_admin'
  ));

create policy "inventory_reports_access"
  on public.inventory_reports for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

create policy "inventory_files_access"
  on public.inventory_files for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

create policy "inventory_cross_catalog_access"
  on public.inventory_cross_catalog for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

create policy "inventory_report_crosses_access"
  on public.inventory_report_crosses for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

create policy "inventory_report_differences_access"
  on public.inventory_report_differences for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventory-files',
  'inventory-files',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "inventory_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'inventory-files'
    and (select app_private.has_inventory_access())
  );

create policy "inventory_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inventory-files'
    and (select app_private.has_inventory_access())
    and exists (
      select 1
      from public.inventory_reports r
      where r.id::text = (storage.foldername(name))[1]
    )
  );

create policy "inventory_storage_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'inventory-files'
    and (select app_private.has_inventory_access())
  )
  with check (
    bucket_id = 'inventory-files'
    and (select app_private.has_inventory_access())
  );

create policy "inventory_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'inventory-files'
    and (select app_private.has_inventory_access())
  );
