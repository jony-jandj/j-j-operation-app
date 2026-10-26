begin;
create or replace function public.jj_homeowner_notice() returns trigger language plpgsql security definer set search_path=public as $$
declare portal jsonb; prior jsonb; item jsonb; group_id text; group_name text; target_status text; message text;
begin
 if new.payload->>'kind' not in ('edit','add','select') then return new; end if;
 portal=public.jj_portal_items(new.job_id);
 select i into prior from jsonb_array_elements(portal->'items') i where i->>'id'=new.item_id;
 item=coalesce(prior,'{}')||coalesce(new.payload->'item','{}');
 target_status=case when new.payload->>'kind'='select' then 'Selected' else item->>'status' end;
 if new.payload->>'kind'<>'add' and (coalesce(target_status,'Pending')='Selected') is not distinct from (coalesce(prior->>'status','Pending')='Selected') then return new; end if;
 group_id=coalesce(nullif(item->>'optionGroupId',''),'ungrouped');
 select g->>'name' into group_name from jsonb_array_elements(coalesce(portal->'selectionGroups','[]')) g where g->>'id'=group_id;
 group_name=coalesce(nullif(group_name,''),nullif(item->>'optionGroupTitle',''),'Ungrouped selections');
 message=case when new.payload->>'kind'='add' then case when group_id='ungrouped' then 'H.O. added a selection.' else 'Client added a new selection to “'||group_name||'”.' end when target_status='Selected' then case when group_id='ungrouped' then 'Client selected an item.' else 'Client selected an item in “'||group_name||'”.' end else case when group_id='ungrouped' then 'Client unselected an item.' else 'Client unselected an item in “'||group_name||'”.' end end||' — '||coalesce(portal->>'jobName','Job');
 insert into public.jj_rw_notifications(request_id,recipient,actor,event,request_revision,context)
 select null,p.id,null,'assigned',1,jsonb_build_object('kind','homeowner-selection','action',case when new.payload->>'kind'='add' then 'added' when target_status='Selected' then 'selected' else 'unselected' end,'message',message,'jobId',new.job_id,'groupId',group_id,'groupName',group_name,'sourceEvent',new.id)
 from public.profiles p where p.display_name in ('Jony','Adair','Gio');
 return new;
end $$;
commit;
