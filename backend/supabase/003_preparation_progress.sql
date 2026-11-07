-- Run after schema.sql and 002_catalog_auth_admin.sql.
create table if not exists public.preparation_progress (
  case_id uuid primary key references public.cases(id) on delete cascade,
  patient_id uuid not null references auth.users(id) on delete cascade,
  completed text[] not null default '{}',
  constraint valid_preparation_tasks check (completed <@ array['clinic','consultation','documents','centre','travel']::text[])
);
alter table public.preparation_progress enable row level security;
create policy "patients read preparation" on public.preparation_progress for select to authenticated using (patient_id = auth.uid());
create policy "patients create preparation" on public.preparation_progress for insert to authenticated with check (
  patient_id = auth.uid() and exists (select 1 from public.cases where id = case_id and patient_id = auth.uid())
);
create policy "patients update preparation" on public.preparation_progress for update to authenticated using (patient_id = auth.uid()) with check (
  patient_id = auth.uid() and exists (select 1 from public.cases where id = case_id and patient_id = auth.uid())
);
grant select, insert, update on public.preparation_progress to authenticated;
