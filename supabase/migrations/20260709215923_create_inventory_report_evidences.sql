-- Inventarios v1.1: evidencias documentales y fotograficas.
-- Bucket y metadata aislados de evidencias de visitas/auditorias 1.0.

create table if not exists public.inventory_report_evidences (
  id uuid primary key default gen_random_uuid(),
  inventory_report_id uuid not null references public.inventory_reports(id) on delete cascade,
  category text not null,
  file_name text not null,
  file_path text not null unique,
  mime_type text null,
  size_bytes bigint null,
  uploaded_by uuid null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  check (btrim(category) <> ''),
  check (btrim(file_name) <> ''),
  check (btrim(file_path) <> '')
);

create index if not exists inventory_report_evidences_report_idx
  on public.inventory_report_evidences (inventory_report_id);

alter table public.inventory_report_evidences enable row level security;

create policy "inventory_report_evidences_access"
  on public.inventory_report_evidences for all to authenticated
  using ((select app_private.has_inventory_access()))
  with check ((select app_private.has_inventory_access()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventory-report-evidences',
  'inventory-report-evidences',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf',
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "inventory_report_evidences_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'inventory-report-evidences'
    and (select app_private.has_inventory_access())
  );

create policy "inventory_report_evidences_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inventory-report-evidences'
    and (select app_private.has_inventory_access())
    and (storage.foldername(name))[1] = 'inventory-reports'
    and exists (
      select 1
      from public.inventory_reports r
      where r.id::text = (storage.foldername(name))[2]
    )
  );

create policy "inventory_report_evidences_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'inventory-report-evidences'
    and (select app_private.has_inventory_access())
  );
