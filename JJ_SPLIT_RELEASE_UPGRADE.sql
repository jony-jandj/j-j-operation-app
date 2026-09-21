-- J&J split release: additive upgrade for the production schema compared 2026-09-21.
-- Preserves existing table data, policies, grants, and function ownership.
-- Run this file once in the production SQL editor BEFORE uploading the app files.
-- Transaction aborts if the save function changed since comparison; compare again then.
begin;
do $$
declare actual text;
begin
 select md5(regexp_replace(prosrc,'[[:space:]]+','','g')) into actual
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='jj_work_pay_save'
 and pg_get_function_identity_arguments(p.oid)='expected_revision bigint, new_document jsonb';
 if actual is null or actual not in ('02e1931d7566597b1ead635533bb7937','15d7c128254f62dad0cdce78a8dc523d') then
  raise exception 'Save function differs from reviewed version. Stop and compare before updating.';
 end if;
end $$;
create or replace function public.jj_work_pay_save(expected_revision bigint, new_document jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; old_document jsonb; item record; payment jsonb; line jsonb; allocation jsonb; owed numeric; used numeric;
begin
 if not public.jj_work_pay_access() then raise exception 'Staff access required'; end if;
 if jsonb_typeof(new_document)<>'object' or jsonb_typeof(new_document->'payments') is distinct from 'object' or jsonb_typeof(new_document->'work') is distinct from 'object' or jsonb_typeof(new_document->'configs') is distinct from 'object' or jsonb_typeof(new_document->'companies') is distinct from 'object' then raise exception 'Invalid ledger'; end if;
 select document into old_document from public.jj_work_pay where org_id='jj-home-renovations' and revision=expected_revision for update;
 if old_document is null then raise exception 'Ledger changed on another device. Refresh and try again.'; end if;
 for item in select * from jsonb_each(old_document->'work') loop
  if new_document->'work'->item.key is distinct from item.value then
   if new_document->'work'->item.key is not null or not exists(select 1 from jsonb_each(coalesce(new_document->'workArchive','{}'::jsonb)) a where a.value->>'sourceKey'=item.key and a.value->'work'=item.value and a.value->'lifecycle'=coalesce(old_document->'lifecycle'->item.key,'{}'::jsonb)) then raise exception 'Completed work cannot be changed or removed without an exact archive'; end if;
  end if;
 end loop;
 for item in select * from jsonb_each(coalesce(old_document->'workArchive','{}'::jsonb)) loop
  if new_document->'workArchive'->item.key is distinct from item.value then raise exception 'Archived payout history cannot be changed'; end if;
 end loop;
 -- Completion state is separate from immutable payout snapshots.
 for item in select * from jsonb_each(coalesce(old_document->'lifecycle','{}'::jsonb)) loop
  if new_document->'lifecycle'->item.key is null then
   if exists(select 1 from jsonb_each(coalesce(new_document->'workArchive','{}'::jsonb)) a where a.value->>'sourceKey'=item.key and a.value->'lifecycle'=item.value) then continue; end if;
   raise exception 'Completion history cannot be removed';
  end if;
  if not ((new_document->'lifecycle'->item.key->'history') @> (item.value->'history')) then raise exception 'Completion history must be retained'; end if;
 end loop;
 for item in select * from jsonb_each(coalesce(new_document->'lifecycle','{}'::jsonb)) loop
  if new_document->'work'->item.key is null then raise exception 'Unknown work record'; end if;
  if jsonb_typeof(item.value->'history') is distinct from 'array' then raise exception 'Completion history required'; end if;
  if item.value ? 'completedDate' then perform (item.value->>'completedDate')::date; end if;
 end loop;
 for item in select * from jsonb_each(old_document->'payments') loop
  payment:=new_document->'payments'->item.key;
  if payment is null or (payment - array['voided','voidReason','voidedAt','voidedBy']) is distinct from (item.value - array['voided','voidReason','voidedAt','voidedBy']) or ((item.value->>'voided')::boolean and payment is distinct from item.value) then raise exception 'Original payments cannot be edited or removed'; end if;
 end loop;
 for payment in select value from jsonb_each(new_document->'payments') loop
  if jsonb_typeof(payment->'lines') is distinct from 'array' or jsonb_array_length(payment->'lines')=0 then raise exception 'Payment requires allocations'; end if;
  if (payment->>'voided')::boolean and coalesce(length(trim(payment->>'voidReason')),0)=0 then raise exception 'Void reason required'; end if;
  for line in select value from jsonb_array_elements(payment->'lines') loop
   if (line->>'amount')::numeric<=0 or mod((line->>'amount')::numeric,1)<>0 then raise exception 'Invalid payment amount'; end if;
   if not coalesce((payment->>'voided')::boolean,false) and coalesce((new_document->'lifecycle'->(line->>'workId')->>'incomplete')::boolean,false) then raise exception 'Void recorded payments before reopening work; incomplete work cannot be paid'; end if;
   if not exists(select 1 from jsonb_array_elements(new_document->'work'->(line->>'workId')->'allocations') a where a->>'person'=line->>'person') and not (coalesce((payment->>'voided')::boolean,false) and exists(select 1 from jsonb_each(coalesce(new_document->'workArchive','{}'::jsonb)) a cross join lateral jsonb_array_elements(a.value->'work'->'allocations') archived_allocation where a.value->>'sourceKey'=line->>'workId' and archived_allocation->>'person'=line->>'person')) then raise exception 'Unknown work allocation'; end if;
  end loop;
 end loop;
 for item in select * from jsonb_each(new_document->'work') loop
  for allocation in select value from jsonb_array_elements(item.value->'allocations') loop
   owed:=(allocation->>'amount')::numeric;
   if owed<=0 or mod(owed,1)<>0 then raise exception 'Invalid earnings'; end if;
   select coalesce(sum((l->>'amount')::numeric),0) into used from jsonb_each(new_document->'payments') p cross join lateral jsonb_array_elements(p.value->'lines') l where not coalesce((p.value->>'voided')::boolean,false) and l->>'workId'=item.key and l->>'person'=allocation->>'person';
   if used>owed then raise exception 'Payment exceeds outstanding balance'; end if;
  end loop;
 end loop;
 update public.jj_work_pay set document=new_document,revision=revision+1,updated_at=clock_timestamp() where org_id='jj-home-renovations' and revision=expected_revision
 returning jsonb_build_object('revision',revision,'document',document) into result;
 if result is null then raise exception 'Ledger changed on another device. Refresh and try again.'; end if;
 return result;
end $$;
create or replace function public.jj_validate_stage_ledger()
returns trigger language plpgsql security invoker set search_path=public as $$
declare
 plan record; stage jsonb; wk text; parts jsonb; total numeric;
 oldplan record; priorstage jsonb; workrecord jsonb;
begin
 for plan in select * from jsonb_each(coalesce(new.document->'stagePlans','{}'::jsonb)) loop
  parts:=plan.key::jsonb;
  if jsonb_array_length(parts)<>2 or jsonb_typeof(plan.value->'stages') is distinct from 'array' or jsonb_array_length(plan.value->'stages')<>2 then raise exception 'Invalid split plan'; end if;
  if new.document->'work'->plan.key is not null then raise exception 'A split parent cannot also have payable work'; end if;
  if (select count(distinct s->>'id') from jsonb_array_elements(plan.value->'stages') s)<>2 then raise exception 'Split IDs must be unique'; end if;
  total:=0;
  for stage in select * from jsonb_array_elements(plan.value->'stages') loop
   if stage->>'id' is null or stage->>'status' is null or stage->>'status' not in ('Draft','Approved') or (stage->>'budgetCents')::numeric<=0 or mod((stage->>'budgetCents')::numeric,1)<>0 then raise exception 'Invalid split stage'; end if;
   total:=total+(stage->>'budgetCents')::numeric;
   wk:='['||to_jsonb(parts->>0)::text||','||to_jsonb(parts->>1)::text||','||to_jsonb(stage->>'id')::text||']';
   if stage->>'status'='Approved' and (coalesce(length(trim(stage->>'title')),0)=0 or coalesce(length(trim(stage->>'description')),0)=0) then raise exception 'Approved split requires title and description'; end if;
   workrecord:=new.document->'work'->wk;
   if workrecord is not null then
    if stage->>'status'<>'Approved' or workrecord->>'stageId' is distinct from stage->>'id' then raise exception 'Stage work requires matching approved stage'; end if;
    if (select coalesce(sum((a->>'amount')::numeric),0) from jsonb_array_elements(workrecord->'allocations') a)>(stage->>'budgetCents')::numeric then raise exception 'Stage earnings exceed budget'; end if;
   end if;
  end loop;
  if total is distinct from (plan.value->>'budgetCents')::numeric then raise exception 'Stage budgets must match parent payout'; end if;
 end loop;
 -- Never orphan stage history when a split is removed or a stage ID changes.
 for oldplan in select * from jsonb_each(coalesce(old.document->'stagePlans','{}'::jsonb)) loop
  parts:=oldplan.key::jsonb;
  for priorstage in select * from jsonb_array_elements(oldplan.value->'stages') loop
   wk:='['||to_jsonb(parts->>0)::text||','||to_jsonb(parts->>1)::text||','||to_jsonb(priorstage->>'id')::text||']';
   if not exists(select 1 from jsonb_array_elements(coalesce(new.document->'stagePlans'->oldplan.key->'stages','[]'::jsonb)) s where s->>'id'=priorstage->>'id') then
    if new.document->'work'->wk is not null
       or exists(select 1 from jsonb_each(coalesce(new.document->'workArchive','{}'::jsonb)) a where a.value->>'sourceKey'=wk)
       or exists(select 1 from jsonb_each(new.document->'payments') p cross join lateral jsonb_array_elements(p.value->'lines') l where l->>'workId'=wk) then raise exception 'Split with work or payment history cannot be removed'; end if;
   end if;
  end loop;
 end loop;
 return new;
end $$;
drop trigger if exists jj_stage_ledger_guard on public.jj_work_pay;
create trigger jj_stage_ledger_guard before insert or update of document on public.jj_work_pay for each row execute function public.jj_validate_stage_ledger();
commit;
