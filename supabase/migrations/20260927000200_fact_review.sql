alter table public.client_facts
  add column reviewed_by uuid references auth.users(id),
  add column reviewed_at timestamptz,
  add column review_note text check (review_note is null or length(review_note) <= 1000);

create function public.review_client_fact(
  p_client_id uuid,
  p_fact_id uuid,
  p_status text,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_fact public.client_facts%rowtype;
  v_note text := nullif(trim(p_note), '');
  v_org uuid;
begin
  if auth.uid() is null or not private.can_client(p_client_id, 'report') then
    raise exception 'Review access denied';
  end if;
  if p_status not in ('approved', 'rejected', 'stale')
     or length(coalesce(p_note, '')) > 1000 then
    raise exception 'Invalid fact review';
  end if;
  select * into v_fact from public.client_facts
    where id = p_fact_id and client_id = p_client_id for update;
  if not found then raise exception 'Fact not found for client'; end if;
  if v_fact.review_status = p_status and v_fact.review_note is not distinct from v_note then
    return p_fact_id;
  end if;
  update public.client_facts
    set review_status = p_status, review_note = v_note,
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_fact_id and client_id = p_client_id;
  select organization_id into v_org from public.clients where id = p_client_id;
  insert into public.audit_events(organization_id, client_id, actor_id, event_type, record_id)
    values(v_org, p_client_id, auth.uid(), 'fact_reviewed', p_fact_id);
  return p_fact_id;
end;
$$;

revoke all on function public.review_client_fact(uuid,uuid,text,text) from public, anon;
grant execute on function public.review_client_fact(uuid,uuid,text,text) to authenticated;
