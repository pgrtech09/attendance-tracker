-- ==========================================================================
-- Smart College Attendance Tracker — Supabase schema
-- Run this once in Supabase SQL Editor (Project > SQL Editor > New query).
-- Safe to re-run: every statement is guarded with IF NOT EXISTS / DROP ... IF EXISTS.
-- ==========================================================================

create extension if not exists "uuid-ossp";

-- --------------------------------------------------------------------------
-- profiles: one row per student, keyed to auth.users
-- --------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  roll_number text not null unique,
  dob date not null,
  branch text not null check (branch in ('CSE', 'CSE(AIML)', 'CSE(AIDS)')),
  section text not null check (section in ('II-MA', 'II-MB', 'II-MC')),
  year text not null default '2nd Year',
  semester smallint not null default 3 check (semester between 1 and 8),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profiles_roll_number on public.profiles (roll_number);

-- --------------------------------------------------------------------------
-- subjects: shared master list of subjects (global, read-only to students)
-- --------------------------------------------------------------------------
create table if not exists public.subjects (
  id uuid primary key default uuid_generate_v4(),
  code text not null unique,
  name text not null,
  type text not null default 'theory' check (type in ('theory', 'lab')),
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- timetable: per-student weekly schedule (editable, seeded from a default
-- on registration by the client app)
-- --------------------------------------------------------------------------
create table if not exists public.timetable (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  period_order smallint not null,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  start_time time not null,
  end_time time not null,
  duration_periods smallint not null default 1,
  faculty text,
  room text,
  created_at timestamptz not null default now()
);
create index if not exists idx_timetable_user_weekday on public.timetable (user_id, weekday);

-- --------------------------------------------------------------------------
-- attendance: one row per student + subject + calendar date
-- --------------------------------------------------------------------------
create table if not exists public.attendance (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  date date not null,
  status text not null check (status in
    ('present', 'absent', 'holiday', 'exam', 'non_working', 'medical_leave', 'od')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, subject_id, date)
);
create index if not exists idx_attendance_user_date on public.attendance (user_id, date);
create index if not exists idx_attendance_user_subject on public.attendance (user_id, subject_id);

-- --------------------------------------------------------------------------
-- semester_settings: one row per student
-- --------------------------------------------------------------------------
create table if not exists public.semester_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  start_date date,
  end_date date,
  target_percentage smallint not null default 75 check (target_percentage between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- holidays: college holidays / exam dates, per student (so each student can
-- tailor around their own section's schedule)
-- --------------------------------------------------------------------------
create table if not exists public.holidays (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  type text not null default 'holiday' check (type in ('holiday', 'mid_exam', 'external_exam', 'non_working')),
  name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_holidays_user_date on public.holidays (user_id, date);

-- --------------------------------------------------------------------------
-- notifications: reminder preferences / log
-- --------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('morning', 'evening', 'custom')),
  scheduled_time time not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications (user_id);

-- --------------------------------------------------------------------------
-- user_settings: theme + notification toggle, one row per student
-- --------------------------------------------------------------------------
create table if not exists public.user_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  theme text not null default 'light' check (theme in ('light', 'dark')),
  notifications_enabled boolean not null default true,
  morning_reminder_time time not null default '08:30',
  evening_reminder_time time not null default '18:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ==========================================================================
-- Row Level Security
-- ==========================================================================
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.timetable enable row level security;
alter table public.attendance enable row level security;
alter table public.semester_settings enable row level security;
alter table public.holidays enable row level security;
alter table public.notifications enable row level security;
alter table public.user_settings enable row level security;

-- profiles: a student can read/update only their own row
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- subjects: readable by any authenticated user; insertable once (seed) by
-- any authenticated user so the client can lazily create the master list
drop policy if exists "subjects_select_all" on public.subjects;
create policy "subjects_select_all" on public.subjects for select using (auth.role() = 'authenticated');
drop policy if exists "subjects_insert_auth" on public.subjects;
create policy "subjects_insert_auth" on public.subjects for insert with check (auth.role() = 'authenticated');

-- timetable: fully scoped to owner
drop policy if exists "timetable_all_own" on public.timetable;
create policy "timetable_all_own" on public.timetable for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- attendance: fully scoped to owner
drop policy if exists "attendance_all_own" on public.attendance;
create policy "attendance_all_own" on public.attendance for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- semester_settings: fully scoped to owner
drop policy if exists "semester_settings_all_own" on public.semester_settings;
create policy "semester_settings_all_own" on public.semester_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- holidays: fully scoped to owner
drop policy if exists "holidays_all_own" on public.holidays;
create policy "holidays_all_own" on public.holidays for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- notifications: fully scoped to owner
drop policy if exists "notifications_all_own" on public.notifications;
create policy "notifications_all_own" on public.notifications for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- user_settings: fully scoped to owner
drop policy if exists "user_settings_all_own" on public.user_settings;
create policy "user_settings_all_own" on public.user_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==========================================================================
-- updated_at auto-touch trigger
-- ==========================================================================
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_attendance_touch on public.attendance;
create trigger trg_attendance_touch before update on public.attendance
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_semester_settings_touch on public.semester_settings;
create trigger trg_semester_settings_touch before update on public.semester_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_user_settings_touch on public.user_settings;
create trigger trg_user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ==========================================================================
-- Storage bucket for profile pictures (run once)
-- ==========================================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar_public_read" on storage.objects;
create policy "avatar_public_read" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatar_owner_write" on storage.objects;
create policy "avatar_owner_write" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

drop policy if exists "avatar_owner_update" on storage.objects;
create policy "avatar_owner_update" on storage.objects for update
  using (bucket_id = 'avatars' and auth.role() = 'authenticated');

-- ==========================================================================
-- Seed the subject master list (safe to run once — ON CONFLICT no-ops)
-- ==========================================================================
-- Safe migration: adds faculty/room columns if this script is re-run against
-- a database created before they existed.
alter table public.timetable add column if not exists faculty text;
alter table public.timetable add column if not exists room text;

insert into public.subjects (code, name, type) values
  ('COA', 'Computer Organization & Architecture', 'theory'),
  ('SE', 'Software Engineering', 'theory'),
  ('DBMS', 'Database Management Systems', 'theory'),
  ('OOPJ', 'Object Oriented Programming (Java)', 'theory'),
  ('MSF', 'Mathematical & Statistical Foundations', 'theory'),
  ('CM LAB', 'Computational Mathematics Lab', 'lab'),
  ('DBMS LAB', 'DBMS Laboratory', 'lab'),
  ('SE LAB', 'Software Engineering Laboratory', 'lab'),
  ('OOPJ LAB', 'OOPJ Laboratory', 'lab'),
  ('NJ/RJ LAB', 'NJ/RJ Laboratory', 'lab')
on conflict (code) do nothing;
