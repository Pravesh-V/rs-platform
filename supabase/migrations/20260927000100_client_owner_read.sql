-- An INSERT ... RETURNING must also pass the SELECT policy. The existing
-- can_client() check scans clients and cannot see the newly inserted row in
-- the statement's stable snapshot, so grant the owner path directly.
alter policy client_read on public.clients using (
  (select private.is_owner(organization_id))
  or (select private.can_client(id, 'read'))
);
