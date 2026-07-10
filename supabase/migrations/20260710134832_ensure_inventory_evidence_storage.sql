create schema if not exists app_private;

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

drop policy if exists "inventory_report_evidences_storage_select" on storage.objects;
drop policy if exists "inventory_report_evidences_storage_insert" on storage.objects;
drop policy if exists "inventory_report_evidences_storage_delete" on storage.objects;

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
