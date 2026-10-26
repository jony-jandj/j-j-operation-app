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

-- Reuse the existing portal read; never repeat it during notification creation.
begin;
do $patch$
declare definition text;
begin
 select pg_get_functiondef('public.jj_portal_write(text,text,jsonb)'::regprocedure) into definition;
 if position('notice_portal jsonb' in definition)=0 then
  if position('current_items=public.jj_portal_items(job)->''items'';' in definition)=0 then raise exception 'Unexpected portal save version'; end if;
  definition=replace(definition,'current_items jsonb;','current_items jsonb; notice_portal jsonb; notice_prior jsonb;');
  definition=replace(definition,'current_items=public.jj_portal_items(job)->''items'';','notice_portal=public.jj_portal_items(job); current_items=notice_portal->''items'';');
  definition=replace(definition,'insert into public.jj_homeowner_events(job_id,item_id,payload)', $replacement$
  select jsonb_build_object('status',i->>'status','optionGroupId',i->>'optionGroupId','optionGroupTitle',i->>'optionGroupTitle') into notice_prior from jsonb_array_elements(current_items) i where i->>'id'=new_id;
  perform set_config('jj.homeowner_notice_context',jsonb_build_object('jobId',job,'itemId',new_id,'jobName',notice_portal->>'jobName','selectionGroups',coalesce(notice_portal->'selectionGroups','[]'::jsonb),'prior',coalesce(notice_prior,'{}'::jsonb))::text,true);
  insert into public.jj_homeowner_events(job_id,item_id,payload)$replacement$);
  execute definition;
 end if;
end $patch$;
create or replace function public.jj_homeowner_notice() returns trigger language plpgsql security definer set search_path=public as $$
declare portal jsonb; prior jsonb; item jsonb; group_id text; group_name text; target_status text; message text;
begin
 if new.payload->>'kind' not in ('edit','add','select') then return new; end if;
 portal=nullif(current_setting('jj.homeowner_notice_context',true),'')::jsonb;
 if portal is null or portal->>'jobId' is distinct from new.job_id or portal->>'itemId' is distinct from new.item_id then return new; end if;
 prior=coalesce(portal->'prior','{}'::jsonb);
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
exception when others then
 raise warning 'Homeowner notification could not be queued: %',SQLSTATE;
 return new;
end $$;
commit;
