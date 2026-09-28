-- Additive R.W. schema for the LIVE app. Apply only after release approval.
-- Creates isolated R.W. tables and functions; does not change Operations or payments.
begin;
create table if not exists public.jj_rw_requests (
 id uuid primary key, title text not null check(length(trim(title)) between 1 and 100),
 description text not null check(length(trim(description)) between 1 and 5000),
 job_id text, job_name text not null, created_by uuid not null references public.profiles(id),
 assigned_to uuid not null references public.profiles(id), due_date date,
 status text not null default 'Requested' check(status in ('Requested','Completed')),
 attachments jsonb not null default '[]', revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.jj_rw_notifications (
 id bigint generated always as identity primary key, request_id uuid not null references public.jj_rw_requests(id) on delete cascade,
 recipient uuid not null references public.profiles(id), actor uuid not null references public.profiles(id),
 event text not null check(event in ('assigned','completed','reopened')), request_revision integer not null,
 created_at timestamptz not null default now(), read_at timestamptz,
 unique(request_id,recipient,event,request_revision)
);
create index if not exists jj_rw_inbox on public.jj_rw_notifications(recipient,created_at desc);
create or replace function public.jj_rw_staff() returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and display_name in ('Jony','Adair','Gio')); $$;
alter table public.jj_rw_requests enable row level security;
alter table public.jj_rw_notifications enable row level security;
revoke all on public.jj_rw_requests,public.jj_rw_notifications from anon,authenticated;
grant select on public.jj_rw_requests,public.jj_rw_notifications to authenticated;
drop policy if exists rw_staff_read on public.jj_rw_requests;
create policy rw_staff_read on public.jj_rw_requests for select to authenticated using(public.jj_rw_staff());
drop policy if exists rw_own_notifications on public.jj_rw_notifications;
create policy rw_own_notifications on public.jj_rw_notifications for select to authenticated using(public.jj_rw_staff() and recipient=auth.uid());
create or replace function public.jj_rw_create(p_id uuid,p_title text,p_description text,p_job_id text,p_job_name text,p_assigned_to uuid,p_due_date date,p_attachments jsonb default '[]')
returns public.jj_rw_requests language plpgsql security definer set search_path=public as $$
declare r public.jj_rw_requests; a jsonb;
begin
 if not public.jj_rw_staff() then raise exception 'Staff sign-in required'; end if;
 if not exists(select 1 from profiles where id=p_assigned_to and display_name in ('Jony','Adair','Gio')) then raise exception 'Choose an internal user'; end if;
 if jsonb_typeof(p_attachments) is distinct from 'array' or jsonb_array_length(p_attachments)>3 or octet_length(p_attachments::text)>3000000 then raise exception 'Up to three attachments, 2 MB total'; end if;
 for a in select * from jsonb_array_elements(p_attachments) loop
  if not coalesce(length(a->>'name') between 1 and 150 and a->>'type' in ('image/jpeg','image/png','image/webp','application/pdf') and (a->>'data') ~ '^data:(image/(jpeg|png|webp)|application/pdf);base64,[A-Za-z0-9+/=]+$',false) then raise exception 'Invalid attachment'; end if;
 end loop;
 if length(trim(coalesce(p_job_name,''))) not between 1 and 200 then raise exception 'Job is required'; end if;
 -- Stable client ID makes retry after a lost response safe.
 select * into r from jj_rw_requests where id=p_id;
 if found then
  if r.created_by<>auth.uid() then raise exception 'Request ID already used'; end if;
  return r;
 end if;
 insert into jj_rw_requests(id,title,description,job_id,job_name,created_by,assigned_to,due_date,attachments)
 values(p_id,trim(p_title),trim(p_description),p_job_id,p_job_name,auth.uid(),p_assigned_to,p_due_date,p_attachments) returning * into r;
 insert into jj_rw_notifications(request_id,recipient,actor,event,request_revision) values(r.id,r.assigned_to,auth.uid(),'assigned',r.revision);
 return r;
end $$;
create or replace function public.jj_rw_status(p_id uuid,p_revision integer,p_status text)
returns public.jj_rw_requests language plpgsql security definer set search_path=public as $$
declare r public.jj_rw_requests;
begin
 if not public.jj_rw_staff() then raise exception 'Staff sign-in required'; end if;
 select * into r from jj_rw_requests where id=p_id for update;
 if not found or auth.uid() not in(r.created_by,r.assigned_to) then raise exception 'Only the requester or assignee can change this request'; end if;
 if r.revision<>p_revision then raise exception 'This request changed. Refresh and try again.'; end if;
 if p_status not in ('Requested','Completed') or p_status is null then raise exception 'Invalid status'; end if;
 if r.status=p_status then return r; end if;
 update jj_rw_requests set status=p_status,revision=revision+1,updated_at=now() where id=p_id returning * into r;
 insert into jj_rw_notifications(request_id,recipient,actor,event,request_revision)
 select r.id,u,auth.uid(),case when p_status='Completed' then 'completed' else 'reopened' end,r.revision
 from (select distinct unnest(array[r.created_by,r.assigned_to]) u) x where u<>auth.uid();
 return r;
end $$;
create or replace function public.jj_rw_read(p_ids bigint[]) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.jj_rw_staff() then raise exception 'Staff sign-in required'; end if;
 update jj_rw_notifications set read_at=coalesce(read_at,now()) where recipient=auth.uid() and id=any(p_ids);
end $$;
revoke all on function public.jj_rw_staff(),public.jj_rw_create(uuid,text,text,text,text,uuid,date,jsonb),public.jj_rw_status(uuid,integer,text),public.jj_rw_read(bigint[]) from public,anon;
grant execute on function public.jj_rw_staff(),public.jj_rw_create(uuid,text,text,text,text,uuid,date,jsonb),public.jj_rw_status(uuid,integer,text),public.jj_rw_read(bigint[]) to authenticated;
commit;
