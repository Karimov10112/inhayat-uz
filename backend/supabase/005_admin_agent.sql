-- Admin dashboard + AI agent support. Run AFTER 004_provider_portal.sql. Safe to re-run.
--
-- Admins (app_metadata.role = 'admin') get METADATA ONLY: counts, statuses and
-- timestamps. They still cannot read documents or message text; those stay
-- visible only to the patient and the doctors the patient chose.

create or replace function public.admin_platform_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_catalog_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'patients', (select count(distinct patient_id) from public.cases),
    'cases', (select count(*) from public.cases),
    'cases_by_status', coalesce((select jsonb_object_agg(status, n) from (select status::text, count(*) n from public.cases group by status) s), '{}'::jsonb),
    'documents', (select count(*) from public.medical_documents),
    'staff_by_status', coalesce((select jsonb_object_agg(status, n) from (select status::text, count(*) n from public.staff_profiles group by status) s), '{}'::jsonb),
    'active_shares', (select count(*) from public.case_shares where active),
    'notes_last_7_days', (select count(*) from public.case_notes where created_at > now() - interval '7 days')
  );
end;
$$;

create or replace function public.admin_case_overview()
returns table (
  case_id uuid, patient_name text, region text, pathway text, status text, created_at timestamptz, updated_at timestamptz,
  documents bigint, active_shares bigint, last_patient_message_at timestamptz, last_staff_message_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_catalog_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select c.id, coalesce(nullif(p.full_name, ''), '—'), coalesce(c.preferred_region, ''), c.transplant_pathway, c.status::text, c.created_at, c.updated_at,
    (select count(*) from public.medical_documents d where d.case_id = c.id),
    (select count(*) from public.case_shares s where s.case_id = c.id and s.active),
    (select max(n.created_at) from public.case_notes n where n.case_id = c.id and not n.author_is_staff),
    (select max(n.created_at) from public.case_notes n where n.case_id = c.id and n.author_is_staff and n.kind <> 'status')
  from public.cases c left join public.profiles p on p.id = c.patient_id
  order by c.updated_at desc
  limit 1000;
end;
$$;

create table if not exists public.staff_review_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_id uuid references auth.users(id) on delete set null,
  staff_name text not null,
  status text not null
);
alter table public.staff_review_log enable row level security;
drop policy if exists "admins manage review log" on public.staff_review_log;
create policy "admins manage review log" on public.staff_review_log for all to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin() and admin_id = auth.uid());
grant select, insert on public.staff_review_log to authenticated;

create or replace function public.admin_recent_activity(max_rows int default 30)
returns table (at timestamptz, kind text, actor text, detail text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_catalog_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
  select * from (
    select c.created_at, 'case_created'::text, coalesce(nullif(p.full_name, ''), 'Bemor'), 'yangi yo‘l xaritasi'::text
      from public.cases c left join public.profiles p on p.id = c.patient_id
    union all
    select d.uploaded_at, 'document_uploaded', coalesce(nullif(p.full_name, ''), 'Bemor'), 'hujjat yukladi'
      from public.medical_documents d left join public.profiles p on p.id = d.patient_id
    union all
    select n.created_at, 'note_' || n.kind::text, coalesce(nullif(n.author_name, ''), 'Bemor'),
      case n.kind when 'message' then 'xabar' when 'document_request' then 'hujjat so‘rovi' when 'conclusion' then 'xulosa' else 'holat o‘zgarishi' end
      from public.case_notes n
    union all
    select a.viewed_at, 'document_viewed', a.viewer_name, 'hujjatni ochdi' from public.document_access_log a
    union all
    select s.created_at, 'staff_applied', s.full_name, 'xodim arizasi yubordi' from public.staff_profiles s
    union all
    select r.at, 'staff_reviewed', 'Administrator', r.staff_name || ': ' || r.status from public.staff_review_log r
  ) x(at, kind, actor, detail)
  order by 1 desc
  limit greatest(1, least(max_rows, 200));
end;
$$;

revoke all on function public.admin_platform_stats() from public, anon;
revoke all on function public.admin_case_overview() from public, anon;
revoke all on function public.admin_recent_activity(int) from public, anon;
grant execute on function public.admin_platform_stats() to authenticated;
grant execute on function public.admin_case_overview() to authenticated;
grant execute on function public.admin_recent_activity(int) to authenticated;

-- Every tool the AI agent runs is written here.
create table if not exists public.agent_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  tool text not null,
  input text not null default '',
  result text not null default '',
  approved boolean not null default false
);
alter table public.agent_audit enable row level security;
drop policy if exists "admins read agent audit" on public.agent_audit;
create policy "admins read agent audit" on public.agent_audit for select to authenticated using (public.is_catalog_admin());
drop policy if exists "admins write agent audit" on public.agent_audit;
create policy "admins write agent audit" on public.agent_audit for insert to authenticated
  with check (public.is_catalog_admin() and admin_id = auth.uid());
grant select, insert on public.agent_audit to authenticated;
