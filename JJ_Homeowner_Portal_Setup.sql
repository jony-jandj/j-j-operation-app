-- Run once in Supabase SQL Editor. No customer accounts are created.
begin;
create table if not exists public.jj_homeowner_links (
 job_id text primary key, token_hash text not null unique,
 created_at timestamptz not null default now()
);
alter table public.jj_homeowner_links add column if not exists token_value text;
create table if not exists public.jj_homeowner_events (
 id bigint generated always as identity primary key,
 job_id text not null references public.jj_homeowner_links(job_id) on delete cascade,
 item_id text not null, payload jsonb not null, applied boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.jj_homeowner_links enable row level security;
alter table public.jj_homeowner_events enable row level security;
revoke all on public.jj_homeowner_links, public.jj_homeowner_events from anon, authenticated;

create or replace function public.jj_is_staff() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and app_role in ('admin','pre_approver','final_approver'));
$$;
-- Restrictive policies also constrain any older permissive policies.
drop policy if exists jj_staff_only_state on public.app_state;
create policy jj_staff_only_state on public.app_state as restrictive for all to authenticated using(public.jj_is_staff()) with check(public.jj_is_staff());
revoke all on public.app_state from anon;

create or replace function public.jj_portal_link(p_job text,p_token text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.jj_is_staff() then raise exception 'Staff access required'; end if;
 if length(p_token)<>64 or p_token!~'^[a-f0-9]+$' then raise exception 'Invalid link'; end if;
 if not exists(select 1 from public.app_state a, jsonb_array_elements(a.state->'projects') p where a.org_id='jj-home-renovations' and p->>'id'=p_job) then raise exception 'Job not found'; end if;
 insert into public.jj_homeowner_links(job_id,token_hash,token_value) values(p_job,encode(sha256(convert_to(p_token,'UTF8')),'hex'),p_token) on conflict(job_id) do update set token_hash=excluded.token_hash,token_value=excluded.token_value,created_at=now();
end;$$;
create or replace function public.jj_portal_revoke(p_job text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.jj_is_staff() then raise exception 'Staff access required'; end if;
 update public.jj_homeowner_links set token_value=null,token_hash=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex') where job_id=p_job;
end;$$;

-- Raw token is kept in the RLS-protected link table, never shared app_state.
create or replace function public.jj_portal_get_link(p_job text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.jj_is_staff() then raise exception 'Staff access required'; end if;
 return coalesce((select jsonb_build_object('exists',true,'token',token_value) from public.jj_homeowner_links where job_id=p_job),jsonb_build_object('exists',false));
end;$$;
revoke all on function public.jj_portal_get_link(text) from public,anon,authenticated;
grant execute on function public.jj_portal_get_link(text) to authenticated;

-- Recover an older hash-only link from the original URL without rotating it.
create or replace function public.jj_portal_restore_link(p_job text,p_token text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.jj_is_staff() then raise exception 'Staff access required'; end if;
 update public.jj_homeowner_links set token_value=p_token where job_id=p_job and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found then raise exception 'That link does not match this project’s active QR.'; end if;
end;$$;
revoke all on function public.jj_portal_restore_link(text,text) from public,anon,authenticated;
grant execute on function public.jj_portal_restore_link(text,text) to authenticated;

-- Read allowlist includes price and tax. Write allowlist never accepts pricing or internal fields.
create or replace function public.jj_portal_items(p_job text) returns jsonb language plpgsql security definer set search_path='' as $$
declare project jsonb; items jsonb; e record; found boolean; updated jsonb; item jsonb;
begin
 select p into project from public.app_state a,jsonb_array_elements(a.state->'projects') p where a.org_id='jj-home-renovations' and p->>'id'=p_job;
 if project is null then raise exception 'Job unavailable'; end if;
 items=coalesce(project->'selections','[]'::jsonb);
 for e in select * from public.jj_homeowner_events where job_id=p_job and not applied order by id loop
  found=false;updated='[]'::jsonb;
  for item in select value from jsonb_array_elements(items) loop
   if item->>'id'=e.item_id then
    found=true;
    if e.payload->>'kind'='select' and coalesce(item->>'status','Pending')='Pending' then item=item||jsonb_build_object('status','Selected','homeownerSelected',true,'homeownerSelectedAt',e.created_at); end if;
    if e.payload->>'kind'='edit' then item=item||(e.payload->'item'); end if;
   end if;
   updated=updated||jsonb_build_array(item);
  end loop;
  if not found and e.payload->>'kind'='add' then updated=updated||jsonb_build_array(e.payload->'item'); end if;
  items=updated;
 end loop;
 return jsonb_build_object('jobName',project->>'name','items',coalesce((select jsonb_agg(jsonb_build_object('id',i->>'id','title',i->>'title','description',i->>'description','room',i->>'room','category',i->>'category','vendor',i->>'vendor','model',i->>'model','url',i->>'url','image',i->>'image','quantity',i->'quantity','unitPrice',i->'unitPrice','addTax',i->'addTax','purchasedBy',i->>'purchasedBy','status',coalesce(i->>'status','Pending'),'homeownerSelected',coalesce((i->>'homeownerSelected')::boolean,false),'optionGroupId',i->>'optionGroupId','optionGroupTitle',i->>'optionGroupTitle','optionLabel',i->>'optionLabel')) from jsonb_array_elements(items) i),'[]'::jsonb));
end;$$;
create or replace function public.jj_portal_read(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare job text;
begin
 select job_id into job from public.jj_homeowner_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if job is null then raise exception 'This link is invalid or has been replaced. Ask J&J for a new QR code.'; end if;
 return public.jj_portal_items(job);
end;$$;
create or replace function public.jj_portal_write(p_token text,p_action text,p_item jsonb) returns void language plpgsql security definer set search_path='' as $$
declare job text; item jsonb; new_id text; current_items jsonb;
begin
 select job_id into job from public.jj_homeowner_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if job is null then raise exception 'Link unavailable'; end if;
 if (select count(*) from public.jj_homeowner_events where job_id=job and created_at>now()-interval '1 hour')>=100 then raise exception 'Too many updates. Please try later.'; end if;
 if p_item ?| array['unitPrice','price','addTax','tax','total','unitCost'] then raise exception 'Pricing is read-only. Contact J&J for price changes.'; end if;
 current_items=public.jj_portal_items(job)->'items';
 if p_action in ('select','edit','add') then
  select i into item from jsonb_array_elements(current_items) i where i->>'id'=p_item->>'id';
  if p_action<>'add' and item is null then raise exception 'Selection no longer exists. Refresh and try again.'; end if;
  if p_action='edit' and p_item ? 'expected' and p_item->'expected'<>item then raise exception 'This selection changed since you opened it. Close the editor, refresh, and try again.'; end if;
  if p_action='select' then
   if item->>'status' not in ('Pending','Selected') then raise exception 'This item has moved beyond selection. Refresh and try again.'; end if;
   if p_item ? 'expectedStatus' and p_item->>'expectedStatus'<>item->>'status' then raise exception 'Status changed. Refresh and try again.'; end if;
   item=jsonb_build_object('status',case when item->>'status'='Selected' then 'Pending' else 'Selected' end,'homeownerSelected',item->>'status'='Pending','homeownerSelectedAt',case when item->>'status'='Pending' then to_jsonb(now()) else 'null'::jsonb end);
  else
   if length(trim(coalesce(p_item->>'title','')))=0 or length(p_item::text)>900000 then raise exception 'Enter a product name and use a smaller photo'; end if;
   if coalesce(p_item->>'url','')<>'' and p_item->>'url' !~* '^https?://' then raise exception 'Use an http or https product link'; end if;
   if coalesce(p_item->>'image','')<>'' and p_item->>'image' !~* '^(https?://|data:image/(jpeg|jpg|png|webp|gif);base64,)' then raise exception 'Unsupported photo'; end if;
   if coalesce(p_item->>'status','Pending') not in ('Pending','Selected','Approved','Ordered','Received') then raise exception 'Invalid status'; end if;
   if p_action='add' and coalesce(p_item->>'status','Pending') not in ('Pending','Selected') then raise exception 'New selections must be Pending or Selected'; end if;
   if p_action='edit' and p_item->>'status'<>item->>'status' and (item->>'status' not in ('Pending','Selected') or p_item->>'status' not in ('Pending','Selected')) then raise exception 'Contact J&J to change approval or ordering status'; end if;
   if p_item ? 'purchasedBy' then raise exception 'Only staff can assign who buys materials'; end if;
   item=jsonb_build_object('title',left(trim(p_item->>'title'),200),'description',left(coalesce(p_item->>'description',''),4000),'room',left(coalesce(nullif(p_item->>'room',''),'Unassigned'),150),'category',left(coalesce(nullif(p_item->>'category',''),'Other'),100),'vendor',left(coalesce(p_item->>'vendor',''),200),'model',left(coalesce(p_item->>'model',''),200),'url',left(coalesce(p_item->>'url',''),2000),'image',coalesce(p_item->>'image',''),'quantity',greatest(1,least(10000,coalesce((p_item->>'quantity')::numeric,1))),'purchasedBy',case when p_action='edit' then coalesce(item->>'purchasedBy','Not assigned') else 'Not assigned' end,'optionGroupId',case when p_action='edit' then item->>'optionGroupId' else null end,'optionGroupTitle',case when p_action='edit' then item->>'optionGroupTitle' else null end,'optionLabel',case when p_action='edit' then item->>'optionLabel' else null end,'status',coalesce(p_item->>'status','Pending'),'homeownerSelected',coalesce(p_item->>'status','Pending')='Selected','homeownerSelectedAt',case when p_item->>'status'='Selected' then to_jsonb(now()) else 'null'::jsonb end);
  end if;
  new_id=case when p_action='add' then gen_random_uuid()::text else p_item->>'id' end;
  if p_action='add' then item=item||jsonb_build_object('id',new_id,'homeownerAdded',true); end if;
  insert into public.jj_homeowner_events(job_id,item_id,payload) values(job,new_id,jsonb_build_object('kind',case when p_action='add' then 'add' else 'edit' end,'item',item));
 else raise exception 'Action not allowed'; end if;
end;$$;

-- Staff imports the customer changes into existing shared state, with its normal approval trigger intact.
create or replace function public.jj_portal_sync(p_job text) returns jsonb language plpgsql security definer set search_path='' as $$
declare full_state jsonb; projects jsonb='[]'::jsonb; p jsonb; items jsonb; item jsonb; updated jsonb; e record; found boolean; last_id bigint;
begin
 if not public.jj_is_staff() then raise exception 'Staff access required'; end if;
 perform 1 from public.jj_homeowner_links where job_id=p_job for update;
 select state into full_state from public.app_state where org_id='jj-home-renovations' for update;
 select max(id) into last_id from public.jj_homeowner_events where job_id=p_job and not applied;
 if last_id is null then return null; end if;
 for p in select value from jsonb_array_elements(full_state->'projects') loop
  if p->>'id'=p_job then
   items=coalesce(p->'selections','[]'::jsonb);
   for e in select * from public.jj_homeowner_events where job_id=p_job and not applied and id<=last_id order by id loop
    found=false;updated='[]'::jsonb;
    for item in select value from jsonb_array_elements(items) loop
     if item->>'id'=e.item_id then
      found=true;
      if e.payload->>'kind'='select' and coalesce(item->>'status','Pending')='Pending' then item=item||jsonb_build_object('status','Selected','homeownerSelected',true,'homeownerSelectedAt',e.created_at); end if;
    if e.payload->>'kind'='edit' then item=item||(e.payload->'item'); end if;
     end if;
     updated=updated||jsonb_build_array(item);
    end loop;
    if not found and e.payload->>'kind'='add' then updated=updated||jsonb_build_array(e.payload->'item'); end if;
    items=updated;
   end loop;
   p=jsonb_set(p,'{selections}',items);
  end if;
  projects=projects||jsonb_build_array(p);
 end loop;
 full_state=jsonb_set(full_state,'{projects}',projects);
 update public.app_state set state=full_state,updated_at=clock_timestamp(),updated_by=auth.uid() where org_id='jj-home-renovations';
 update public.jj_homeowner_events set applied=true where job_id=p_job and id<=last_id;
 return full_state;
end;$$;

revoke all on function public.jj_is_staff(),public.jj_portal_items(text),public.jj_portal_link(text,text),public.jj_portal_revoke(text),public.jj_portal_read(text),public.jj_portal_write(text,text,jsonb),public.jj_portal_sync(text) from public,anon,authenticated;
grant execute on function public.jj_is_staff(),public.jj_portal_link(text,text),public.jj_portal_revoke(text),public.jj_portal_sync(text) to authenticated;
grant execute on function public.jj_portal_read(text),public.jj_portal_write(text,text,jsonb) to anon;
create or replace function public.jj_portal_sync_pending() returns jsonb language plpgsql security definer set search_path='' as $$
declare job text; result jsonb; latest jsonb;
begin
 if not public.jj_is_staff() then raise exception 'Staff access required'; end if;
 -- Match link-before-state lock order used by the single-project sync.
 for job in select distinct job_id from public.jj_homeowner_events where not applied order by job_id loop
  latest=public.jj_portal_sync(job);
  if latest is not null then result=latest; end if;
 end loop;
 return result;
end;$$;
revoke all on function public.jj_portal_sync_pending() from public,anon,authenticated;
grant execute on function public.jj_portal_sync_pending() to authenticated;
commit;
