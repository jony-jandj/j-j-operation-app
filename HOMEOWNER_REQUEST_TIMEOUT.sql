begin;
alter function public.jj_portal_read(text) set statement_timeout='15s';
alter function public.jj_portal_write(text,text,jsonb) set statement_timeout='15s';
notify pgrst,'reload schema';
commit;
