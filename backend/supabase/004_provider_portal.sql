-- InHayat Pro: shifokorlar / koordinatorlar portali.
-- Run AFTER schema.sql, 002_catalog_auth_admin.sql and 003_preparation_progress.sql.
-- Safe to re-run.
--
-- Access model:
--   * Staff (doctor / coordinator) self-register -> status 'pending'.
--   * Platform admin (app_metadata.role = 'admin') approves or rejects.
--   * A patient explicitly shares ONE case with ONE approved staff member.
--   * Staff see a case, its documents, checklist and patient profile only while
--     that share is active. Revoking the share removes access immediately.

-- ---------------------------------------------------------------------------
-- Staff profiles
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.staff_role as enum ('doctor', 'coordinator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.staff_status as enum ('pending', 'approved', 'rejected', 'suspended');
exception when duplicate_object then null; end $$;

create table if not exists public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 3 and 120),
  role public.staff_role not null default 'doctor',
  speciality text not null default '' check (char_length(speciality) <= 160),
  license_number text not null check (char_length(license_number) between 3 and 60),
  organization text not null check (char_length(organization) between 3 and 240),
  region text not null default '' check (char_length(region) <= 60),
  phone text not null default '' check (char_length(phone) <= 30),
  status public.staff_status not null default 'pending',
  review_note text not null default '' check (char_length(review_note) <= 500),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.staff_profiles enable row level security;

create or replace function public.is_approved_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_profiles s where s.id = auth.uid() and s.status = 'approved');
$$;

drop policy if exists "staff read own application" on public.staff_profiles;
create policy "staff read own application" on public.staff_profiles for select to authenticated
  using (id = auth.uid() or public.is_catalog_admin());

-- A user can create or edit their own application, but every self-edit goes
-- back to 'pending' so license/organization changes are re-verified.
drop policy if exists "staff submit own application" on public.staff_profiles;
create policy "staff submit own application" on public.staff_profiles for insert to authenticated
  with check (id = auth.uid() and status = 'pending' and reviewed_by is null);
drop policy if exists "staff edit own application" on public.staff_profiles;
create policy "staff edit own application" on public.staff_profiles for update to authenticated
  using (id = auth.uid() and not public.is_catalog_admin())
  with check (id = auth.uid() and status = 'pending');

drop policy if exists "admins review applications" on public.staff_profiles;
create policy "admins review applications" on public.staff_profiles for update to authenticated
  using (public.is_catalog_admin()) with check (public.is_catalog_admin());

grant select, insert, update on public.staff_profiles to authenticated;

-- Directory of approved staff that patients can choose from (no license / phone).
create or replace function public.is_approved_staff_id(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_profiles s where s.id = target and s.status = 'approved');
$$;

create or replace function public.approved_staff_directory()
returns table (id uuid, full_name text, role public.staff_role, speciality text, organization text, region text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.full_name, s.role, s.speciality, s.organization, s.region
  from public.staff_profiles s
  where s.status = 'approved' and auth.uid() is not null
  order by s.full_name;
$$;
revoke all on function public.approved_staff_directory() from public, anon;
grant execute on function public.approved_staff_directory() to authenticated;

-- ---------------------------------------------------------------------------
-- Case sharing (patient consent)
-- ---------------------------------------------------------------------------
create table if not exists public.case_shares (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (case_id, staff_id)
);
alter table public.case_shares enable row level security;

create or replace function public.staff_can_access_case(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.case_shares cs
    join public.staff_profiles s on s.id = cs.staff_id
    where cs.case_id = target and cs.staff_id = auth.uid() and cs.active and s.status = 'approved'
  );
$$;

create or replace function public.staff_can_access_patient(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.case_shares cs
    join public.staff_profiles s on s.id = cs.staff_id
    where cs.patient_id = target and cs.staff_id = auth.uid() and cs.active and s.status = 'approved'
  );
$$;

drop policy if exists "share parties read" on public.case_shares;
create policy "share parties read" on public.case_shares for select to authenticated
  using (patient_id = auth.uid() or (staff_id = auth.uid() and public.is_approved_staff()));

drop policy if exists "patients share own case" on public.case_shares;
create policy "patients share own case" on public.case_shares for insert to authenticated
  with check (
    patient_id = auth.uid()
    and exists (select 1 from public.cases c where c.id = case_id and c.patient_id = auth.uid())
    and public.is_approved_staff_id(staff_id)
  );
drop policy if exists "patients manage own shares" on public.case_shares;
create policy "patients manage own shares" on public.case_shares for update to authenticated
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid() and (active = false or public.is_approved_staff_id(staff_id)));

grant select, insert, update on public.case_shares to authenticated;

-- ---------------------------------------------------------------------------
-- Read access for staff on shared data
-- ---------------------------------------------------------------------------
drop policy if exists "staff read shared cases" on public.cases;
create policy "staff read shared cases" on public.cases for select to authenticated
  using (public.staff_can_access_case(id));

drop policy if exists "staff read shared documents" on public.medical_documents;
create policy "staff read shared documents" on public.medical_documents for select to authenticated
  using (public.staff_can_access_case(case_id));

drop policy if exists "staff read shared preparation" on public.preparation_progress;
create policy "staff read shared preparation" on public.preparation_progress for select to authenticated
  using (public.staff_can_access_case(case_id));

drop policy if exists "staff read shared patient profile" on public.profiles;
create policy "staff read shared patient profile" on public.profiles for select to authenticated
  using (public.staff_can_access_patient(id));

-- ---------------------------------------------------------------------------
-- Conversation / conclusions on a case
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.note_kind as enum ('message', 'document_request', 'conclusion', 'status');
exception when duplicate_object then null; end $$;

create table if not exists public.case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default '',
  author_is_staff boolean not null default false,
  kind public.note_kind not null default 'message',
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
alter table public.case_notes enable row level security;
create index if not exists case_notes_case_idx on public.case_notes(case_id, created_at);

drop policy if exists "case parties read notes" on public.case_notes;
create policy "case parties read notes" on public.case_notes for select to authenticated
  using (
    exists (select 1 from public.cases c where c.id = case_id and c.patient_id = auth.uid())
    or public.staff_can_access_case(case_id)
  );

drop policy if exists "case parties write notes" on public.case_notes;
create policy "case parties write notes" on public.case_notes for insert to authenticated
  with check (
    author_id = auth.uid() and (
      (kind = 'message' and author_is_staff = false
        and exists (select 1 from public.cases c where c.id = case_id and c.patient_id = auth.uid()))
      or (kind in ('message', 'document_request', 'conclusion') and author_is_staff = true
        and public.staff_can_access_case(case_id)
        and author_name = (select s.full_name from public.staff_profiles s where s.id = auth.uid()))
    )
  );
grant select, insert on public.case_notes to authenticated;

-- Staff change case status only through this function (they cannot edit other columns).
create or replace function public.set_case_status(target uuid, next_status public.case_status)
returns void language plpgsql security definer set search_path = '' as $$
declare staff_name text;
begin
  if not public.staff_can_access_case(target) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select full_name into staff_name from public.staff_profiles where id = auth.uid();
  update public.cases set status = next_status, updated_at = now() where id = target;
  insert into public.case_notes (case_id, author_id, author_name, author_is_staff, kind, body)
  values (target, auth.uid(), coalesce(staff_name, ''), true, 'status', next_status::text);
end;
$$;
revoke all on function public.set_case_status(uuid, public.case_status) from public, anon;
grant execute on function public.set_case_status(uuid, public.case_status) to authenticated;

-- ---------------------------------------------------------------------------
-- Who opened which document (shown to the patient)
-- ---------------------------------------------------------------------------
create table if not exists public.document_access_log (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.medical_documents(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewer_name text not null default '',
  viewed_at timestamptz not null default now()
);
alter table public.document_access_log enable row level security;

drop policy if exists "viewers log own access" on public.document_access_log;
create policy "viewers log own access" on public.document_access_log for insert to authenticated
  with check (
    viewer_id = auth.uid() and (
      exists (select 1 from public.cases c where c.id = case_id and c.patient_id = auth.uid())
      or public.staff_can_access_case(case_id)
    )
    and exists (select 1 from public.medical_documents d where d.id = document_id and d.case_id = case_id)
  );
drop policy if exists "patients see access log" on public.document_access_log;
create policy "patients see access log" on public.document_access_log for select to authenticated
  using (exists (select 1 from public.cases c where c.id = case_id and c.patient_id = auth.uid()));
grant select, insert on public.document_access_log to authenticated;

-- ---------------------------------------------------------------------------
-- Patients registered with phone + password have the phone only in metadata.
-- Copy it into the profile so the doctor can call the patient.
-- ---------------------------------------------------------------------------
create or replace function public.create_patient_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, nullif(left(new.raw_user_meta_data ->> 'full_name', 120), ''), coalesce(new.phone, left(new.raw_user_meta_data ->> 'phone', 20)))
  on conflict (id) do nothing;
  return new;
end;
$$;
update public.profiles p set phone = left(u.raw_user_meta_data ->> 'phone', 20)
from auth.users u where u.id = p.id and p.phone is null and u.raw_user_meta_data ? 'phone';
