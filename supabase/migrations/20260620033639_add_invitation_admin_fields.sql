alter table public.user_invitations
  add column if not exists region text,
  add column if not exists status text not null default 'pendiente',
  add column if not exists expires_at timestamptz,
  add column if not exists invited_by uuid references auth.users(id),
  add column if not exists accepted_at timestamptz,
  add column if not exists canceled_at timestamptz;

update public.user_invitations
set status = case
  when is_used = true then 'aceptada'
  when status is null then 'pendiente'
  else status
end;

create index if not exists idx_user_invitations_region
  on public.user_invitations(region);

create index if not exists idx_user_invitations_status
  on public.user_invitations(status);
