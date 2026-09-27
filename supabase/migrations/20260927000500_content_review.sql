create function private.can_review_client(p_client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c
    join public.memberships m on m.organization_id = c.organization_id and m.user_id = (select auth.uid())
    left join public.client_access a on a.client_id = c.id and a.user_id = m.user_id
    where c.id = p_client and (m.role = 'owner' or a.role in ('manager','reviewer'))
  );
$$;
revoke all on function private.can_review_client(uuid) from public, anon;
grant execute on function private.can_review_client(uuid) to authenticated;

create table public.content_drafts (
  id uuid primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  campaign_id uuid,
  opportunity_id uuid references public.opportunities(id),
  current_version integer not null default 1 check (current_version >= 1),
  current_title text not null check (length(trim(current_title)) between 1 and 500),
  current_body text not null check (length(trim(current_body)) between 1 and 20000),
  current_source_note text not null check (length(trim(current_source_note)) between 1 and 2000),
  status text not null default 'draft' check (status in ('draft','internal_review','revision_requested','approved')),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, client_id),
  foreign key (campaign_id, client_id) references public.campaigns(id, client_id)
);

create table public.content_draft_versions (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  client_id uuid not null,
  version integer not null check (version >= 1),
  title text not null check (length(trim(title)) between 1 and 500),
  body text not null check (length(trim(body)) between 1 and 20000),
  source_note text not null check (length(trim(source_note)) between 1 and 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (draft_id, client_id) references public.content_drafts(id, client_id) on delete cascade,
  unique (draft_id, version)
);

create table public.content_review_events (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null,
  client_id uuid not null,
  version integer not null,
  decision text not null check (decision in ('submit','approve','request_revision')),
  note text check (note is null or length(note) <= 2000),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (draft_id, client_id) references public.content_drafts(id, client_id) on delete cascade
);

create index on public.content_drafts(client_id, status, updated_at desc);
create index on public.content_draft_versions(draft_id, version desc);
create index on public.content_review_events(draft_id, created_at desc);

alter table public.content_drafts enable row level security;
alter table public.content_draft_versions enable row level security;
alter table public.content_review_events enable row level security;
revoke all on public.content_drafts, public.content_draft_versions, public.content_review_events from public, anon, authenticated;
grant select on public.content_drafts, public.content_draft_versions, public.content_review_events to authenticated;
create policy content_draft_read on public.content_drafts for select to authenticated
  using ((select private.can_client(client_id, 'read')));
create policy content_version_read on public.content_draft_versions for select to authenticated
  using ((select private.can_client(client_id, 'read')));
create policy content_review_read on public.content_review_events for select to authenticated
  using ((select private.can_client(client_id, 'read')));

create function public.create_content_draft(
  p_id uuid, p_client_id uuid, p_campaign_id uuid, p_opportunity_id uuid,
  p_title text, p_body text, p_source_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if auth.uid() is null or not (private.can_client(p_client_id, 'edit') or private.can_client(p_client_id, 'contribute')) then
    raise exception 'Draft access denied';
  end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 500
     or length(trim(coalesce(p_body,''))) not between 1 and 20000
     or length(trim(coalesce(p_source_note,''))) not between 1 and 2000 then
    raise exception 'Invalid draft content';
  end if;
  if p_campaign_id is not null and not exists(select 1 from public.campaigns where id=p_campaign_id and client_id=p_client_id) then
    raise exception 'Campaign does not belong to client';
  end if;
  if p_opportunity_id is not null and not exists(select 1 from public.opportunities where id=p_opportunity_id and client_id=p_client_id) then
    raise exception 'Opportunity does not belong to client';
  end if;
  insert into public.content_drafts(id,client_id,campaign_id,opportunity_id,current_title,current_body,current_source_note,created_by)
    values(p_id,p_client_id,p_campaign_id,p_opportunity_id,trim(p_title),trim(p_body),trim(p_source_note),auth.uid())
    on conflict(id) do nothing;
  if not found then
    if not exists(select 1 from public.content_drafts where id=p_id and client_id=p_client_id
      and campaign_id is not distinct from p_campaign_id and opportunity_id is not distinct from p_opportunity_id
      and current_version=1 and current_title=trim(p_title) and current_body=trim(p_body)
      and current_source_note=trim(p_source_note) and created_by=auth.uid()) then
      raise exception 'Draft request conflicts with an existing record';
    end if;
    return p_id;
  end if;
  insert into public.content_draft_versions(draft_id,client_id,version,title,body,source_note,created_by)
    values(p_id,p_client_id,1,trim(p_title),trim(p_body),trim(p_source_note),auth.uid());
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'content_draft_created',p_id);
  return p_id;
end;
$$;

create function public.revise_content_draft(
  p_client_id uuid, p_draft_id uuid, p_expected_version integer,
  p_title text, p_body text, p_source_note text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_draft public.content_drafts%rowtype;
  v_org uuid;
begin
  if auth.uid() is null or not (private.can_client(p_client_id, 'edit') or private.can_client(p_client_id, 'contribute')) then
    raise exception 'Draft access denied';
  end if;
  if p_expected_version is null or p_expected_version < 1
     or length(trim(coalesce(p_title,''))) not between 1 and 500
     or length(trim(coalesce(p_body,''))) not between 1 and 20000
     or length(trim(coalesce(p_source_note,''))) not between 1 and 2000 then
    raise exception 'Invalid draft revision';
  end if;
  select * into v_draft from public.content_drafts where id=p_draft_id and client_id=p_client_id for update;
  if not found then raise exception 'Draft not found for client'; end if;
  if v_draft.current_version=p_expected_version+1 and v_draft.current_title=trim(p_title)
     and v_draft.current_body=trim(p_body) and v_draft.current_source_note=trim(p_source_note)
     and exists(select 1 from public.content_draft_versions where draft_id=p_draft_id
       and version=v_draft.current_version and created_by=auth.uid()) then
    return v_draft.current_version;
  end if;
  if v_draft.current_version<>p_expected_version then raise exception 'Draft version changed; refresh before editing'; end if;
  update public.content_drafts set current_version=current_version+1, current_title=trim(p_title),
    current_body=trim(p_body), current_source_note=trim(p_source_note), status='draft',
    approved_by=null, approved_at=null, updated_at=now()
    where id=p_draft_id and client_id=p_client_id;
  insert into public.content_draft_versions(draft_id,client_id,version,title,body,source_note,created_by)
    values(p_draft_id,p_client_id,p_expected_version+1,trim(p_title),trim(p_body),trim(p_source_note),auth.uid());
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'content_draft_revised',p_draft_id);
  return p_expected_version+1;
end;
$$;

create function public.review_content_draft(
  p_client_id uuid, p_draft_id uuid, p_version integer, p_decision text, p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_draft public.content_drafts%rowtype;
  v_status text;
  v_note text := nullif(trim(p_note),'');
  v_org uuid;
begin
  if auth.uid() is null then raise exception 'Draft access denied'; end if;
  if p_decision='submit' then
    if not (private.can_client(p_client_id,'edit') or private.can_client(p_client_id,'contribute')) then raise exception 'Draft access denied'; end if;
    v_status := 'internal_review';
  elsif p_decision='approve' then
    if not private.can_review_client(p_client_id) then raise exception 'Review access denied'; end if;
    v_status := 'approved';
  elsif p_decision='request_revision' then
    if not private.can_review_client(p_client_id) then raise exception 'Review access denied'; end if;
    if v_note is null then raise exception 'Explain the requested revision'; end if;
    v_status := 'revision_requested';
  else raise exception 'Invalid review decision';
  end if;
  if length(coalesce(p_note,''))>2000 then raise exception 'Review note too long'; end if;
  select * into v_draft from public.content_drafts where id=p_draft_id and client_id=p_client_id for update;
  if not found then raise exception 'Draft not found for client'; end if;
  if v_draft.current_version<>p_version then raise exception 'Draft version changed; refresh before review'; end if;
  if v_draft.status=v_status then return p_draft_id; end if;
  if p_decision='submit' and v_draft.status not in ('draft','revision_requested') then raise exception 'Draft cannot be submitted from this status'; end if;
  if p_decision in ('approve','request_revision') and v_draft.status<>'internal_review' then raise exception 'Draft is not in internal review'; end if;
  update public.content_drafts set status=v_status,
    approved_by=case when p_decision='approve' then auth.uid() else null end,
    approved_at=case when p_decision='approve' then now() else null end,
    updated_at=now() where id=p_draft_id and client_id=p_client_id;
  insert into public.content_review_events(draft_id,client_id,version,decision,note,actor_id)
    values(p_draft_id,p_client_id,p_version,p_decision,v_note,auth.uid());
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'content_review_' || p_decision,p_draft_id);
  return p_draft_id;
end;
$$;

revoke all on function public.create_content_draft(uuid,uuid,uuid,uuid,text,text,text) from public, anon;
revoke all on function public.revise_content_draft(uuid,uuid,integer,text,text,text) from public, anon;
revoke all on function public.review_content_draft(uuid,uuid,integer,text,text) from public, anon;
grant execute on function public.create_content_draft(uuid,uuid,uuid,uuid,text,text,text) to authenticated;
grant execute on function public.revise_content_draft(uuid,uuid,integer,text,text,text) to authenticated;
grant execute on function public.review_content_draft(uuid,uuid,integer,text,text) to authenticated;
