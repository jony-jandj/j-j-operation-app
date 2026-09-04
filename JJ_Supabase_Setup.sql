-- J&J Home Renovations Operations App
-- Run this in Supabase -> SQL Editor after creating the project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (display_name in ('Jony','Adair','Gio')),
  app_role text not null check (app_role in ('pre_approver','final_approver')),
  created_at timestamptz not null default now()
);

create table if not exists public.app_state (
  org_id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.profiles enable row level security;
alter table public.app_state enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.app_state from anon, authenticated;

grant select on public.profiles to authenticated;
grant select, insert, update on public.app_state to authenticated;

create policy "authenticated users can read profiles"
on public.profiles
for select
to authenticated
using (true);

create policy "authenticated users can read J&J app state"
on public.app_state
for select
to authenticated
using (org_id = 'jj-home-renovations');

create policy "authenticated users can create J&J app state"
on public.app_state
for insert
to authenticated
with check (
  org_id = 'jj-home-renovations'
  and updated_by = (select auth.uid())
);

create policy "authenticated users can update J&J app state"
on public.app_state
for update
to authenticated
using (org_id = 'jj-home-renovations')
with check (
  org_id = 'jj-home-renovations'
  and updated_by = (select auth.uid())
);

-- Enforce P.O. approval transitions at the database level.
-- pre_approver: Draft -> Pre-Approved
-- final_approver: Pre-Approved -> Approved
-- Either role may reset a P.O. back to Draft.
create or replace function public.enforce_po_approval_transitions()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor_role text;
  old_po record;
  new_status text;
begin
  select app_role
  into actor_role
  from public.profiles
  where id = (select auth.uid());

  if actor_role is null then
    raise exception 'No J&J role is assigned to this account.';
  end if;

  for old_po in
    select
      po->>'id' as po_id,
      po->>'status' as old_status
    from jsonb_array_elements(coalesce(old.state->'projects','[]'::jsonb)) project,
         jsonb_array_elements(coalesce(project->'pos','[]'::jsonb)) po
  loop
    select po->>'status'
    into new_status
    from jsonb_array_elements(coalesce(new.state->'projects','[]'::jsonb)) project,
         jsonb_array_elements(coalesce(project->'pos','[]'::jsonb)) po
    where po->>'id' = old_po.po_id
    limit 1;

    if new_status is distinct from old_po.old_status and new_status is not null then
      if new_status = 'Draft' then
        continue;
      elsif old_po.old_status = 'Draft'
            and new_status = 'Pre-Approved'
            and actor_role = 'pre_approver' then
        continue;
      elsif old_po.old_status = 'Pre-Approved'
            and new_status = 'Approved'
            and actor_role = 'final_approver' then
        continue;
      else
        raise exception
          'Your J&J role cannot change P.O. % from % to %.',
          old_po.po_id, old_po.old_status, new_status;
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_enforce_po_approval_transitions on public.app_state;
create trigger trg_enforce_po_approval_transitions
before update of state on public.app_state
for each row
execute function public.enforce_po_approval_transitions();

-- Realtime
alter publication supabase_realtime add table public.app_state;

-- After creating the 3 users in Supabase Authentication,
-- replace the UUID values below with each user's real auth.users ID:
--
-- insert into public.profiles (id, display_name, app_role) values
-- ('JONY-USER-UUID',  'Jony',  'pre_approver'),
-- ('ADAIR-USER-UUID', 'Adair', 'pre_approver'),
-- ('GIO-USER-UUID',   'Gio',   'final_approver');
