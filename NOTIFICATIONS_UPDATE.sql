begin;
alter table public.jj_rw_notifications alter column request_id drop not null;
alter table public.jj_rw_notifications alter column actor drop not null;
alter table public.jj_rw_notifications add column if not exists context jsonb not null default '{}';
create or replace function public.jj_notice_describe() returns trigger language plpgsql security definer set search_path=public as $$
declare r public.jj_rw_requests; who text;
begin
 if new.request_id is not null then
 select * into r from public.jj_rw_requests where id=new.request_id;
 select display_name into who from public.profiles where id=new.actor;
 new.context=coalesce(new.context,'{}')||jsonb_build_object('message',coalesce(who,'Someone')||case when new.context->>'kind'='rw-updated' then ' updated ' when new.event='assigned' then ' assigned you ' when new.event='completed' then ' completed ' else ' reopened ' end||'“'||r.title||'” — '||r.job_name,'jobName',r.job_name,'title',r.title);
 end if;return new;
end $$;
drop trigger if exists jj_notice_describe on public.jj_rw_notifications;
create trigger jj_notice_describe before insert on public.jj_rw_notifications for each row execute function public.jj_notice_describe();
create or replace function public.jj_homeowner_notice() returns trigger language plpgsql security definer set search_path=public as $$
declare portal jsonb; prior jsonb; item jsonb; group_id text; group_name text; target_status text; message text;
begin
 if new.payload->>'kind' not in ('edit','add','select') then return new; end if;
 portal=public.jj_portal_items(new.job_id);
 select i into prior from jsonb_array_elements(portal->'items') i where i->>'id'=new.item_id;
 item=coalesce(prior,'{}')||coalesce(new.payload->'item','{}');
 target_status=case when new.payload->>'kind'='select' then 'Selected' else item->>'status' end;
 if (target_status='Selected') is not distinct from (coalesce(prior->>'status','Pending')='Selected') then return new; end if;
 group_id=coalesce(nullif(item->>'optionGroupId',''),'ungrouped');
 select g->>'name' into group_name from jsonb_array_elements(coalesce(portal->'selectionGroups','[]')) g where g->>'id'=group_id;
 group_name=coalesce(nullif(group_name,''),nullif(item->>'optionGroupTitle',''),'Ungrouped selections');
 message=coalesce(portal->>'jobName','Homeowner')||case when target_status='Selected' then ' made a selection in “' else ' removed a selection from “' end||group_name||'”.';
 insert into public.jj_rw_notifications(request_id,recipient,actor,event,request_revision,context)
 select null,p.id,null,'assigned',1,jsonb_build_object('kind','homeowner-selection','message',message,'jobId',new.job_id,'groupId',group_id,'groupName',group_name,'sourceEvent',new.id)
 from public.profiles p where p.display_name in ('Jony','Adair','Gio');
 return new;
end $$;
drop trigger if exists jj_homeowner_notice on public.jj_homeowner_events;
create trigger jj_homeowner_notice before insert on public.jj_homeowner_events for each row execute function public.jj_homeowner_notice();
create or replace function public.jj_rw_edit_notice() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.created_by=auth.uid() and (new.title,new.description,new.job_id,new.job_name,new.due_date,new.assigned_users) is distinct from (old.title,old.description,old.job_id,old.job_name,old.due_date,old.assigned_users) then
 insert into public.jj_rw_notifications(request_id,recipient,actor,event,request_revision,context)
 select new.id,u,auth.uid(),'assigned',new.revision,jsonb_build_object('kind','rw-updated') from unnest(coalesce(new.assigned_users,array[new.assigned_to])) u
 where u<>auth.uid() and u=any(coalesce(old.assigned_users,array[old.assigned_to])) on conflict do nothing;
 end if;return new;
end $$;
drop trigger if exists jj_rw_edit_notice on public.jj_rw_requests;
create trigger jj_rw_edit_notice after update on public.jj_rw_requests for each row execute function public.jj_rw_edit_notice();
create or replace function public.jj_rw_push_claim() returns jsonb language plpgsql security definer set search_path=public as $$ declare result jsonb; begin
update jj_rw_push_jobs j set status='cancelled' where status in ('pending','processing') and (created_at<now()-interval '1 day' or not exists(select 1 from jj_rw_push_devices d where d.endpoint=j.endpoint and d.user_id=j.recipient and d.enabled));
with chosen as (select id from jj_rw_push_jobs where status in ('pending','processing') and next_attempt<=now() and attempts<5 order by id for update skip locked limit 15), claimed as (update jj_rw_push_jobs j set status='processing',attempts=attempts+1,next_attempt=now()+interval '5 minutes',lease=gen_random_uuid() from chosen where j.id=chosen.id returning j.*)
select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('subscription',d.subscription,'notice_context',n.context)),'[]') into result from claimed c join jj_rw_push_devices d on d.endpoint=c.endpoint and d.user_id=c.recipient and d.enabled left join jj_rw_notifications n on n.id=c.notification_id;return result;end $$;
revoke all on function public.jj_notice_describe(),public.jj_homeowner_notice(),public.jj_rw_edit_notice() from public,anon,authenticated;
commit;
