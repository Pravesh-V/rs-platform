create table public.sentiment_reviews (
  item_id uuid primary key,
  client_id uuid not null,
  version integer not null check (version >= 1),
  label text not null check (label in ('positive','negative','neutral','mixed','unclassified')),
  theme text check (theme is null or length(trim(theme)) between 1 and 160),
  review_note text not null check (length(trim(review_note)) between 1 and 2000),
  reviewer_id uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  foreign key (item_id,client_id) references public.reddit_items(id,client_id) on delete cascade
);

create table public.sentiment_review_versions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  client_id uuid not null,
  version integer not null check (version >= 1),
  label text not null check (label in ('positive','negative','neutral','mixed','unclassified')),
  theme text check (theme is null or length(trim(theme)) between 1 and 160),
  review_note text not null check (length(trim(review_note)) between 1 and 2000),
  reviewer_id uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  foreign key (item_id,client_id) references public.reddit_items(id,client_id) on delete cascade,
  unique (item_id,version)
);

create index on public.sentiment_reviews(client_id,label);
create index on public.sentiment_review_versions(item_id,version desc);
alter table public.sentiment_reviews enable row level security;
alter table public.sentiment_review_versions enable row level security;
revoke all on public.sentiment_reviews,public.sentiment_review_versions from public,anon,authenticated;
grant select on public.sentiment_reviews,public.sentiment_review_versions to authenticated;
create policy sentiment_read on public.sentiment_reviews for select to authenticated
  using ((select private.can_client(client_id,'read')));
create policy sentiment_version_read on public.sentiment_review_versions for select to authenticated
  using ((select private.can_client(client_id,'read')));

create function public.review_reddit_sentiment(
  p_client_id uuid,p_item_id uuid,p_expected_version integer,p_label text,p_theme text,p_review_note text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_review public.sentiment_reviews%rowtype; v_version integer; v_theme text := nullif(trim(p_theme),''); v_org uuid;
begin
  if auth.uid() is null or not (private.can_client(p_client_id,'edit') or private.can_review_client(p_client_id)) then
    raise exception 'Sentiment review access denied';
  end if;
  if p_expected_version is null or p_expected_version < 0
     or p_label not in ('positive','negative','neutral','mixed','unclassified')
     or length(coalesce(p_theme,'')) > 160
     or length(trim(coalesce(p_review_note,''))) not between 1 and 2000 then
    raise exception 'Invalid sentiment review';
  end if;
  perform 1 from public.reddit_items where id=p_item_id and client_id=p_client_id for update;
  if not found then raise exception 'Reddit item not found for client'; end if;
  select * into v_review from public.sentiment_reviews where item_id=p_item_id;
  v_version := coalesce(v_review.version,0);
  if v_version=p_expected_version+1 and v_review.label=p_label and v_review.theme is not distinct from v_theme
     and v_review.review_note=trim(p_review_note) and v_review.reviewer_id=auth.uid() then
    return v_version;
  end if;
  if v_version<>p_expected_version then raise exception 'Sentiment version changed; refresh before reviewing'; end if;
  insert into public.sentiment_reviews(item_id,client_id,version,label,theme,review_note,reviewer_id)
    values(p_item_id,p_client_id,v_version+1,p_label,v_theme,trim(p_review_note),auth.uid())
    on conflict(item_id) do update set version=excluded.version,label=excluded.label,theme=excluded.theme,
      review_note=excluded.review_note,reviewer_id=excluded.reviewer_id,reviewed_at=now();
  insert into public.sentiment_review_versions(item_id,client_id,version,label,theme,review_note,reviewer_id)
    values(p_item_id,p_client_id,v_version+1,p_label,v_theme,trim(p_review_note),auth.uid());
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'sentiment_reviewed',p_item_id);
  return v_version+1;
end;
$$;
revoke all on function public.review_reddit_sentiment(uuid,uuid,integer,text,text,text) from public,anon;
grant execute on function public.review_reddit_sentiment(uuid,uuid,integer,text,text,text) to authenticated;
