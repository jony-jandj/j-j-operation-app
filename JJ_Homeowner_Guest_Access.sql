-- J&J Homeowner Selections guest portal
-- Run once in Supabase -> SQL Editor.
-- The opaque UUID in each QR/link is required for every read or write.

create extension if not exists pgcrypto;

create table if not exists public.homeowner_portals (
  token uuid primary key,
  project_id text not null,
  project_name text not null default 'Homeowner selections',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.homeowner_portals enable row level security;

revoke all on table public.homeowner_portals from anon, authenticated;
grant select, insert, update on table public.homeowner_portals to anon, authenticated;

create or replace function public.homeowner_request_token()
returns uuid
language sql
stable
set search_path = public
as $$
  select nullif(
    coalesce(current_setting('request.headers', true), '{}')::jsonb ->> 'x-homeowner-token',
    ''
  )::uuid;
$$;

drop policy if exists "homeowner token can read portal" on public.homeowner_portals;
create policy "homeowner token can read portal"
on public.homeowner_portals
for select
to anon, authenticated
using (token = public.homeowner_request_token());

drop policy if exists "homeowner token can create portal" on public.homeowner_portals;
create policy "homeowner token can create portal"
on public.homeowner_portals
for insert
to anon, authenticated
with check (token = public.homeowner_request_token());

drop policy if exists "homeowner token can update portal" on public.homeowner_portals;
create policy "homeowner token can update portal"
on public.homeowner_portals
for update
to anon, authenticated
using (token = public.homeowner_request_token())
with check (token = public.homeowner_request_token());

create index if not exists homeowner_portals_project_id_idx
on public.homeowner_portals(project_id);
