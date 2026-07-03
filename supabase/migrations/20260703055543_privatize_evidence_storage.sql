create or replace function app_private.can_access_evidence(object_name text)
returns boolean
language sql
security definer
set search_path = public, storage
stable
as $$
  with parts as (
    select storage.foldername(object_name) folders
  ), target as (
    select case when folders[4] ~* '^[0-9a-f-]{36}$' then folders[4] else folders[3] end report_id
    from parts
  )
  select exists (
    select 1
    from target t
    join public.audit_reports r on r.id::text = t.report_id
    cross join app_private.current_profile_context() ctx
    where r.user_id = auth.uid()
       or ctx.role = 'super_admin'
       or ctx.region = 'Global'
       or (ctx.role = 'admin' and ctx.region = r.region)
  )
$$;

revoke all on function app_private.can_access_evidence(text) from public;
grant execute on function app_private.can_access_evidence(text) to authenticated;

drop policy if exists "evidencias_select_authenticated" on storage.objects;
drop policy if exists "evidencias_insert_authenticated" on storage.objects;
drop policy if exists "evidencias_update_authenticated" on storage.objects;

create policy "evidencias_select_authorized"
on storage.objects for select to authenticated
using (bucket_id = 'evidencias' and app_private.can_access_evidence(name));

create policy "evidencias_insert_authorized"
on storage.objects for insert to authenticated
with check (bucket_id = 'evidencias' and app_private.can_access_evidence(name));

create policy "evidencias_update_authorized"
on storage.objects for update to authenticated
using (bucket_id = 'evidencias' and app_private.can_access_evidence(name))
with check (bucket_id = 'evidencias' and app_private.can_access_evidence(name));

update storage.buckets set public = false where id = 'evidencias';
