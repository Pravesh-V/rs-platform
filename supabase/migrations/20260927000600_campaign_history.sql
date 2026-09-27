alter table public.campaigns add column current_version integer not null default 1 check (current_version >= 1);

create table public.campaign_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  client_id uuid not null,
  version integer not null check (version >= 1),
  name text not null,
  goal text,
  baseline_start date not null,
  baseline_end date not null,
  comparison_start date not null,
  comparison_end date not null,
  change_reason text,
  origin text not null check (origin in ('created','legacy_snapshot','revision')),
  actor_id uuid references auth.users(id),
  recorded_at timestamptz not null default now(),
  foreign key (campaign_id,client_id) references public.campaigns(id,client_id) on delete cascade,
  unique (campaign_id,version)
);

create table public.campaign_events (
  id uuid primary key,
  campaign_id uuid not null,
  client_id uuid not null,
  event_type text not null check (event_type in ('launch','pricing_change','advertising_change','site_change','other')),
  occurred_at timestamptz not null,
  description text not null check (length(trim(description)) between 1 and 2000),
  source_note text not null check (length(trim(source_note)) between 1 and 2000),
  actor_id uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  foreign key (campaign_id,client_id) references public.campaigns(id,client_id) on delete cascade
);

create index on public.campaign_versions(campaign_id,version desc);
create index on public.campaign_events(campaign_id,occurred_at desc);
alter table public.campaign_versions enable row level security;
alter table public.campaign_events enable row level security;
revoke all on public.campaign_versions,public.campaign_events from public,anon,authenticated;
grant select on public.campaign_versions,public.campaign_events to authenticated;
create policy campaign_version_read on public.campaign_versions for select to authenticated
  using ((select private.can_client(client_id,'read')));
create policy campaign_event_read on public.campaign_events for select to authenticated
  using ((select private.can_client(client_id,'read')));

create function private.capture_campaign_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.campaign_versions(campaign_id,client_id,version,name,goal,baseline_start,baseline_end,comparison_start,comparison_end,origin,actor_id)
  values(new.id,new.client_id,1,new.name,new.goal,new.baseline_start,new.baseline_end,new.comparison_start,new.comparison_end,'created',auth.uid());
  return new;
end;
$$;
revoke all on function private.capture_campaign_created() from public,anon,authenticated;
create trigger capture_campaign_created after insert on public.campaigns
  for each row execute function private.capture_campaign_created();

insert into public.campaign_versions(campaign_id,client_id,version,name,goal,baseline_start,baseline_end,comparison_start,comparison_end,origin,actor_id)
select c.id,c.client_id,1,c.name,c.goal,c.baseline_start,c.baseline_end,c.comparison_start,c.comparison_end,'legacy_snapshot',null
from public.campaigns c
where not exists(select 1 from public.campaign_versions v where v.campaign_id=c.id);

create function public.revise_campaign(
  p_client_id uuid,p_campaign_id uuid,p_expected_version integer,p_name text,p_goal text,
  p_baseline_start date,p_baseline_end date,p_comparison_start date,p_comparison_end date,p_reason text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_campaign public.campaigns%rowtype; v_org uuid;
begin
  if auth.uid() is null or not private.can_client(p_client_id,'edit') then raise exception 'Campaign edit access denied'; end if;
  if p_expected_version is null or p_expected_version < 1
     or length(trim(coalesce(p_name,''))) not between 1 and 160
     or length(coalesce(p_goal,'')) > 2000
     or length(trim(coalesce(p_reason,''))) not between 1 and 1000
     or p_baseline_start is null or p_baseline_end is null or p_comparison_start is null or p_comparison_end is null
     or p_baseline_start > p_baseline_end or p_baseline_end >= p_comparison_start or p_comparison_start > p_comparison_end then
    raise exception 'Invalid campaign revision';
  end if;
  select * into v_campaign from public.campaigns where id=p_campaign_id and client_id=p_client_id for update;
  if not found then raise exception 'Campaign not found for client'; end if;
  if v_campaign.current_version=p_expected_version+1 and v_campaign.name=trim(p_name)
     and v_campaign.goal is not distinct from nullif(trim(p_goal),'')
     and v_campaign.baseline_start=p_baseline_start and v_campaign.baseline_end=p_baseline_end
     and v_campaign.comparison_start=p_comparison_start and v_campaign.comparison_end=p_comparison_end
     and exists(select 1 from public.campaign_versions where campaign_id=p_campaign_id and version=v_campaign.current_version
       and change_reason=trim(p_reason) and actor_id=auth.uid()) then
    return v_campaign.current_version;
  end if;
  if v_campaign.current_version<>p_expected_version then raise exception 'Campaign version changed; refresh before editing'; end if;
  update public.campaigns set current_version=current_version+1,name=trim(p_name),goal=nullif(trim(p_goal),''),
    baseline_start=p_baseline_start,baseline_end=p_baseline_end,comparison_start=p_comparison_start,comparison_end=p_comparison_end
    where id=p_campaign_id and client_id=p_client_id;
  insert into public.campaign_versions(campaign_id,client_id,version,name,goal,baseline_start,baseline_end,comparison_start,comparison_end,change_reason,origin,actor_id)
  values(p_campaign_id,p_client_id,p_expected_version+1,trim(p_name),nullif(trim(p_goal),''),p_baseline_start,p_baseline_end,p_comparison_start,p_comparison_end,trim(p_reason),'revision',auth.uid());
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'campaign_revised',p_campaign_id);
  return p_expected_version+1;
end;
$$;

create function public.record_campaign_event(
  p_id uuid,p_client_id uuid,p_campaign_id uuid,p_event_type text,p_occurred_at timestamptz,p_description text,p_source_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if auth.uid() is null or not private.can_client(p_client_id,'edit') then raise exception 'Campaign edit access denied'; end if;
  if p_event_type not in ('launch','pricing_change','advertising_change','site_change','other')
     or p_occurred_at is null or length(trim(coalesce(p_description,''))) not between 1 and 2000
     or length(trim(coalesce(p_source_note,''))) not between 1 and 2000 then
    raise exception 'Invalid campaign event';
  end if;
  if not exists(select 1 from public.campaigns where id=p_campaign_id and client_id=p_client_id) then raise exception 'Campaign not found for client'; end if;
  insert into public.campaign_events(id,campaign_id,client_id,event_type,occurred_at,description,source_note,actor_id)
    values(p_id,p_campaign_id,p_client_id,p_event_type,p_occurred_at,trim(p_description),trim(p_source_note),auth.uid())
    on conflict(id) do nothing;
  if not found then
    if not exists(select 1 from public.campaign_events where id=p_id and campaign_id=p_campaign_id and client_id=p_client_id
      and event_type=p_event_type and occurred_at=p_occurred_at and description=trim(p_description)
      and source_note=trim(p_source_note) and actor_id=auth.uid()) then
      raise exception 'Campaign event request conflicts with an existing record';
    end if;
    return p_id;
  end if;
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'campaign_event_recorded',p_id);
  return p_id;
end;
$$;

revoke all on function public.revise_campaign(uuid,uuid,integer,text,text,date,date,date,date,text) from public,anon;
revoke all on function public.record_campaign_event(uuid,uuid,uuid,text,timestamptz,text,text) from public,anon;
grant execute on function public.revise_campaign(uuid,uuid,integer,text,text,date,date,date,date,text) to authenticated;
grant execute on function public.record_campaign_event(uuid,uuid,uuid,text,timestamptz,text,text) to authenticated;
