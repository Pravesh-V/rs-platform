create table public.analytics_observations (
  id uuid primary key,
  organization_id uuid not null,
  client_id uuid not null,
  campaign_id uuid,
  supersedes_id uuid,
  source_kind text not null check (source_kind in ('ga4_export','other_authorized_export','manual_client_report')),
  property_reference text not null check (length(trim(property_reference)) between 1 and 160),
  property_timezone text not null check (length(trim(property_timezone)) between 1 and 80),
  period_start date not null,
  period_end date not null,
  dimension_scope text not null check (dimension_scope in ('session','event')),
  source_name text not null check (length(trim(source_name)) between 1 and 160),
  medium text not null check (length(trim(medium)) between 1 and 160),
  campaign_tag text check (campaign_tag is null or length(campaign_tag) between 1 and 160),
  content_tag text check (content_tag is null or length(content_tag) between 1 and 160),
  metric_name text not null check (metric_name in ('sessions','key_events','revenue')),
  event_name text check (event_name is null or length(event_name) between 1 and 160),
  metric_value numeric(18,2) not null check (metric_value >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  attribution_note text not null check (length(trim(attribution_note)) between 1 and 1000),
  source_note text not null check (length(trim(source_note)) between 1 and 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (client_id,organization_id) references public.clients(id,organization_id) on delete cascade,
  foreign key (campaign_id,client_id) references public.campaigns(id,client_id),
  foreign key (supersedes_id,client_id) references public.analytics_observations(id,client_id),
  unique (id,client_id),
  check (period_start<=period_end and period_end-period_start<=366),
  check ((metric_name='sessions' and dimension_scope='session' and metric_value=trunc(metric_value)
    and event_name is null and currency is null)
    or (metric_name='key_events' and event_name is not null and currency is null)
    or (metric_name='revenue' and currency is not null and event_name is null))
);
create index on public.analytics_observations(client_id,period_end desc,created_at desc);
alter table public.analytics_observations enable row level security;
revoke all on public.analytics_observations from public,anon,authenticated;
grant select,insert on public.analytics_observations to authenticated;
create policy analytics_observation_read on public.analytics_observations for select to authenticated
  using ((select private.can_client(client_id,'read')));
create policy analytics_observation_insert on public.analytics_observations for insert to authenticated
  with check ((select private.can_client(client_id,'report')) and created_by=(select auth.uid()));

create function private.audit_analytics_observation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(new.organization_id,new.client_id,new.created_by,'analytics_observation_recorded',new.id);
  return new;
end;
$$;
revoke all on function private.audit_analytics_observation() from public,anon;
create trigger analytics_observation_audit after insert on public.analytics_observations
  for each row execute function private.audit_analytics_observation();
