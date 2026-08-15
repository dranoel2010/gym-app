-- =============================================================================
-- Gym Tracker v2 — vollstaendiges Schema
-- =============================================================================
-- Diese Datei ist die EINZIGE Schemaquelle (Spec §2). Sie ist idempotent:
-- mehrfaches Ausfuehren ist unschaedlich. Es gibt bewusst keine nummerierten
-- Einzelmigrationen — genau die hatten in v1 zu zwei auseinanderlaufenden
-- Schemastaenden gefuehrt.
--
-- Ausfuehren: Supabase Dashboard -> SQL Editor -> Inhalt einfuegen -> Run.
--
-- Grundsatz: JEDE Policy hat sowohl `using` als auch `with check`, explizit
-- ausgeschrieben. Wertebereiche gehoeren in die Datenbank, nicht nur ins
-- Formular.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabellen
-- -----------------------------------------------------------------------------

-- 1.1 plans -------------------------------------------------------------------
create table if not exists public.plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

-- 1.2 plan_exercises ----------------------------------------------------------
create table if not exists public.plan_exercises (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.plans(id) on delete cascade,
  exercise_name text not null,
  target_sets   integer not null default 3,
  target_reps   integer not null default 10,
  target_weight numeric(6,2) not null default 0,
  order_index   integer not null default 0
);

-- 1.3 workouts ----------------------------------------------------------------
-- plan_id ist bewusst nullable und wird beim Loeschen eines Plans auf NULL
-- gesetzt: Die Trainingshistorie ueberlebt das Loeschen des Plans und heisst
-- dann "Freies Training".
create table if not exists public.workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  plan_id     uuid references public.plans(id) on delete set null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

-- 1.4 workout_sets ------------------------------------------------------------
-- exercise_name bleibt bewusst Freitext (Spec §2.4). Gegenmassnahme gegen
-- Schreibvarianten: Autovervollstaendigung aus der Historie (Spec §3.9).
create table if not exists public.workout_sets (
  id            uuid primary key default gen_random_uuid(),
  workout_id    uuid not null references public.workouts(id) on delete cascade,
  exercise_name text not null,
  set_number    integer not null,
  reps          integer not null,
  weight        numeric(6,2) not null default 0,
  rir           integer,
  note          text,
  logged_at     timestamptz not null default now()
);

-- 1.5 weekly_checkins ---------------------------------------------------------
create table if not exists public.weekly_checkins (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null default current_date,
  bodyweight   numeric(6,2),
  sleep_hours  numeric(4,1),
  week_rating  integer,
  created_at   timestamptz not null default now()
);

-- 1.6 measurements ------------------------------------------------------------
create table if not exists public.measurements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  measured_at date not null default current_date,
  upper_arm   numeric(5,1),
  chest       numeric(5,1),
  thigh       numeric(5,1),
  waist       numeric(5,1),
  created_at  timestamptz not null default now()
);

-- 1.7 progress_photos ---------------------------------------------------------
create table if not exists public.progress_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  photo_date   date not null default current_date,
  pose         text not null,
  storage_path text not null,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. Constraints
-- -----------------------------------------------------------------------------
-- Als DO-Block, damit die Datei idempotent bleibt (ADD CONSTRAINT IF NOT EXISTS
-- gibt es in Postgres nicht).

do $$
begin
  -- plan_exercises
  if not exists (select 1 from pg_constraint where conname = 'plan_exercises_target_sets_check') then
    alter table public.plan_exercises add constraint plan_exercises_target_sets_check   check (target_sets > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plan_exercises_target_reps_check') then
    alter table public.plan_exercises add constraint plan_exercises_target_reps_check   check (target_reps > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plan_exercises_target_weight_check') then
    alter table public.plan_exercises add constraint plan_exercises_target_weight_check check (target_weight >= 0);
  end if;

  -- workout_sets
  if not exists (select 1 from pg_constraint where conname = 'workout_sets_set_number_check') then
    alter table public.workout_sets add constraint workout_sets_set_number_check check (set_number > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workout_sets_reps_check') then
    alter table public.workout_sets add constraint workout_sets_reps_check       check (reps > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workout_sets_weight_check') then
    alter table public.workout_sets add constraint workout_sets_weight_check     check (weight >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workout_sets_rir_check') then
    alter table public.workout_sets add constraint workout_sets_rir_check        check (rir is null or (rir between 0 and 10));
  end if;

  -- weekly_checkins
  if not exists (select 1 from pg_constraint where conname = 'weekly_checkins_bodyweight_check') then
    alter table public.weekly_checkins add constraint weekly_checkins_bodyweight_check  check (bodyweight  is null or (bodyweight  between 20 and 400));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'weekly_checkins_sleep_hours_check') then
    alter table public.weekly_checkins add constraint weekly_checkins_sleep_hours_check check (sleep_hours is null or (sleep_hours between 0 and 24));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'weekly_checkins_week_rating_check') then
    alter table public.weekly_checkins add constraint weekly_checkins_week_rating_check check (week_rating is null or (week_rating between 1 and 5));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'weekly_checkins_user_date_key') then
    alter table public.weekly_checkins add constraint weekly_checkins_user_date_key unique (user_id, checkin_date);
  end if;

  -- measurements
  if not exists (select 1 from pg_constraint where conname = 'measurements_upper_arm_check') then
    alter table public.measurements add constraint measurements_upper_arm_check check (upper_arm is null or (upper_arm between 10 and 300));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'measurements_chest_check') then
    alter table public.measurements add constraint measurements_chest_check     check (chest     is null or (chest     between 10 and 300));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'measurements_thigh_check') then
    alter table public.measurements add constraint measurements_thigh_check     check (thigh     is null or (thigh     between 10 and 300));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'measurements_waist_check') then
    alter table public.measurements add constraint measurements_waist_check     check (waist     is null or (waist     between 10 and 300));
  end if;
  -- Neu gegenueber v1: ein Eintrag pro Tag, Speichern per Upsert.
  if not exists (select 1 from pg_constraint where conname = 'measurements_user_date_key') then
    alter table public.measurements add constraint measurements_user_date_key unique (user_id, measured_at);
  end if;

  -- progress_photos
  if not exists (select 1 from pg_constraint where conname = 'progress_photos_pose_check') then
    alter table public.progress_photos add constraint progress_photos_pose_check check (pose in ('front','side','back'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Indizes
-- -----------------------------------------------------------------------------
create index if not exists workouts_user_finished_idx
  on public.workouts (user_id, finished_at desc);

create index if not exists workout_sets_workout_exercise_idx
  on public.workout_sets (workout_id, exercise_name);

-- Hilfsindizes fuer die haeufigen Listenabfragen
create index if not exists plans_user_created_idx        on public.plans (user_id, created_at desc);
create index if not exists plan_exercises_plan_order_idx on public.plan_exercises (plan_id, order_index);
create index if not exists weekly_checkins_user_date_idx on public.weekly_checkins (user_id, checkin_date desc);
create index if not exists measurements_user_date_idx    on public.measurements (user_id, measured_at desc);
create index if not exists progress_photos_user_date_idx on public.progress_photos (user_id, photo_date desc);

-- Ergaenzung zu Spec §4.5 AK-1 ("Zweimal Training starten erzeugt genau ein
-- Workout"): Die Datenbank garantiert hoechstens ein offenes Workout je Plan.
-- Damit kann auch ein Doppelklick oder ein zweites Geraet keine Dublette
-- erzeugen. start_workout() unten faengt den Konflikt ab.
create unique index if not exists workouts_one_open_per_plan_idx
  on public.workouts (user_id, plan_id)
  where finished_at is null;

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.plans           enable row level security;
alter table public.plan_exercises  enable row level security;
alter table public.workouts        enable row level security;
alter table public.workout_sets    enable row level security;
alter table public.weekly_checkins enable row level security;
alter table public.measurements    enable row level security;
alter table public.progress_photos enable row level security;

-- Alte Policies entfernen, damit ein erneuter Lauf sauber neu setzt.
drop policy if exists plans_owner           on public.plans;
drop policy if exists plan_exercises_owner  on public.plan_exercises;
drop policy if exists workouts_owner        on public.workouts;
drop policy if exists workout_sets_owner    on public.workout_sets;
drop policy if exists weekly_checkins_owner on public.weekly_checkins;
drop policy if exists measurements_owner    on public.measurements;
drop policy if exists progress_photos_owner on public.progress_photos;

create policy plans_owner on public.plans
  for all to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy plan_exercises_owner on public.plan_exercises
  for all to authenticated
  using (
    exists (select 1 from public.plans where plans.id = plan_exercises.plan_id and plans.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.plans where plans.id = plan_exercises.plan_id and plans.user_id = auth.uid())
  );

create policy workouts_owner on public.workouts
  for all to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy workout_sets_owner on public.workout_sets
  for all to authenticated
  using (
    exists (select 1 from public.workouts where workouts.id = workout_sets.workout_id and workouts.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.workouts where workouts.id = workout_sets.workout_id and workouts.user_id = auth.uid())
  );

create policy weekly_checkins_owner on public.weekly_checkins
  for all to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy measurements_owner on public.measurements
  for all to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy progress_photos_owner on public.progress_photos
  for all to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 5. Funktionen
-- -----------------------------------------------------------------------------

-- 5.1 save_plan — transaktionales Speichern (Spec §4.7) ------------------------
-- Entweder alles wird gespeichert oder nichts. In v1 wurden erst alle Uebungen
-- geloescht und dann neu eingefuegt; schlug das Einfuegen fehl, waren sie weg.
create or replace function public.save_plan(
  p_plan_id   uuid,    -- null = neuer Plan
  p_name      text,
  p_exercises jsonb    -- [{exercise_name, target_sets, target_reps, target_weight}]
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Plan-Name ist erforderlich';
  end if;

  if p_plan_id is null then
    insert into public.plans (user_id, name)
    values (auth.uid(), btrim(p_name))
    returning id into v_id;
  else
    update public.plans
       set name = btrim(p_name)
     where id = p_plan_id and user_id = auth.uid()
    returning id into v_id;

    if v_id is null then
      raise exception 'Plan nicht gefunden';
    end if;

    delete from public.plan_exercises where plan_id = v_id;
  end if;

  insert into public.plan_exercises
    (plan_id, exercise_name, target_sets, target_reps, target_weight, order_index)
  select v_id,
         btrim(e->>'exercise_name'),
         coalesce((e->>'target_sets')::int, 3),
         coalesce((e->>'target_reps')::int, 10),
         coalesce((e->>'target_weight')::numeric, 0),
         (ord - 1)::int
    from jsonb_array_elements(p_exercises) with ordinality as t(e, ord)
   where btrim(coalesce(e->>'exercise_name', '')) <> '';

  return v_id;
end $$;

-- 5.2 start_workout — genau ein offenes Workout je Plan (Spec §4.5 AK-1) ------
create or replace function public.start_workout(p_plan_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Gehoert der Plan ueberhaupt dem aufrufenden Nutzer?
  if not exists (select 1 from public.plans where id = p_plan_id and user_id = auth.uid()) then
    raise exception 'Plan nicht gefunden';
  end if;

  select id into v_id
    from public.workouts
   where user_id = auth.uid() and plan_id = p_plan_id and finished_at is null
   limit 1;

  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.workouts (user_id, plan_id)
    values (auth.uid(), p_plan_id)
    returning id into v_id;
  exception when unique_violation then
    -- Parallelfall: ein zweiter Aufruf war schneller. Dessen Workout nehmen.
    select id into v_id
      from public.workouts
     where user_id = auth.uid() and plan_id = p_plan_id and finished_at is null
     limit 1;
  end;

  return v_id;
end $$;

-- 5.3 delete_set — loeschen und Folgesaetze neu nummerieren (Spec §4.9 AK-3) --
create or replace function public.delete_set(p_set_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_workout_id uuid;
  v_exercise   text;
begin
  select workout_id, exercise_name into v_workout_id, v_exercise
    from public.workout_sets
   where id = p_set_id;

  if v_workout_id is null then
    return;  -- schon weg — kein Fehler
  end if;

  delete from public.workout_sets where id = p_set_id;

  -- Luecke schliessen: 1, 2, 3, ... in der Reihenfolge des Loggens.
  with renumbered as (
    select id, row_number() over (order by set_number, logged_at) as rn
      from public.workout_sets
     where workout_id = v_workout_id and exercise_name = v_exercise
  )
  update public.workout_sets s
     set set_number = r.rn
    from renumbered r
   where s.id = r.id and s.set_number <> r.rn;
end $$;

-- 5.4 exercise_names — Vorschlaege aus der Historie (Spec §3.9) ---------------
create or replace function public.exercise_names()
returns table (name text)
language sql
security invoker
stable
set search_path = public
as $$
  select distinct on (lower(t.name)) t.name
    from (
      select pe.exercise_name as name
        from public.plan_exercises pe
        join public.plans p on p.id = pe.plan_id
       where p.user_id = auth.uid()
      union all
      select ws.exercise_name
        from public.workout_sets ws
        join public.workouts w on w.id = ws.workout_id
       where w.user_id = auth.uid()
    ) t
   where btrim(t.name) <> ''
   order by lower(t.name), t.name;
$$;

grant execute on function public.save_plan(uuid, text, jsonb) to authenticated;
grant execute on function public.start_workout(uuid)          to authenticated;
grant execute on function public.delete_set(uuid)             to authenticated;
grant execute on function public.exercise_names()             to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Storage-Bucket fuer Fortschrittsfotos
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

drop policy if exists progress_photos_select on storage.objects;
drop policy if exists progress_photos_insert on storage.objects;
drop policy if exists progress_photos_update on storage.objects;
drop policy if exists progress_photos_delete on storage.objects;

-- Pfadkonvention: <user_id>/<YYYY-MM-DD>/<pose>-<timestamp>.<ext>
-- Der erste Pfadabschnitt ist die user_id — daran haengt die Zugriffspruefung.
create policy progress_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy progress_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Die UPDATE-Policy ist zwingend, sonst schlaegt das Ueberschreiben beim
-- Backup-Restore (upsert: true) fehl.
create policy progress_photos_update on storage.objects
  for update to authenticated
  using      (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy progress_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
