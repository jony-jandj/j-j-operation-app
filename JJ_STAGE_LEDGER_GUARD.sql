-- Candidate stage integration safeguard. Run on the test database first.
begin;
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
