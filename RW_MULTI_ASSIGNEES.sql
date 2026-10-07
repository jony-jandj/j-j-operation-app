begin;
alter table public.jj_rw_requests add column if not exists assigned_users uuid[];
create or replace function public.jj_rw_create_multi(p_id uuid,p_title text,p_description text,p_job_id text,p_job_name text,p_assigned_users uuid[],p_due_date date,p_attachments jsonb default '[]')
returns public.jj_rw_requests language plpgsql security definer set search_path=public as $$
declare r public.jj_rw_requests; users uuid[];
begin
 if not public.jj_rw_staff() then raise exception 'Staff sign-in required'; end if;
 if p_assigned_users is null or cardinality(p_assigned_users) not between 1 and 3 or array_position(p_assigned_users,null) is not null then raise exception 'Choose one to three internal users'; end if;
 select array_agg(distinct u order by u) into users from unnest(p_assigned_users) u;
 if exists(select 1 from unnest(users) u where not exists(select 1 from public.profiles p where p.id=u and p.display_name in ('Jony','Adair','Gio'))) then raise exception 'Choose internal users only'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from public.jj_rw_requests where id=p_id;
 if found then
  if r.created_by<>auth.uid() then raise exception 'Request ID already used'; end if;
  return r;
 end if;
 r:=public.jj_rw_create(p_id,p_title,p_description,p_job_id,p_job_name,users[1],p_due_date,p_attachments);
 update public.jj_rw_requests set assigned_users=users where id=p_id returning * into r;
 insert into public.jj_rw_notifications(request_id,recipient,actor,event,request_revision)
 select r.id,u,auth.uid(),'assigned',r.revision from unnest(users) u
 on conflict(request_id,recipient,event,request_revision) do nothing;
 return r;
end $$;
revoke all on function public.jj_rw_create_multi(uuid,text,text,text,text,uuid[],date,jsonb) from public,anon;
grant execute on function public.jj_rw_create_multi(uuid,text,text,text,text,uuid[],date,jsonb) to authenticated;
create or replace function public.jj_rw_status(p_id uuid,p_revision integer,p_status text)
returns public.jj_rw_requests language plpgsql security definer set search_path=public as $$
declare r public.jj_rw_requests;
begin
 if not public.jj_rw_staff() then raise exception 'Staff sign-in required'; end if;
 select * into r from jj_rw_requests where id=p_id for update;
 if not found or (auth.uid()<>r.created_by and not auth.uid()=any(coalesce(r.assigned_users,array[r.assigned_to]))) then raise exception 'Only the requester or assignee can change this request'; end if;
 if r.revision is distinct from p_revision then raise exception 'This request changed. Refresh and try again.'; end if;
 if p_status not in ('Requested','Completed') or p_status is null then raise exception 'Invalid status'; end if;
 if r.status=p_status then return r; end if;
 update jj_rw_requests set status=p_status,revision=revision+1,updated_at=now() where id=p_id returning * into r;
 insert into jj_rw_notifications(request_id,recipient,actor,event,request_revision)
 select r.id,u,auth.uid(),case when p_status='Completed' then 'completed' else 'reopened' end,r.revision
 from (select distinct unnest(array[r.created_by]||coalesce(r.assigned_users,array[r.assigned_to])) u) x where u<>auth.uid();
 return r;
end $$;
create or replace function public.jj_rw_save_notes(p_id uuid,p_revision integer,p_notes text) returns public.jj_rw_requests language plpgsql security definer set search_path=public as $$
declare r public.jj_rw_requests;
begin
 if not public.jj_rw_staff() then raise exception 'Staff sign-in required'; end if;
 select * into r from public.jj_rw_requests where id=p_id for update;
 if not found or not auth.uid()=any(coalesce(r.assigned_users,array[r.assigned_to])) then raise exception 'Only the assigned person can edit notes'; end if;
 if r.revision is distinct from p_revision then raise exception 'This request changed. Reopen Details before saving notes.'; end if;
 if p_notes is null or length(p_notes)>5000 then raise exception 'Notes must be 5,000 characters or fewer'; end if;
 update public.jj_rw_requests set assignee_notes=p_notes,revision=revision+1,updated_at=now() where id=p_id returning * into r;
 return r;
end $$;
revoke all on function public.jj_rw_save_notes(uuid,integer,text) from public,anon;
grant execute on function public.jj_rw_save_notes(uuid,integer,text) to authenticated;
create or replace function public.jj_rw_delete(p_id uuid,p_revision integer)
returns void language plpgsql security definer set search_path=public as $$
declare r public.jj_rw_requests;
begin
 if not public.jj_rw_staff() then raise exception 'Staff sign-in required'; end if;
 select * into r from public.jj_rw_requests where id=p_id for update;
 if not found then return; end if;
 if (auth.uid()<>r.created_by and not auth.uid()=any(coalesce(r.assigned_users,array[r.assigned_to]))) then raise exception 'Only the requester or assignee can delete this request'; end if;
 if r.revision is distinct from p_revision then raise exception 'This request changed. Close Details, refresh, and try again.'; end if;
 delete from public.jj_rw_requests where id=p_id;
 -- Existing foreign keys remove related notices and queued push jobs.
end $$;
revoke all on function public.jj_rw_delete(uuid,integer) from public,anon;
grant execute on function public.jj_rw_delete(uuid,integer) to authenticated;
commit;
