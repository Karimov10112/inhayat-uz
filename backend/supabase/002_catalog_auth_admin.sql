-- Run AFTER schema.sql. Safe to re-run. No admin role is assigned automatically.
alter table public.centres add column if not exists speciality text not null default '';

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  region text not null,
  address text not null,
  phone text not null default '',
  source_url text not null check (source_url like 'https://%'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.clinics enable row level security;

-- app_metadata can be set only by trusted server/Admin API; user_metadata is NOT used.
create or replace function public.is_catalog_admin() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

drop policy if exists "public clinic directory" on public.clinics;
create policy "public clinic directory" on public.clinics for select using (active = true);
drop policy if exists "catalog admins manage clinics" on public.clinics;
create policy "catalog admins manage clinics" on public.clinics for all to authenticated using (public.is_catalog_admin()) with check (public.is_catalog_admin());
drop policy if exists "catalog admins manage centres" on public.centres;
create policy "catalog admins manage centres" on public.centres for all to authenticated using (public.is_catalog_admin()) with check (public.is_catalog_admin());
grant select on public.clinics, public.centres to anon, authenticated;
grant insert, update on public.clinics, public.centres to authenticated;

-- Google/email users also need a profile before creating a case.
create or replace function public.create_patient_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, left(new.raw_user_meta_data ->> 'full_name', 120), new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists create_patient_profile on auth.users;
create trigger create_patient_profile after insert on auth.users for each row execute procedure public.create_patient_profile();
insert into public.profiles (id, full_name, phone)
select id, left(raw_user_meta_data ->> 'full_name', 120), phone from auth.users on conflict (id) do nothing;

-- Bind document metadata to the patient's OWN case and private object prefix.
drop policy if exists "patients manage their document metadata" on public.medical_documents;
drop policy if exists "patients own document metadata" on public.medical_documents;
create policy "patients own document metadata" on public.medical_documents for all to authenticated
using (auth.uid() = patient_id)
with check (
  auth.uid() = patient_id and
  r2_object_key like ('patients/' || auth.uid()::text || '/%') and
  exists (select 1 from public.cases c where c.id = case_id and c.patient_id = auth.uid())
);

update public.centres set speciality = 'Buyrak transplantatsiyasi, nefrologiya va reabilitatsiya' where name like '%nefrologiya%';
update public.centres set speciality = 'Buyrak transplantatsiyasi va ixtisoslashgan jarrohlik' where name like '%Vohidov%';
insert into public.centres (name, speciality, pathways, address, phone, source_url)
values ('Respublika ixtisoslashtirilgan gematologiya va qon quyish ilmiy-amaliy tibbiyot markazi', 'Suyak ko‘migi transplantatsiyasi — o‘zak hujayralarini ko‘chirib o‘tkazish', array['stem_cell'], 'Toshkent, Chilonzor tumani, Arnasoy ko‘chasi 17', '+998955157571', 'https://www.hematology.uz/')
on conflict (name) do nothing;

insert into public.clinics (name, region, address, phone, source_url) values
('Samarqand viloyat ko‘p tarmoqli tibbiyot markazi', 'Samarqand', 'Samarqand shahri, Mirzo Ulug‘bek ko‘chasi 70', '+998782100081', 'https://gov.uz/oz/ssv/sections/view/3400'),
('Andijon viloyat ko‘p tarmoqli tibbiyot markazi', 'Andijon', 'Andijon shahri, Ogahiy ko‘chasi 3', '+998742373542', 'https://gov.uz/oz/ssv/sections/view/3400'),
('Buxoro viloyat ko‘p tarmoqli tibbiyot markazi', 'Buxoro', 'Buxoro shahri, M.Iqbol ko‘chasi 65', '+998652217933', 'https://gov.uz/oz/ssv/sections/view/3400'),
('Navoiy viloyat ko‘p tarmoqli tibbiyot markazi', 'Navoiy', 'Navoiy shahri, Janubiy ko‘chasi 3A', '+998792204137', 'https://gov.uz/oz/ssv/sections/view/3400'),
('Namangan viloyat ko‘p tarmoqli tibbiyot markazi', 'Namangan', 'Namangan shahri, N.Namangoniy ko‘chasi 9', '+998692230820', 'https://gov.uz/oz/ssv/sections/view/3400')
on conflict (name) do nothing;
