-- Feed metadata only. Application roles read it through case_notifications().
create table public.case_notification_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('message', 'document', 'status')),
  created_at timestamptz not null default now()
);
alter table public.case_notification_events enable row level security;
revoke all on public.case_notification_events from public, anon, authenticated;
create index case_notification_events_case_id_idx on public.case_notification_events(case_id, id);

create function public.enqueue_case_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- The polling cursor assumes that a smaller event ID is committed first.
  perform pg_catalog.pg_advisory_xact_lock(242305, 1);
  if tg_table_name = 'case_notes' then
    insert into public.case_notification_events(case_id, author_id, kind)
    values (new.case_id, new.author_id, case when new.kind = 'status' then 'status' else 'message' end);
  elsif exists (select 1 from public.cases c where c.id = new.case_id and c.patient_id = new.patient_id) then
    insert into public.case_notification_events(case_id, author_id, kind)
    values (new.case_id, new.patient_id, 'document');
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_case_notification() from public, anon, authenticated;

create trigger inhayat_note_notification after insert on public.case_notes
for each row execute function public.enqueue_case_notification();
create trigger inhayat_document_notification after insert on public.medical_documents
for each row execute function public.enqueue_case_notification();

create function public.case_notification_feed(after_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  newest bigint;
  batch jsonb;
begin
  if viewer is null then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Shared cases are rechecked on every poll, including staff approval.
  with visible_cases as (
    select c.id from public.cases c where c.patient_id = viewer
    union
    select s.case_id from public.case_shares s
    join public.staff_profiles p on p.id = s.staff_id and p.status = 'approved'
    where s.staff_id = viewer and s.active
  ),
  recent as materialized (
    select e.id, e.kind
    from visible_cases v join public.case_notification_events e on e.case_id = v.id
    where e.author_id <> viewer and e.created_at >= now() - interval '7 days'
    order by e.id desc limit 100
  )
  select coalesce(max(id), 0),
         coalesce(jsonb_agg(kind order by id) filter (where after_id is not null and id > after_id), '[]'::jsonb)
    into newest, batch from recent;
  return jsonb_build_object('cursor', greatest(newest, coalesce(after_id, 0))::text, 'kinds', batch);
end;
$$;
revoke all on function public.case_notification_feed(bigint) from public, anon;
grant execute on function public.case_notification_feed(bigint) to authenticated;
