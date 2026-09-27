create table public.search_sets (
  id uuid primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  version integer not null check (version>=1),
  engine text not null check (length(trim(engine)) between 1 and 80),
  region text not null check (length(trim(region)) between 2 and 80),
  language text not null check (length(trim(language)) between 2 and 40),
  device text not null check (device in ('desktop','mobile')),
  status text not null default 'draft' check (status in ('draft','frozen')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  frozen_at timestamptz,
  unique(client_id,name,version),
  unique(id,client_id)
);
create table public.search_keywords (
  id uuid primary key,
  client_id uuid not null,
  set_id uuid not null,
  ordinal integer not null check (ordinal between 1 and 100),
  phrase text not null check (length(trim(phrase)) between 1 and 300),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(set_id,client_id) references public.search_sets(id,client_id) on delete cascade,
  unique(set_id,ordinal),
  unique(id,client_id,set_id)
);
create table public.search_observations (
  id uuid primary key,
  client_id uuid not null,
  set_id uuid not null,
  keyword_id uuid not null,
  wave_label text not null check (length(trim(wave_label)) between 1 and 80),
  observed_at timestamptz not null,
  source_provider text not null check (length(trim(source_provider)) between 1 and 120),
  sampling_method text not null check (sampling_method in ('manual_serp','authorized_export')),
  result_type text not null check (result_type in ('organic','ai_summary','advertisement')),
  outcome text not null check (outcome in ('present','not_found','error')),
  rank integer check (rank between 1 and 100),
  ranking_url text check (ranking_url is null or (length(ranking_url)<=2000 and ranking_url ~* '^https://[^[:space:]]+$')),
  result_title text check (result_title is null or length(result_title)<=500),
  detail text check (detail is null or length(detail)<=2000),
  source_note text not null check (length(trim(source_note)) between 1 and 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(keyword_id,client_id,set_id) references public.search_keywords(id,client_id,set_id),
  check (
    (outcome='present' and ((result_type='organic' and rank is not null and ranking_url is not null)
      or (result_type='advertisement' and ranking_url is not null)
      or (result_type='ai_summary' and rank is null)))
    or (outcome in ('not_found','error') and rank is null and ranking_url is null and length(trim(coalesce(detail,'')))>0)
  )
);
create index on public.search_keywords(client_id,set_id,ordinal);
create index on public.search_observations(client_id,set_id,wave_label,observed_at desc);
alter table public.search_sets enable row level security;
alter table public.search_keywords enable row level security;
alter table public.search_observations enable row level security;
revoke all on public.search_sets,public.search_keywords,public.search_observations from public,anon,authenticated;
grant select on public.search_sets,public.search_keywords,public.search_observations to authenticated;
grant insert on public.search_sets,public.search_keywords,public.search_observations to authenticated;
create policy search_set_read on public.search_sets for select to authenticated using ((select private.can_client(client_id,'read')));
create policy search_keyword_read on public.search_keywords for select to authenticated using ((select private.can_client(client_id,'read')));
create policy search_observation_read on public.search_observations for select to authenticated using ((select private.can_client(client_id,'read')));
create policy search_set_insert on public.search_sets for insert to authenticated
  with check ((select private.can_client(client_id,'edit')) and created_by=(select auth.uid()) and status='draft' and frozen_at is null);

create function private.can_add_search_keyword(p_client uuid,p_set uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_client(p_client,'edit') and exists(
    select 1 from public.search_sets where id=p_set and client_id=p_client and status='draft'
  );
$$;
create function private.can_add_search_observation(p_client uuid,p_set uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_client(p_client,'edit') and exists(
    select 1 from public.search_sets where id=p_set and client_id=p_client and status='frozen'
  );
$$;
revoke all on function private.can_add_search_keyword(uuid,uuid),private.can_add_search_observation(uuid,uuid) from public,anon;
grant execute on function private.can_add_search_keyword(uuid,uuid),private.can_add_search_observation(uuid,uuid) to authenticated;
create policy search_keyword_insert on public.search_keywords for insert to authenticated
  with check ((select private.can_add_search_keyword(client_id,set_id)) and created_by=(select auth.uid()));
create policy search_observation_insert on public.search_observations for insert to authenticated
  with check ((select private.can_add_search_observation(client_id,set_id)) and created_by=(select auth.uid()));

create function public.freeze_search_set(p_client_id uuid,p_set_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_status text; v_org uuid;
begin
  if auth.uid() is null or not private.can_client(p_client_id,'edit') then raise exception 'Search set access denied'; end if;
  select status into v_status from public.search_sets where id=p_set_id and client_id=p_client_id for update;
  if not found then raise exception 'Search set not found for client'; end if;
  if v_status='frozen' then return p_set_id; end if;
  if not exists(select 1 from public.search_keywords where set_id=p_set_id and client_id=p_client_id) then
    raise exception 'Add a keyword before freezing the set';
  end if;
  update public.search_sets set status='frozen',frozen_at=now() where id=p_set_id;
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'search_set_frozen',p_set_id);
  return p_set_id;
end;
$$;
revoke all on function public.freeze_search_set(uuid,uuid) from public,anon;
grant execute on function public.freeze_search_set(uuid,uuid) to authenticated;
