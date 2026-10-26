-- Add sender-only editing to existing R.W. requests. No records are replaced.
begin;
create or replace function public.jj_rw_edit(p_id uuid,p_revision integer,p_title text,p_description text,p_job_id text,p_job_name text,p_assigned_users uuid[],p_due_date date)
returns public.jj_rw_requests language plpgsql security definer set search_path=public as $$
declare r public.jj_rw_requests; users uuid[]; previous_users uuid[];
begin
 if not public.jj_rw_staff() then raise exception 'Staff sign-in required'; end if;
 select * into r from public.jj_rw_requests where id=p_id for update;
 if not found or r.created_by is distinct from auth.uid() then raise exception 'Only the person who sent this request can edit it'; end if;
 if r.revision is distinct from p_revision then raise exception 'This request changed. Close, refresh, and reopen Details before editing again.'; end if;
 if p_title is null or length(trim(p_title)) not between 1 and 100 then raise exception 'Enter a title, up to 100 characters'; end if;
 if p_description is null or length(trim(p_description)) not between 1 and 5000 then raise exception 'Enter details, up to 5,000 characters'; end if;
 if p_job_name is null or length(trim(p_job_name)) not between 1 and 200 then raise exception 'Choose a job or General J&J Work'; end if;
 if p_assigned_users is null or cardinality(p_assigned_users) not between 1 and 3 or array_position(p_assigned_users,null) is not null then raise exception 'Choose one to three internal users'; end if;
 select array_agg(distinct u order by u) into users from unnest(p_assigned_users) u;
 if exists(select 1 from unnest(users) u where not exists(select 1 from public.profiles p where p.id=u and p.display_name in ('Jony','Adair','Gio'))) then raise exception 'Choose internal users only'; end if;
 previous_users:=coalesce(r.assigned_users,array[r.assigned_to]);
 update public.jj_rw_requests set title=trim(p_title),description=trim(p_description),job_id=p_job_id,job_name=trim(p_job_name),assigned_to=users[1],assigned_users=users,due_date=p_due_date,revision=revision+1,updated_at=now() where id=p_id returning * into r;
 -- Notify newly assigned users through the existing assignment/push workflow.
 insert into public.jj_rw_notifications(request_id,recipient,actor,event,request_revision)
 select r.id,u,auth.uid(),'assigned',r.revision from unnest(users) u where not u=any(previous_users)
 on conflict(request_id,recipient,event,request_revision) do nothing;
 return r;
end $$;
revoke all on function public.jj_rw_edit(uuid,integer,text,text,text,text,uuid[],date) from public,anon;
grant execute on function public.jj_rw_edit(uuid,integer,text,text,text,text,uuid[],date) to authenticated;
commit;
