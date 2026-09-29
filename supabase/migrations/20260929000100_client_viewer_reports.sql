-- Client viewers may discover their assigned client and read only approved,
-- frozen report versions. Internal evidence and draft policies stay unchanged.
create or replace function private.can_client(p_client uuid, p_action text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c
    join public.memberships m on m.organization_id = c.organization_id and m.user_id = (select auth.uid())
    left join public.client_access a on a.client_id = c.id and a.user_id = m.user_id
    where c.id = p_client and (
      m.role = 'owner'
      or (a.role = 'manager' and p_action in ('read','edit','report'))
      or (a.role = 'researcher' and p_action in ('read','edit'))
      or (a.role = 'writer' and p_action in ('read','contribute'))
      or (a.role = 'reviewer' and p_action = 'read')
      or (a.role = 'client_viewer' and p_action = 'viewer_read')
    )
  );
$$;

alter policy client_read on public.clients using (
  (select private.is_owner(organization_id))
  or (select private.can_client(id, 'read'))
  or (select private.can_client(id, 'viewer_read'))
);

alter policy report_read on public.report_snapshots using (
  (select private.can_client(client_id, 'read'))
  or (status = 'approved' and (select private.can_client(client_id, 'viewer_read')))
);
