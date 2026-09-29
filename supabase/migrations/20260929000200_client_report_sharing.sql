-- Internal approval and client release are separate decisions. Existing
-- approved reports remain private until an owner or manager releases one.
alter table public.report_snapshots
  add column shared_with_client_at timestamptz,
  add column shared_by uuid references auth.users(id);

alter policy report_read on public.report_snapshots using (
  (select private.can_client(client_id, 'read'))
  or (
    status = 'approved'
    and shared_with_client_at is not null
    and (select private.can_client(client_id, 'viewer_read'))
  )
);

create function public.set_report_client_sharing(p_client_id uuid, p_report_id uuid, p_shared boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_report public.report_snapshots%rowtype; v_org uuid;
begin
  if auth.uid() is null or not private.can_client(p_client_id,'report') then
    raise exception 'Report sharing access denied';
  end if;
  if p_shared is null then raise exception 'Sharing choice required'; end if;
  select * into v_report from public.report_snapshots
    where id=p_report_id and client_id=p_client_id for update;
  if not found then raise exception 'Report not found for client'; end if;
  if p_shared and v_report.status <> 'approved' then
    raise exception 'Only approved reports can be shared';
  end if;
  if p_shared = (v_report.shared_with_client_at is not null) then return p_report_id; end if;
  update public.report_snapshots
    set shared_with_client_at = case when p_shared then now() else null end,
        shared_by = case when p_shared then auth.uid() else null end
    where id=p_report_id;
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),
      case when p_shared then 'report_shared_with_client' else 'report_unshared_from_client' end,p_report_id);
  return p_report_id;
end;
$$;
revoke all on function public.set_report_client_sharing(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_report_client_sharing(uuid,uuid,boolean) to authenticated;
