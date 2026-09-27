create table public.report_snapshots (
  id uuid primary key,
  client_id uuid not null,
  campaign_id uuid not null,
  report_month date not null check (report_month = date_trunc('month', report_month)::date),
  version integer not null check (version >= 1),
  status text not null default 'draft' check (status in ('draft','approved')),
  calculation_version text not null default 'reddit-lifetime-v1',
  dataset jsonb not null,
  dataset_sha256 text not null check (dataset_sha256 ~ '^[a-f0-9]{64}$'),
  executive_summary text not null check (length(trim(executive_summary)) between 1 and 5000),
  next_steps text not null check (length(trim(next_steps)) between 1 and 5000),
  limitations text not null check (length(trim(limitations)) between 1 and 5000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  approval_note text,
  foreign key (campaign_id,client_id) references public.campaigns(id,client_id),
  unique (campaign_id,report_month,version),
  unique (id,client_id)
);
create index on public.report_snapshots(client_id,report_month desc,created_at desc);
alter table public.report_snapshots enable row level security;
revoke all on public.report_snapshots from public,anon,authenticated;
grant select on public.report_snapshots to authenticated;
create policy report_read on public.report_snapshots for select to authenticated
  using ((select private.can_client(client_id,'read')));

create function public.create_report_snapshot(
  p_id uuid,p_client_id uuid,p_campaign_id uuid,p_report_month date,
  p_executive_summary text,p_next_steps text,p_limitations text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_campaign public.campaigns%rowtype; v_client public.clients%rowtype;
  v_existing public.report_snapshots%rowtype; v_dataset jsonb; v_version integer;
  v_baseline_start timestamptz; v_baseline_end timestamptz;
  v_comparison_start timestamptz; v_comparison_end timestamptz;
  v_total bigint;
begin
  if auth.uid() is null or not private.can_client(p_client_id,'report') then
    raise exception 'Report creation access denied';
  end if;
  if p_id is null or p_report_month is null or p_report_month<>date_trunc('month',p_report_month)::date
     or length(trim(coalesce(p_executive_summary,''))) not between 1 and 5000
     or length(trim(coalesce(p_next_steps,''))) not between 1 and 5000
     or length(trim(coalesce(p_limitations,''))) not between 1 and 5000 then
    raise exception 'Invalid report details';
  end if;
  select * into v_existing from public.report_snapshots where id=p_id;
  if found then
    if v_existing.client_id<>p_client_id or v_existing.campaign_id<>p_campaign_id
       or v_existing.report_month<>p_report_month
       or v_existing.executive_summary<>trim(p_executive_summary)
       or v_existing.next_steps<>trim(p_next_steps)
       or v_existing.limitations<>trim(p_limitations)
       or v_existing.created_by<>auth.uid() then
      raise exception 'Report request conflicts with an existing snapshot';
    end if;
    return p_id;
  end if;
  select * into v_campaign from public.campaigns where id=p_campaign_id and client_id=p_client_id for update;
  if not found then raise exception 'Campaign not found for client'; end if;
  select * into v_client from public.clients where id=p_client_id;
  select count(*) into v_total from public.metric_snapshots where client_id=p_client_id;
  if v_total>10000 then raise exception 'Evidence exceeds the current report safety cap'; end if;
  v_baseline_start := v_campaign.baseline_start::timestamp at time zone v_client.timezone;
  v_baseline_end := (v_campaign.baseline_end+1)::timestamp at time zone v_client.timezone;
  v_comparison_start := v_campaign.comparison_start::timestamp at time zone v_client.timezone;
  v_comparison_end := (v_campaign.comparison_end+1)::timestamp at time zone v_client.timezone;
  with selected as (
    select s.id,s.item_id,s.observed_at,s.views,s.source_type
    from public.metric_snapshots s join public.reddit_items i on i.id=s.item_id and i.client_id=s.client_id
    where s.client_id=p_client_id and i.campaign_id=p_campaign_id
  ), baseline as (
    select * from selected where observed_at>=v_baseline_start and observed_at<v_baseline_end
  ), comparison as (
    select * from selected where observed_at>=v_comparison_start and observed_at<v_comparison_end
  ), base_latest as (
    select distinct on (item_id) item_id,views from baseline order by item_id,observed_at desc,id desc
  ), comp_latest as (
    select distinct on (item_id) item_id,views from comparison order by item_id,observed_at desc,id desc
  ), matched as (
    select b.views as before_views,c.views as after_views from base_latest b
    join comp_latest c using(item_id) where b.views is not null and c.views is not null
  )
  select jsonb_build_object(
    'calculation_version','reddit-lifetime-v1',
    'client_id',p_client_id,'campaign_id',p_campaign_id,
    'campaign_version',v_campaign.current_version,'timezone',v_client.timezone,
    'baseline_dates',jsonb_build_array(v_campaign.baseline_start,v_campaign.baseline_end),
    'comparison_dates',jsonb_build_array(v_campaign.comparison_start,v_campaign.comparison_end),
    'baseline',jsonb_build_object('observations',(select count(*) from baseline),
      'items',(select count(*) from base_latest),'measured_items',(select count(views) from base_latest),
      'latest_lifetime_views',(select sum(views) from base_latest)),
    'comparison',jsonb_build_object('observations',(select count(*) from comparison),
      'items',(select count(*) from comp_latest),'measured_items',(select count(views) from comp_latest),
      'latest_lifetime_views',(select sum(views) from comp_latest)),
    'matched',jsonb_build_object('items',(select count(*) from matched),
      'baseline_views',(select sum(before_views) from matched),
      'comparison_views',(select sum(after_views) from matched),
      'change',(select sum(after_views-before_views) from matched)),
    'evidence_snapshot_ids',coalesce((select jsonb_agg(id order by observed_at,id)
      from selected where (observed_at>=v_baseline_start and observed_at<v_baseline_end)
        or (observed_at>=v_comparison_start and observed_at<v_comparison_end)),'[]'::jsonb),
    'campaign_event_ids',coalesce((select jsonb_agg(id order by occurred_at,id) from public.campaign_events
      where client_id=p_client_id and campaign_id=p_campaign_id
        and occurred_at>=v_baseline_start and occurred_at<v_comparison_end),'[]'::jsonb),
    'coverage_note','Only manually recorded, campaign-linked observations within the saved windows; unknown views remain null. Views are latest recorded lifetime counters, not unique reach or causal impact.'
  ) into v_dataset;
  select coalesce(max(version),0)+1 into v_version from public.report_snapshots
    where campaign_id=p_campaign_id and report_month=p_report_month;
  insert into public.report_snapshots(id,client_id,campaign_id,report_month,version,dataset,dataset_sha256,
    executive_summary,next_steps,limitations,created_by)
  values(p_id,p_client_id,p_campaign_id,p_report_month,v_version,v_dataset,
    encode(sha256(convert_to(v_dataset::text,'UTF8')),'hex'),
    trim(p_executive_summary),trim(p_next_steps),trim(p_limitations),auth.uid());
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_client.organization_id,p_client_id,auth.uid(),'report_snapshot_created',p_id);
  return p_id;
end;
$$;

create function public.approve_report_snapshot(p_client_id uuid,p_report_id uuid,p_note text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_report public.report_snapshots%rowtype; v_org uuid;
begin
  if auth.uid() is null or not private.can_client(p_client_id,'report') then
    raise exception 'Report approval access denied';
  end if;
  if length(trim(coalesce(p_note,''))) not between 1 and 2000 then raise exception 'Approval note required'; end if;
  select * into v_report from public.report_snapshots where id=p_report_id and client_id=p_client_id for update;
  if not found then raise exception 'Report not found for client'; end if;
  if v_report.status='approved' then
    if v_report.approved_by=auth.uid() and v_report.approval_note=trim(p_note) then return p_report_id; end if;
    raise exception 'Report is already approved';
  end if;
  if v_report.dataset_sha256<>encode(sha256(convert_to(v_report.dataset::text,'UTF8')),'hex') then
    raise exception 'Report dataset checksum mismatch';
  end if;
  update public.report_snapshots set status='approved',approved_by=auth.uid(),approved_at=now(),approval_note=trim(p_note)
    where id=p_report_id;
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'report_snapshot_approved',p_report_id);
  return p_report_id;
end;
$$;
revoke all on function public.create_report_snapshot(uuid,uuid,uuid,date,text,text,text) from public,anon;
revoke all on function public.approve_report_snapshot(uuid,uuid,text) from public,anon;
grant execute on function public.create_report_snapshot(uuid,uuid,uuid,date,text,text,text) to authenticated;
grant execute on function public.approve_report_snapshot(uuid,uuid,text) to authenticated;
