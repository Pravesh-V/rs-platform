create schema if not exists private;
grant usage on schema private to authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager','researcher','writer','reviewer','contributor','client_viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  website text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.client_access (
  client_id uuid not null,
  organization_id uuid not null,
  user_id uuid not null,
  role text not null check (role in ('manager','researcher','writer','reviewer','contributor','client_viewer')),
  primary key (client_id, user_id),
  foreign key (client_id, organization_id) references public.clients(id, organization_id) on delete cascade,
  foreign key (organization_id, user_id) references public.memberships(organization_id, user_id) on delete cascade
);

create function private.is_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.role = 'owner');
$$;

create function private.can_client(p_client uuid, p_action text) returns boolean
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
    )
  );
$$;
revoke all on function private.is_owner(uuid), private.can_client(uuid,text) from public;
grant execute on function private.is_owner(uuid), private.can_client(uuid,text) to authenticated;

create table public.client_facts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('product','alias','positioning','customer','differentiator','pricing','prohibited_claim','tone','objective','other')),
  statement text not null check (length(trim(statement)) between 1 and 5000),
  source_url text,
  verified_at date,
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected','stale')),
  created_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  goal text,
  baseline_start date not null,
  baseline_end date not null,
  comparison_start date not null,
  comparison_end date not null,
  created_at timestamptz not null default now(),
  check (baseline_start <= baseline_end and comparison_start <= comparison_end and baseline_end < comparison_start),
  unique (id, client_id)
);

create table public.reddit_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  external_id text not null,
  canonical_url text not null,
  subreddit text not null,
  item_type text not null check (item_type in ('post','comment')),
  published_at timestamptz,
  affiliation text not null default 'unknown' check (affiliation in ('agency','brand','independent','paid_disclosed','unknown')),
  campaign_id uuid,
  created_at timestamptz not null default now(),
  unique (client_id, external_id),
  unique (id, client_id),
  foreign key (campaign_id, client_id) references public.campaigns(id, client_id)
);

create table public.reddit_item_revisions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  item_id uuid not null,
  title text,
  body text,
  content_hash text not null,
  recorded_at timestamptz not null default now(),
  foreign key (item_id, client_id) references public.reddit_items(id, client_id) on delete cascade,
  unique (item_id, content_hash)
);

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  item_id uuid not null,
  campaign_id uuid,
  format text not null check (format in ('post','comment','faq','tutorial','comparison','other')),
  published_at timestamptz not null,
  verification_status text not null default 'user_reported' check (verification_status in ('user_reported','verified','disputed')),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (item_id, client_id) references public.reddit_items(id, client_id),
  foreign key (campaign_id, client_id) references public.campaigns(id, client_id),
  unique (item_id)
);

create table public.metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  item_id uuid not null,
  observed_at timestamptz not null,
  source_type text not null check (source_type in ('authorized_import','owner_insights','manual')),
  views bigint check (views is null or views >= 0),
  score bigint,
  replies bigint check (replies is null or replies >= 0),
  shares bigint check (shares is null or shares >= 0),
  created_at timestamptz not null default now(),
  foreign key (item_id, client_id) references public.reddit_items(id, client_id) on delete cascade,
  unique (item_id, observed_at, source_type)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  idempotency_key uuid not null,
  request_hash text not null,
  file_name text not null,
  source_note text not null,
  row_count integer not null check (row_count between 1 and 500),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (client_id, idempotency_key)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id),
  client_id uuid references public.clients(id),
  actor_id uuid references auth.users(id),
  event_type text not null,
  record_id uuid,
  created_at timestamptz not null default now()
);

create index on public.clients(organization_id);
create index on public.client_access(user_id, client_id);
create index on public.reddit_items(client_id, campaign_id);
create index on public.metric_snapshots(client_id, observed_at);
create index on public.metric_snapshots(item_id, observed_at desc);
create index on public.reddit_item_revisions(item_id, recorded_at desc);

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.clients enable row level security;
alter table public.client_access enable row level security;
alter table public.client_facts enable row level security;
alter table public.campaigns enable row level security;
alter table public.reddit_items enable row level security;
alter table public.reddit_item_revisions enable row level security;
alter table public.contributions enable row level security;
alter table public.metric_snapshots enable row level security;
alter table public.import_batches enable row level security;
alter table public.audit_events enable row level security;

-- API privileges and row policies are separate gates. Grant only operations used by
-- the application; imports and contributions must pass through their RPCs.
revoke all on public.organizations, public.memberships, public.clients,
  public.client_access, public.client_facts, public.campaigns,
  public.reddit_items, public.reddit_item_revisions, public.contributions,
  public.metric_snapshots, public.import_batches, public.audit_events
  from public, anon, authenticated;
grant select on public.organizations, public.memberships, public.clients,
  public.client_access, public.client_facts, public.campaigns,
  public.reddit_items, public.reddit_item_revisions, public.contributions,
  public.metric_snapshots, public.import_batches, public.audit_events
  to authenticated;
grant insert on public.clients, public.client_facts, public.campaigns,
  public.client_access to authenticated;
grant update on public.clients, public.client_access to authenticated;
grant delete on public.client_access to authenticated;

create policy org_read on public.organizations for select to authenticated using (
  exists(select 1 from public.memberships m where m.organization_id = id and m.user_id = (select auth.uid()))
);
create policy membership_read on public.memberships for select to authenticated using (
  user_id = (select auth.uid()) or (select private.is_owner(organization_id))
);
create policy client_read on public.clients for select to authenticated using ((select private.can_client(id, 'read')));
create policy client_insert on public.clients for insert to authenticated with check ((select private.is_owner(organization_id)));
create policy client_update on public.clients for update to authenticated using ((select private.is_owner(organization_id))) with check ((select private.is_owner(organization_id)));
create policy access_read on public.client_access for select to authenticated using (user_id = (select auth.uid()) or (select private.is_owner(organization_id)));
create policy access_write on public.client_access for all to authenticated using ((select private.is_owner(organization_id))) with check ((select private.is_owner(organization_id)));
create policy fact_read on public.client_facts for select to authenticated using ((select private.can_client(client_id, 'read')));
create policy fact_insert on public.client_facts for insert to authenticated with check ((select private.can_client(client_id, 'edit')));
create policy campaign_read on public.campaigns for select to authenticated using ((select private.can_client(client_id, 'read')));
create policy campaign_insert on public.campaigns for insert to authenticated with check ((select private.can_client(client_id, 'edit')));
create policy item_read on public.reddit_items for select to authenticated using ((select private.can_client(client_id, 'read')));
create policy item_insert on public.reddit_items for insert to authenticated with check ((select private.can_client(client_id, 'edit')) or (select private.can_client(client_id, 'contribute')));
create policy revision_read on public.reddit_item_revisions for select to authenticated using ((select private.can_client(client_id, 'read')));
create policy contribution_read on public.contributions for select to authenticated using ((select private.can_client(client_id, 'read')));
create policy metric_read on public.metric_snapshots for select to authenticated using ((select private.can_client(client_id, 'read')));
create policy batch_read on public.import_batches for select to authenticated using ((select private.can_client(client_id, 'read')));
create policy audit_read on public.audit_events for select to authenticated using ((select private.is_owner(organization_id)));

create function public.commit_reddit_import(
  p_client_id uuid,
  p_idempotency_key uuid,
  p_file_name text,
  p_source_note text,
  p_rows jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_batch uuid;
  v_org uuid;
  v_item uuid;
  v_row jsonb;
  v_hash text;
  v_request_hash text;
  v_count integer;
  v_existing public.metric_snapshots%rowtype;
begin
  if auth.uid() is null or not private.can_client(p_client_id, 'edit') then
    raise exception 'Client access denied';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Rows must be an array'; end if;
  v_count := jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 500 then raise exception 'Row count outside 1..500'; end if;
  if length(p_file_name) > 200 or length(p_source_note) > 1000 or length(trim(p_source_note)) = 0 then
    raise exception 'Invalid import metadata';
  end if;
  v_request_hash := pg_catalog.md5(jsonb_build_array(p_file_name,p_source_note,p_rows)::text);
  select organization_id into v_org from public.clients where id = p_client_id;
  insert into public.import_batches(client_id,idempotency_key,request_hash,file_name,source_note,row_count,created_by)
    values (p_client_id,p_idempotency_key,v_request_hash,p_file_name,p_source_note,v_count,auth.uid())
    on conflict (client_id,idempotency_key) do nothing returning id into v_batch;
  if v_batch is null then
    select id into v_batch from public.import_batches where client_id=p_client_id and idempotency_key=p_idempotency_key
      and request_hash=v_request_hash;
    if v_batch is null then raise exception 'Idempotency key was reused for different data'; end if;
    return v_batch;
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if coalesce(v_row->>'external_id','') !~ '^(t1_|t3_)[a-z0-9]+$'
       or coalesce(v_row->>'canonical_url','') !~ '^https://(www\.)?reddit\.com/'
       or (v_row->>'canonical_url') !~ ('/' || substring(v_row->>'external_id' from 4) || '(/|$)')
       or coalesce(v_row->>'item_type','') not in ('post','comment')
       or coalesce(v_row->>'affiliation','') not in ('agency','brand','independent','paid_disclosed','unknown')
       or length(trim(coalesce(v_row->>'subreddit',''))) not between 1 and 80
       or nullif(v_row->>'observed_at','') is null
       or length(coalesce(v_row->>'body','')) > 20000
       or length(coalesce(v_row->>'title','')) > 500 then
      raise exception 'Invalid imported row';
    end if;
    if (v_row->>'item_type' = 'post' and left(v_row->>'external_id',3) <> 't3_')
       or (v_row->>'item_type' = 'comment' and left(v_row->>'external_id',3) <> 't1_') then
      raise exception 'Item ID/type mismatch';
    end if;
    if nullif(v_row->>'published_at','')::timestamptz > (v_row->>'observed_at')::timestamptz then
      raise exception 'Observation predates publication';
    end if;
    if nullif(v_row->>'campaign_id','') is not null and not exists(
      select 1 from public.campaigns where id=(v_row->>'campaign_id')::uuid and client_id=p_client_id
    ) then raise exception 'Campaign does not belong to client'; end if;
    insert into public.reddit_items(client_id,external_id,canonical_url,subreddit,item_type,published_at,affiliation,campaign_id)
      values (p_client_id,v_row->>'external_id',v_row->>'canonical_url',v_row->>'subreddit',v_row->>'item_type',
        nullif(v_row->>'published_at','')::timestamptz,v_row->>'affiliation',nullif(v_row->>'campaign_id','')::uuid)
      on conflict (client_id,external_id) do nothing returning id into v_item;
    if v_item is null then
      select id into v_item from public.reddit_items where client_id=p_client_id and external_id=v_row->>'external_id';
      if not exists (
        select 1 from public.reddit_items where id=v_item and canonical_url=v_row->>'canonical_url'
          and subreddit=v_row->>'subreddit' and item_type=v_row->>'item_type'
          and affiliation=v_row->>'affiliation'
          and campaign_id is not distinct from nullif(v_row->>'campaign_id','')::uuid
          and published_at is not distinct from nullif(v_row->>'published_at','')::timestamptz
      ) then raise exception 'Imported item conflicts with an existing identity'; end if;
    end if;
    v_hash := pg_catalog.md5(jsonb_build_array(v_row->>'title',v_row->>'body')::text);
    insert into public.reddit_item_revisions(client_id,item_id,title,body,content_hash)
      values (p_client_id,v_item,v_row->>'title',v_row->>'body',v_hash)
      on conflict (item_id,content_hash) do nothing;
    insert into public.metric_snapshots(client_id,item_id,observed_at,source_type,views,score,replies,shares)
      values (p_client_id,v_item,(v_row->>'observed_at')::timestamptz,'authorized_import',
        nullif(v_row->>'views','')::bigint,nullif(v_row->>'score','')::bigint,
        nullif(v_row->>'replies','')::bigint,nullif(v_row->>'shares','')::bigint)
      on conflict (item_id,observed_at,source_type) do nothing;
    select * into v_existing from public.metric_snapshots
      where item_id=v_item and observed_at=(v_row->>'observed_at')::timestamptz and source_type='authorized_import';
    if v_existing.views is distinct from nullif(v_row->>'views','')::bigint
       or v_existing.score is distinct from nullif(v_row->>'score','')::bigint
       or v_existing.replies is distinct from nullif(v_row->>'replies','')::bigint
       or v_existing.shares is distinct from nullif(v_row->>'shares','')::bigint then
      raise exception 'An existing observation has different values; review it as a correction';
    end if;
    v_item := null;
  end loop;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'reddit_import_committed',v_batch);
  return v_batch;
end;
$$;
revoke all on function public.commit_reddit_import(uuid,uuid,text,text,jsonb) from public;
grant execute on function public.commit_reddit_import(uuid,uuid,text,text,jsonb) to authenticated;

create function public.record_contribution(
  p_client_id uuid,
  p_campaign_id uuid,
  p_external_id text,
  p_canonical_url text,
  p_subreddit text,
  p_item_type text,
  p_title text,
  p_format text,
  p_published_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_item uuid;
  v_contribution uuid;
  v_org uuid;
begin
  if auth.uid() is null or not (private.can_client(p_client_id,'edit') or private.can_client(p_client_id,'contribute')) then
    raise exception 'Client access denied';
  end if;
  if p_external_id !~ '^(t1_|t3_)[a-z0-9]+$'
     or p_canonical_url !~ '^https://(www\.)?reddit\.com/'
     or p_canonical_url !~ ('/' || substring(p_external_id from 4) || '(/|$)')
     or p_item_type not in ('post','comment')
     or (p_item_type='post' and left(p_external_id,3)<>'t3_')
     or (p_item_type='comment' and left(p_external_id,3)<>'t1_')
     or p_format not in ('post','comment','faq','tutorial','comparison','other')
     or length(trim(p_subreddit)) not between 1 and 80
     or length(coalesce(p_title,'')) > 500 then
    raise exception 'Invalid contribution';
  end if;
  if p_campaign_id is not null and not exists(select 1 from public.campaigns where id=p_campaign_id and client_id=p_client_id) then
    raise exception 'Campaign does not belong to client';
  end if;
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.reddit_items(client_id,external_id,canonical_url,subreddit,item_type,published_at,affiliation,campaign_id)
    values(p_client_id,p_external_id,p_canonical_url,p_subreddit,p_item_type,p_published_at,'agency',p_campaign_id)
    on conflict(client_id,external_id) do nothing returning id into v_item;
  if v_item is null then
    select id into v_item from public.reddit_items where client_id=p_client_id and external_id=p_external_id;
    if not exists (
      select 1 from public.reddit_items where id=v_item and canonical_url=p_canonical_url
        and subreddit=p_subreddit and item_type=p_item_type and affiliation='agency'
    ) then raise exception 'Contribution conflicts with existing item details'; end if;
  end if;
  insert into public.reddit_item_revisions(client_id,item_id,title,body,content_hash)
    values(p_client_id,v_item,p_title,null,pg_catalog.md5(jsonb_build_array(p_title,null)::text))
    on conflict(item_id,content_hash) do nothing;
  insert into public.contributions(client_id,item_id,campaign_id,format,published_at,recorded_by)
    values(p_client_id,v_item,p_campaign_id,p_format,p_published_at,auth.uid())
    on conflict(item_id) do nothing returning id into v_contribution;
  if v_contribution is null then
    select id into v_contribution from public.contributions where item_id=v_item and client_id=p_client_id;
    if not exists (
      select 1 from public.contributions where id=v_contribution
        and campaign_id is not distinct from p_campaign_id
        and format=p_format and published_at=p_published_at
    ) then raise exception 'Contribution conflicts with an existing record'; end if;
  end if;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'contribution_recorded',v_contribution);
  return v_contribution;
end;
$$;
revoke all on function public.record_contribution(uuid,uuid,text,text,text,text,text,text,timestamptz) from public;
grant execute on function public.record_contribution(uuid,uuid,text,text,text,text,text,text,timestamptz) to authenticated;
