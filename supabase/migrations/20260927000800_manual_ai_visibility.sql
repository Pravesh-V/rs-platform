create table public.ai_prompt_sets (
  id uuid primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  version integer not null check (version >= 1),
  language text not null check (length(trim(language)) between 2 and 40),
  region text not null check (length(trim(region)) between 2 and 80),
  planned_repeats integer not null check (planned_repeats between 1 and 10),
  status text not null default 'draft' check (status in ('draft','frozen')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  frozen_at timestamptz,
  unique (client_id,name,version),
  unique (id,client_id)
);

create table public.ai_prompts (
  id uuid primary key,
  client_id uuid not null,
  prompt_set_id uuid not null,
  ordinal integer not null check (ordinal between 1 and 100),
  buyer_stage text not null check (buyer_stage in ('discovery','comparison','alternatives','use_case','reputation')),
  branded boolean not null,
  question text not null check (length(trim(question)) between 1 and 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (prompt_set_id,client_id) references public.ai_prompt_sets(id,client_id) on delete cascade,
  unique (prompt_set_id,ordinal),
  unique (id,client_id,prompt_set_id)
);

create table public.ai_answer_runs (
  id uuid primary key,
  client_id uuid not null,
  prompt_set_id uuid not null,
  prompt_id uuid not null,
  wave_label text not null check (length(trim(wave_label)) between 1 and 80),
  provider text not null check (length(trim(provider)) between 1 and 80),
  model_label text not null check (length(trim(model_label)) between 1 and 120),
  collection_method text not null check (collection_method in ('manual_consumer','manual_api_export')),
  config_note text not null check (length(trim(config_note)) between 1 and 500),
  repeat_no integer not null check (repeat_no between 1 and 10),
  observed_at timestamptz not null,
  outcome text not null check (outcome in ('valid','refusal','error')),
  answer_text text check (answer_text is null or length(answer_text) <= 30000),
  error_note text check (error_note is null or length(error_note) <= 2000),
  source_note text not null check (length(trim(source_note)) between 1 and 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (prompt_id,client_id,prompt_set_id) references public.ai_prompts(id,client_id,prompt_set_id),
  unique (id,client_id),
  unique (prompt_set_id,wave_label,provider,model_label,collection_method,config_note,prompt_id,repeat_no),
  check ((outcome='valid' and length(trim(coalesce(answer_text,''))) > 0)
    or (outcome in ('refusal','error') and length(trim(coalesce(error_note,''))) > 0))
);

create table public.ai_citations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  client_id uuid not null,
  ordinal integer not null check (ordinal between 1 and 20),
  url text not null check (length(url) <= 2000 and url ~* '^https://[^[:space:]]+$'),
  foreign key (run_id,client_id) references public.ai_answer_runs(id,client_id) on delete cascade,
  unique (run_id,ordinal),
  unique (run_id,url)
);

create table public.ai_answer_reviews (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  client_id uuid not null,
  version integer not null check (version >= 1),
  mentions_client boolean not null,
  recommends_client boolean not null,
  review_note text not null check (length(trim(review_note)) between 1 and 2000),
  reviewer_id uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  foreign key (run_id,client_id) references public.ai_answer_runs(id,client_id) on delete cascade,
  unique (run_id,version),
  check (not recommends_client or mentions_client)
);

create index on public.ai_prompts(client_id,prompt_set_id,ordinal);
create index on public.ai_answer_runs(client_id,prompt_set_id,wave_label,created_at desc);
create index on public.ai_citations(run_id,ordinal);
create index on public.ai_answer_reviews(run_id,version desc);
alter table public.ai_prompt_sets enable row level security;
alter table public.ai_prompts enable row level security;
alter table public.ai_answer_runs enable row level security;
alter table public.ai_citations enable row level security;
alter table public.ai_answer_reviews enable row level security;
revoke all on public.ai_prompt_sets,public.ai_prompts,public.ai_answer_runs,public.ai_citations,public.ai_answer_reviews from public,anon,authenticated;
grant select on public.ai_prompt_sets,public.ai_prompts,public.ai_answer_runs,public.ai_citations,public.ai_answer_reviews to authenticated;
grant insert on public.ai_prompt_sets,public.ai_prompts to authenticated;
create policy ai_set_read on public.ai_prompt_sets for select to authenticated using ((select private.can_client(client_id,'read')));
create policy ai_prompt_read on public.ai_prompts for select to authenticated using ((select private.can_client(client_id,'read')));
create policy ai_run_read on public.ai_answer_runs for select to authenticated using ((select private.can_client(client_id,'read')));
create policy ai_citation_read on public.ai_citations for select to authenticated using ((select private.can_client(client_id,'read')));
create policy ai_review_read on public.ai_answer_reviews for select to authenticated using ((select private.can_client(client_id,'read')));
create policy ai_set_insert on public.ai_prompt_sets for insert to authenticated
  with check ((select private.can_client(client_id,'edit')) and created_by=(select auth.uid()) and status='draft' and frozen_at is null);

create function private.can_add_ai_prompt(p_client uuid,p_set uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_client(p_client,'edit') and exists(
    select 1 from public.ai_prompt_sets where id=p_set and client_id=p_client and status='draft'
  );
$$;
revoke all on function private.can_add_ai_prompt(uuid,uuid) from public,anon;
grant execute on function private.can_add_ai_prompt(uuid,uuid) to authenticated;
create policy ai_prompt_insert on public.ai_prompts for insert to authenticated
  with check ((select private.can_add_ai_prompt(client_id,prompt_set_id)) and created_by=(select auth.uid()));

create function public.freeze_ai_prompt_set(p_client_id uuid,p_set_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_status text; v_org uuid;
begin
  if auth.uid() is null or not private.can_client(p_client_id,'edit') then raise exception 'Prompt set access denied'; end if;
  select status into v_status from public.ai_prompt_sets where id=p_set_id and client_id=p_client_id for update;
  if not found then raise exception 'Prompt set not found for client'; end if;
  if v_status='frozen' then return p_set_id; end if;
  if not exists(select 1 from public.ai_prompts where prompt_set_id=p_set_id and client_id=p_client_id) then
    raise exception 'Add a prompt before freezing the set';
  end if;
  update public.ai_prompt_sets set status='frozen',frozen_at=now() where id=p_set_id;
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'ai_prompt_set_frozen',p_set_id);
  return p_set_id;
end;
$$;

create function public.record_manual_ai_answer(
  p_id uuid,p_client_id uuid,p_set_id uuid,p_prompt_id uuid,p_wave_label text,p_provider text,p_model_label text,
  p_collection_method text,p_config_note text,p_repeat_no integer,p_observed_at timestamptz,p_outcome text,
  p_answer_text text,p_error_note text,p_source_note text,p_citation_urls jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_set public.ai_prompt_sets%rowtype; v_existing public.ai_answer_runs%rowtype; v_url text; v_index integer := 0; v_org uuid;
begin
  if auth.uid() is null or not private.can_client(p_client_id,'edit') then raise exception 'Answer import access denied'; end if;
  select * into v_set from public.ai_prompt_sets where id=p_set_id and client_id=p_client_id;
  if not found or v_set.status<>'frozen' then raise exception 'Use a frozen prompt set'; end if;
  if not exists(select 1 from public.ai_prompts where id=p_prompt_id and prompt_set_id=p_set_id and client_id=p_client_id) then
    raise exception 'Prompt not found for set';
  end if;
  if length(trim(coalesce(p_wave_label,''))) not between 1 and 80
     or length(trim(coalesce(p_provider,''))) not between 1 and 80
     or length(trim(coalesce(p_model_label,''))) not between 1 and 120
     or p_collection_method not in ('manual_consumer','manual_api_export')
     or length(trim(coalesce(p_config_note,''))) not between 1 and 500
     or p_repeat_no is null or p_repeat_no < 1 or p_repeat_no > v_set.planned_repeats
     or p_observed_at is null or p_outcome not in ('valid','refusal','error')
     or length(coalesce(p_answer_text,'')) > 30000 or length(coalesce(p_error_note,'')) > 2000
     or length(trim(coalesce(p_source_note,''))) not between 1 and 2000
     or (p_outcome='valid' and length(trim(coalesce(p_answer_text,'')))=0)
     or (p_outcome<>'valid' and length(trim(coalesce(p_error_note,'')))=0)
     or jsonb_typeof(p_citation_urls) is distinct from 'array'
     or jsonb_array_length(p_citation_urls)>20 then raise exception 'Invalid manual answer'; end if;
  for v_url in select value from jsonb_array_elements_text(p_citation_urls) loop
    if length(v_url)>2000 or v_url !~* '^https://[^[:space:]]+$' then raise exception 'Invalid citation URL'; end if;
  end loop;
  insert into public.ai_answer_runs(id,client_id,prompt_set_id,prompt_id,wave_label,provider,model_label,collection_method,
    config_note,repeat_no,observed_at,outcome,answer_text,error_note,source_note,created_by)
  values(p_id,p_client_id,p_set_id,p_prompt_id,trim(p_wave_label),trim(p_provider),trim(p_model_label),p_collection_method,
    trim(p_config_note),p_repeat_no,p_observed_at,p_outcome,nullif(p_answer_text,''),nullif(p_error_note,''),trim(p_source_note),auth.uid())
  on conflict(id) do nothing;
  if not found then
    select * into v_existing from public.ai_answer_runs where id=p_id and client_id=p_client_id;
    if not found or v_existing.prompt_set_id<>p_set_id or v_existing.prompt_id<>p_prompt_id
       or v_existing.wave_label<>trim(p_wave_label) or v_existing.provider<>trim(p_provider)
       or v_existing.model_label<>trim(p_model_label) or v_existing.collection_method<>p_collection_method
       or v_existing.config_note<>trim(p_config_note) or v_existing.repeat_no<>p_repeat_no
       or v_existing.observed_at<>p_observed_at or v_existing.outcome<>p_outcome
       or v_existing.answer_text is distinct from nullif(p_answer_text,'')
       or v_existing.error_note is distinct from nullif(p_error_note,'')
       or v_existing.source_note<>trim(p_source_note) or v_existing.created_by<>auth.uid()
       or coalesce((select jsonb_agg(url order by ordinal) from public.ai_citations where run_id=p_id),'[]'::jsonb)<>p_citation_urls then
      raise exception 'Answer request conflicts with an existing record';
    end if;
    return p_id;
  end if;
  for v_url in select value from jsonb_array_elements_text(p_citation_urls) loop
    v_index := v_index+1;
    insert into public.ai_citations(run_id,client_id,ordinal,url) values(p_id,p_client_id,v_index,v_url);
  end loop;
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'manual_ai_answer_recorded',p_id);
  return p_id;
end;
$$;

create function public.review_ai_answer(
  p_client_id uuid,p_run_id uuid,p_expected_version integer,p_mentions boolean,p_recommends boolean,p_note text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_run public.ai_answer_runs%rowtype; v_review public.ai_answer_reviews%rowtype; v_version integer; v_org uuid;
begin
  if auth.uid() is null or not private.can_review_client(p_client_id) then raise exception 'Answer review access denied'; end if;
  if p_expected_version is null or p_expected_version<0 or p_mentions is null or p_recommends is null
     or (p_recommends and not p_mentions) or length(trim(coalesce(p_note,''))) not between 1 and 2000 then
    raise exception 'Invalid answer review';
  end if;
  select * into v_run from public.ai_answer_runs where id=p_run_id and client_id=p_client_id for update;
  if not found or v_run.outcome<>'valid' then raise exception 'Only a valid answer can be reviewed'; end if;
  select * into v_review from public.ai_answer_reviews where run_id=p_run_id order by version desc limit 1;
  v_version := coalesce(v_review.version,0);
  if v_version=p_expected_version+1 and v_review.mentions_client=p_mentions and v_review.recommends_client=p_recommends
     and v_review.review_note=trim(p_note) and v_review.reviewer_id=auth.uid() then return v_version; end if;
  if v_version<>p_expected_version then raise exception 'Answer review changed; refresh before editing'; end if;
  insert into public.ai_answer_reviews(run_id,client_id,version,mentions_client,recommends_client,review_note,reviewer_id)
    values(p_run_id,p_client_id,v_version+1,p_mentions,p_recommends,trim(p_note),auth.uid());
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'ai_answer_reviewed',p_run_id);
  return v_version+1;
end;
$$;

revoke all on function public.freeze_ai_prompt_set(uuid,uuid) from public,anon;
revoke all on function public.record_manual_ai_answer(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,timestamptz,text,text,text,text,jsonb) from public,anon;
revoke all on function public.review_ai_answer(uuid,uuid,integer,boolean,boolean,text) from public,anon;
grant execute on function public.freeze_ai_prompt_set(uuid,uuid) to authenticated;
grant execute on function public.record_manual_ai_answer(uuid,uuid,uuid,uuid,text,text,text,text,text,integer,timestamptz,text,text,text,text,jsonb) to authenticated;
grant execute on function public.review_ai_answer(uuid,uuid,integer,boolean,boolean,text) to authenticated;
