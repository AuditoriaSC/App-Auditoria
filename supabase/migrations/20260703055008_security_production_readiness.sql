alter table public.profiles
  add column if not exists password_changed_at timestamptz not null default now();

create or replace function public.mark_password_changed()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  update public.profiles
  set password_changed_at = now(), updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all on function public.mark_password_changed() from public, anon;
grant execute on function public.mark_password_changed() to authenticated;
