create table public.community_research (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  subreddit text not null check (subreddit ~ '^[a-z0-9_]{2,80}$'),
  relevance_note text not null check (length(trim(relevance_note)) between 1 and 2000),
  activity_note text check (activity_note is null or length(activity_note) <= 2000),
  rules_url text check (rules_url is null or (length(rules_url) <= 500 and rules_url ~ '^https://')),
  rules_summary text check (rules_summary is null or length(rules_summary) <= 5000),
  rules_checked_at date,
  promotion_policy text not null default 'unknown'
    check (promotion_policy in ('unknown','allowed','restricted','not_allowed')),
  source_note text not null check (length(trim(source_note)) between 1 and 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (client_id, subreddit)
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  external_id text not null check (external_id ~ '^(t1_|t3_)[a-z0-9]+$'),
  canonical_url text not null check (length(canonical_url) <= 500 and canonical_url ~ '^https://(www\.)?reddit\.com/'),
  subreddit text not null check (subreddit ~ '^[a-z0-9_]{2,80}$'),
  title text not null check (length(trim(title)) between 1 and 500),
  context_note text not null check (length(trim(context_note)) between 1 and 5000),
  suggested_angle text check (suggested_angle is null or length(suggested_angle) <= 5000),
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  priority_reason text not null check (length(trim(priority_reason)) between 1 and 2000),
  status text not null default 'new'
    check (status in ('new','reviewed','assigned','drafted','dismissed')),
  source_note text not null check (length(trim(source_note)) between 1 and 2000),
  observed_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (client_id, external_id)
);

create index on public.community_research(client_id, created_at desc);
create index on public.opportunities(client_id, status, created_at desc);

alter table public.community_research enable row level security;
alter table public.opportunities enable row level security;
revoke all on public.community_research, public.opportunities from public, anon, authenticated;
grant select, insert on public.community_research, public.opportunities to authenticated;

create policy community_research_read on public.community_research for select to authenticated
  using ((select private.can_client(client_id, 'read')));
create policy community_research_insert on public.community_research for insert to authenticated
  with check ((select private.can_client(client_id, 'edit')) and created_by = (select auth.uid()));
create policy opportunity_read on public.opportunities for select to authenticated
  using ((select private.can_client(client_id, 'read')));
create policy opportunity_insert on public.opportunities for insert to authenticated
  with check ((select private.can_client(client_id, 'edit')) and created_by = (select auth.uid()));

create function public.set_opportunity_status(p_client_id uuid, p_opportunity_id uuid, p_status text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old_status text;
  v_org uuid;
begin
  if auth.uid() is null or not private.can_client(p_client_id, 'edit') then
    raise exception 'Opportunity access denied';
  end if;
  if p_status is null or p_status not in ('new','reviewed','assigned','drafted','dismissed') then
    raise exception 'Invalid opportunity status';
  end if;
  select status into v_old_status from public.opportunities
    where id = p_opportunity_id and client_id = p_client_id for update;
  if not found then raise exception 'Opportunity not found for client'; end if;
  if v_old_status = p_status then return p_opportunity_id; end if;
  update public.opportunities set status = p_status
    where id = p_opportunity_id and client_id = p_client_id;
  select organization_id into v_org from public.clients where id = p_client_id;
  insert into public.audit_events(organization_id, client_id, actor_id, event_type, record_id)
    values(v_org, p_client_id, auth.uid(), 'opportunity_status_changed', p_opportunity_id);
  return p_opportunity_id;
end;
$$;

revoke all on function public.set_opportunity_status(uuid,uuid,text) from public, anon;
grant execute on function public.set_opportunity_status(uuid,uuid,text) to authenticated;
