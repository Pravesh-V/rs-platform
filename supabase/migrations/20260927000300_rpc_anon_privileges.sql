-- Supabase may explicitly grant anon EXECUTE on newly created public functions.
-- Revoking only PUBLIC leaves that grant in place.
revoke execute on function public.commit_reddit_import(uuid,uuid,text,text,jsonb) from anon;
revoke execute on function public.record_contribution(uuid,uuid,text,text,text,text,text,text,timestamptz) from anon;
revoke execute on function public.review_client_fact(uuid,uuid,text,text) from anon;
