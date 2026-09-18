-- Additive setup only. Does not update or delete existing jobs, estimates or selections.
begin;
create table if not exists public.jj_work_pay (
 org_id text primary key,
 revision bigint not null default 0,
 document jsonb not null default '{"companies":{},"configs":{},"work":{},"payments":{}}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.jj_work_pay enable row level security;
revoke all on public.jj_work_pay from public,anon,authenticated;
create or replace function public.jj_work_pay_access() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and app_role in ('admin','pre_approver','final_approver'));
$$;
create or replace function public.jj_work_pay_read() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.jj_work_pay_access() then raise exception 'Staff access required'; end if;
 insert into public.jj_work_pay(org_id) values('jj-home-renovations') on conflict do nothing;
 select jsonb_build_object('revision',revision,'document',document) into result from public.jj_work_pay where org_id='jj-home-renovations';
 return result;
end $$;
create or replace function public.jj_work_pay_save(expected_revision bigint, new_document jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; old_document jsonb; item record; payment jsonb; line jsonb; allocation jsonb; owed numeric; used numeric;
begin
 if not public.jj_work_pay_access() then raise exception 'Staff access required'; end if;
 if jsonb_typeof(new_document)<>'object' or jsonb_typeof(new_document->'payments') is distinct from 'object' or jsonb_typeof(new_document->'work') is distinct from 'object' or jsonb_typeof(new_document->'configs') is distinct from 'object' or jsonb_typeof(new_document->'companies') is distinct from 'object' then raise exception 'Invalid ledger'; end if;
 select document into old_document from public.jj_work_pay where org_id='jj-home-renovations' and revision=expected_revision for update;
 if old_document is null then raise exception 'Ledger changed on another device. Refresh and try again.'; end if;
 for item in select * from jsonb_each(old_document->'work') loop
  if new_document->'work'->item.key is distinct from item.value then raise exception 'Completed work cannot be changed or removed'; end if;
 end loop;
 -- Completion state is separate from immutable payout snapshots.
 for item in select * from jsonb_each(coalesce(old_document->'lifecycle','{}'::jsonb)) loop
  if new_document->'lifecycle'->item.key is null then raise exception 'Completion history cannot be removed'; end if;
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
   if not exists(select 1 from jsonb_array_elements(new_document->'work'->(line->>'workId')->'allocations') a where a->>'person'=line->>'person') then raise exception 'Unknown work allocation'; end if;
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
revoke all on function public.jj_work_pay_access(),public.jj_work_pay_read(),public.jj_work_pay_save(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.jj_work_pay_access(),public.jj_work_pay_read(),public.jj_work_pay_save(bigint,jsonb) to authenticated;
commit;
