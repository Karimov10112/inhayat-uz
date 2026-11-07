-- Run in Supabase SQL Editor. Never store source medical files in this database.
create extension if not exists "pgcrypto";

create type public.document_kind as enum ('lab_result', 'imaging', 'referral', 'identity', 'other');
create type public.case_status as enum ('draft', 'documents_pending', 'under_review', 'centre_contacted', 'closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  transplant_pathway text not null check (transplant_pathway in ('kidney', 'liver', 'heart', 'stem_cell', 'other')),
  status public.case_status not null default 'draft',
  preferred_region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.medical_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  kind public.document_kind not null,
  r2_object_key text not null unique,
  original_name text not null,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  bytes integer not null check (bytes > 0 and bytes <= 10485760),
  uploaded_at timestamptz not null default now()
);

create table public.centres (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  pathways text[] not null,
  address text not null,
  phone text,
  source_url text not null,
  verified_at timestamptz not null default now(),
  active boolean not null default true
);

alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.medical_documents enable row level security;
alter table public.centres enable row level security;

create policy "patients manage their profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "patients manage their cases" on public.cases for all using (auth.uid() = patient_id) with check (auth.uid() = patient_id);
create policy "patients manage their document metadata" on public.medical_documents for all using (auth.uid() = patient_id) with check (auth.uid() = patient_id);
create policy "public can view verified centres" on public.centres for select using (active = true);

-- Seeded from official government pages; verify again before production launch.
insert into public.centres (name, pathways, address, phone, source_url) values
('Respublika ixtisoslashtirilgan nefrologiya va buyrak transplantatsiyasi ilmiy-amaliy tibbiyot markazi', array['kidney'], 'Toshkent shahri, Yunusobod tumani, Yangi shahar ko''chasi 9-uy', '+998712249659', 'https://gov.uz/oz/advice/63/document/2185'),
('V.Vohidov nomidagi Respublika ixtisoslashtirilgan xirurgiya ilmiy-amaliy tibbiyot markazi', array['kidney','liver','heart'], 'Toshkent shahri, Kichik halqa yo''li 10', '+998712304909', 'https://gov.uz/oz/ssv/sections/view/3396'),
('Bolalar milliy tibbiyot markazi (BMTM)', array['kidney','liver','heart','stem_cell'], 'Toshkent shahri, Yashnobod tumani, Parkent ko''chasi 294', '+998953410003', 'https://bmtm.uz/uz/'),
('Respublika shoshilinch tibbiy yordam ilmiy markazi (RSTYIM)', array['kidney','liver','other'], 'Toshkent shahri, Chilonzor tumani, Kichik halqa yo''li ko''chasi 2', '+998711504600', 'https://www.emerge-centre.uz/')
on conflict (name) do update set pathways = excluded.pathways, address = excluded.address, phone = excluded.phone, source_url = excluded.source_url, verified_at = now();
