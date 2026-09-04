-- J&J Operations: allow approval steps to be undone safely.
-- Run this in Supabase SQL Editor if you already created the cloud database.

create or replace function public.enforce_po_approval_transitions()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor_role text;
  old_po record;
  new_status text;
begin
  select app_role
  into actor_role
  from public.profiles
  where id = (select auth.uid());

  if actor_role is null then
    raise exception 'No J&J role is assigned to this account.';
  end if;

  for old_po in
    select
      po->>'id' as po_id,
      po->>'status' as old_status
    from jsonb_array_elements(coalesce(old.state->'projects','[]'::jsonb)) project,
         jsonb_array_elements(coalesce(project->'pos','[]'::jsonb)) po
  loop
    select po->>'status'
    into new_status
    from jsonb_array_elements(coalesce(new.state->'projects','[]'::jsonb)) project,
         jsonb_array_elements(coalesce(project->'pos','[]'::jsonb)) po
    where po->>'id' = old_po.po_id
    limit 1;

    if new_status is distinct from old_po.old_status and new_status is not null then
      if old_po.old_status = 'Draft'
         and new_status = 'Pre-Approved'
         and actor_role = 'pre_approver' then
        continue;

      elsif old_po.old_status = 'Pre-Approved'
            and new_status = 'Draft'
            and actor_role = 'pre_approver' then
        continue;

      elsif old_po.old_status = 'Pre-Approved'
            and new_status = 'Approved'
            and actor_role = 'final_approver' then
        continue;

      elsif old_po.old_status = 'Approved'
            and new_status = 'Pre-Approved'
            and actor_role = 'final_approver' then
        continue;

      else
        raise exception
          'Your J&J role cannot change P.O. % from % to %.',
          old_po.po_id, old_po.old_status, new_status;
      end if;
    end if;
  end loop;

  return new;
end;
$$;
