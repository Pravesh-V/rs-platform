create table public.content_calendar_entries (
  id uuid primary key,
  organization_id uuid not null,
  client_id uuid not null,
  draft_id uuid not null,
  draft_version integer not null check (draft_version>=1),
  planned_at timestamptz not null,
  subreddit text not null check (subreddit ~ '^[A-Za-z0-9_]{2,40}$'),
  purpose text not null check (length(trim(purpose)) between 1 and 1000),
  status text not null default 'planned' check (status in ('planned','cancelled')),
  cancellation_reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  cancelled_by uuid references auth.users(id),
  cancelled_at timestamptz,
  foreign key (client_id,organization_id) references public.clients(id,organization_id) on delete cascade,
  foreign key (draft_id,client_id) references public.content_drafts(id,client_id) on delete cascade,
  foreign key (draft_id,draft_version) references public.content_draft_versions(draft_id,version),
  check ((status='planned' and cancellation_reason is null and cancelled_at is null and cancelled_by is null)
    or (status='cancelled' and cancellation_reason is not null and cancelled_at is not null)),
  unique (id,client_id)
);
create unique index one_active_calendar_entry_per_draft on public.content_calendar_entries(draft_id) where status='planned';
create index on public.content_calendar_entries(client_id,planned_at desc);
alter table public.content_calendar_entries enable row level security;
revoke all on public.content_calendar_entries from public,anon,authenticated;
grant select on public.content_calendar_entries to authenticated;
create policy content_calendar_read on public.content_calendar_entries for select to authenticated
  using ((select private.can_client(client_id,'read')));

create function public.schedule_content_draft(
  p_id uuid,p_client_id uuid,p_draft_id uuid,p_version integer,
  p_planned_at timestamptz,p_subreddit text,p_purpose text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_draft public.content_drafts%rowtype; v_existing public.content_calendar_entries%rowtype; v_org uuid;
begin
  if auth.uid() is null or not private.can_client(p_client_id,'report') then raise exception 'Calendar access denied'; end if;
  if p_id is null or p_version is null or p_version<1 or p_planned_at is null or p_planned_at<=now()
    or p_subreddit !~ '^[A-Za-z0-9_]{2,40}$'
    or length(trim(coalesce(p_purpose,''))) not between 1 and 1000 then raise exception 'Invalid calendar details'; end if;
  select * into v_existing from public.content_calendar_entries where id=p_id;
  if found then
    if v_existing.client_id=p_client_id and v_existing.draft_id=p_draft_id
      and v_existing.draft_version=p_version and v_existing.planned_at=p_planned_at
      and v_existing.subreddit=p_subreddit and v_existing.purpose=trim(p_purpose)
      and v_existing.created_by=auth.uid() then return p_id; end if;
    raise exception 'Calendar request conflicts with an existing entry';
  end if;
  select * into v_draft from public.content_drafts where id=p_draft_id and client_id=p_client_id for update;
  if not found or v_draft.status<>'approved' or v_draft.current_version<>p_version then
    raise exception 'Only the current approved draft version can be scheduled';
  end if;
  if exists(select 1 from public.content_calendar_entries where draft_id=p_draft_id and status='planned') then
    raise exception 'This draft already has a planned entry';
  end if;
  select organization_id into v_org from public.clients where id=p_client_id;
  insert into public.content_calendar_entries(id,organization_id,client_id,draft_id,draft_version,planned_at,subreddit,purpose,created_by)
    values(p_id,v_org,p_client_id,p_draft_id,p_version,p_planned_at,p_subreddit,trim(p_purpose),auth.uid());
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_org,p_client_id,auth.uid(),'content_calendar_planned',p_id);
  return p_id;
end;
$$;

create function public.cancel_content_plan(p_client_id uuid,p_entry_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_entry public.content_calendar_entries%rowtype;
begin
  if auth.uid() is null or not private.can_client(p_client_id,'report') then raise exception 'Calendar access denied'; end if;
  if length(trim(coalesce(p_reason,''))) not between 1 and 1000 then raise exception 'Cancellation reason required'; end if;
  select * into v_entry from public.content_calendar_entries where id=p_entry_id and client_id=p_client_id for update;
  if not found then raise exception 'Calendar entry not found for client'; end if;
  if v_entry.status='cancelled' then
    if v_entry.cancelled_by=auth.uid() and v_entry.cancellation_reason=trim(p_reason) then return p_entry_id; end if;
    raise exception 'Calendar entry is already cancelled';
  end if;
  update public.content_calendar_entries set status='cancelled',cancellation_reason=trim(p_reason),
    cancelled_by=auth.uid(),cancelled_at=now() where id=p_entry_id;
  insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
    values(v_entry.organization_id,p_client_id,auth.uid(),'content_calendar_cancelled',p_entry_id);
  return p_entry_id;
end;
$$;

create function private.cancel_content_plan_on_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status='approved' and (new.status<>'approved' or new.current_version<>old.current_version) then
    with cancelled as (
      update public.content_calendar_entries set status='cancelled',
        cancellation_reason='Approved draft version was revised',cancelled_by=auth.uid(),cancelled_at=now()
        where draft_id=new.id and status='planned'
        returning id,organization_id,client_id
    )
    insert into public.audit_events(organization_id,client_id,actor_id,event_type,record_id)
      select organization_id,client_id,auth.uid(),'content_calendar_cancelled_on_revision',id
      from cancelled;
  end if;
  return new;
end;
$$;
create trigger cancel_calendar_on_draft_revision after update of current_version,status on public.content_drafts
  for each row execute function private.cancel_content_plan_on_revision();
revoke all on function public.schedule_content_draft(uuid,uuid,uuid,integer,timestamp with time zone,text,text) from public,anon;
revoke all on function public.cancel_content_plan(uuid,uuid,text) from public,anon;
revoke all on function private.cancel_content_plan_on_revision() from public,anon;
grant execute on function public.schedule_content_draft(uuid,uuid,uuid,integer,timestamp with time zone,text,text) to authenticated;
grant execute on function public.cancel_content_plan(uuid,uuid,text) to authenticated;
