-- Add planning to existing requests; no request, note, or payment records are replaced.
begin;
alter table public.jj_rw_requests add column if not exists planned_date date;
alter table public.jj_rw_requests add column if not exists waiting_reason text not null default '';
-- Keep legacy Requested/Completed status compatible with existing notification triggers.
create or replace function public.jj_wb_move(p_id uuid,p_revision integer,p_planned_date date,p_stage text,p_reason text)
returns public.jj_rw_requests language plpgsql security definer set search_path=public as $$
declare r public.jj_rw_requests; next_status text; reason text;
begin
 if not public.jj_rw_staff() then raise exception 'Staff sign-in required'; end if;
 select * into r from public.jj_rw_requests where id=p_id for update;
 if not found or not (auth.uid()=r.created_by or auth.uid()=any(coalesce(r.assigned_users,array[r.assigned_to]))) then raise exception 'Only the requester or assignee can update this request'; end if;
 if r.revision is distinct from p_revision then raise exception 'This request changed. Refresh before trying again.'; end if;
 if p_stage is null or p_stage not in ('todo','waiting','done') then raise exception 'Choose a valid status'; end if;
 reason:=case when p_stage='waiting' then trim(coalesce(p_reason,'')) else '' end;
 if length(reason)>1000 or (p_stage='waiting' and reason='') then raise exception 'Enter a waiting reason, up to 1,000 characters'; end if;
 next_status:=case when p_stage='done' then 'Completed' else 'Requested' end;
 if r.status<>next_status then r:=public.jj_rw_status(r.id,r.revision,next_status); end if;
 update public.jj_rw_requests set planned_date=p_planned_date,waiting_reason=reason,revision=revision+1,updated_at=now() where id=p_id returning * into r;
 return r;
end $$;
revoke all on function public.jj_wb_move(uuid,integer,date,text,text) from public,anon;
grant execute on function public.jj_wb_move(uuid,integer,date,text,text) to authenticated;
create or replace function public.jj_wb_create(p_id uuid,p_title text,p_description text,p_job_id text,p_job_name text,p_assigned_users uuid[],p_due_date date,p_attachments jsonb,p_planned_date date)
returns public.jj_rw_requests language plpgsql security definer set search_path=public as $$
declare r public.jj_rw_requests;
begin
 if not public.jj_rw_staff() then raise exception 'Staff sign-in required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from public.jj_rw_requests where id=p_id;
 if found then
  if r.created_by is distinct from auth.uid() then raise exception 'Request ID already used'; end if;
  return r;
 end if;
 r:=public.jj_rw_create_multi(p_id,p_title,p_description,p_job_id,p_job_name,p_assigned_users,p_due_date,p_attachments);
 update public.jj_rw_requests set planned_date=p_planned_date where id=p_id returning * into r;
 return r;
end $$;
revoke all on function public.jj_wb_create(uuid,text,text,text,text,uuid[],date,jsonb,date) from public,anon;
grant execute on function public.jj_wb_create(uuid,text,text,text,text,uuid[],date,jsonb,date) to authenticated;
create or replace function public.jj_wb_edit(p_id uuid,p_revision integer,p_title text,p_description text,p_job_id text,p_job_name text,p_assigned_users uuid[],p_due_date date,p_planned_date date)
returns public.jj_rw_requests language plpgsql security definer set search_path=public as $$
declare r public.jj_rw_requests;
begin
 r:=public.jj_rw_edit(p_id,p_revision,p_title,p_description,p_job_id,p_job_name,p_assigned_users,p_due_date);
 update public.jj_rw_requests set planned_date=p_planned_date where id=p_id returning * into r;
 return r;
end $$;
revoke all on function public.jj_wb_edit(uuid,integer,text,text,text,text,uuid[],date,date) from public,anon;
grant execute on function public.jj_wb_edit(uuid,integer,text,text,text,text,uuid[],date,date) to authenticated;
commit;
