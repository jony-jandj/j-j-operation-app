-- Run once in the existing project's Supabase SQL Editor.
-- Keeps account permissions; matches P.O.s by project AND P.O. ID.
begin;
create or replace function public.enforce_po_approval_transitions()
returns trigger language plpgsql security invoker set search_path=public as $$
declare
  actor_name text;
  actor_role text;
  item record;
  prior jsonb;
begin
  select display_name, app_role into actor_name, actor_role
    from public.profiles where id=(select auth.uid());
  for item in
    select project->>'id' project_id, po
    from jsonb_array_elements(coalesce(new.state->'projects','[]'::jsonb)) project,
         jsonb_array_elements(coalesce(project->'pos','[]'::jsonb)) po
  loop
    select po into prior
    from jsonb_array_elements(coalesce(old.state->'projects','[]'::jsonb)) project,
         jsonb_array_elements(coalesce(project->'pos','[]'::jsonb)) po
    where project->>'id'=item.project_id and po->>'id'=item.po->>'id' limit 1;
    if (coalesce(prior->>'status','Draft') is distinct from coalesce(item.po->>'status','Draft'))
       or (coalesce(prior->>'approvedBy','') is distinct from coalesce(item.po->>'approvedBy','')) then
      if actor_name is null or actor_name not in ('Jony','Adair','Gio')
         or actor_role is null or actor_role not in ('pre_approver','final_approver') then
        raise exception 'Your signed-in account cannot change P.O. approvals.';
      end if;
      if coalesce(item.po->>'status','Draft') not in ('Draft','Approved') then
        raise exception 'Refresh the app to use one-step P.O. approval.';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_enforce_po_approval_transitions on public.app_state;
create trigger trg_enforce_po_approval_transitions before update of state on public.app_state
for each row execute function public.enforce_po_approval_transitions();
commit;
