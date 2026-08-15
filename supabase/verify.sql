-- =============================================================================
-- Schema-Prüfung
-- =============================================================================
-- Liest nur, schreibt nichts. Nach jedem Lauf von setup.sql ausführen.
--
-- Ergebnis ist eine Tabelle mit einer Zeile je Prüfung. Alles muss auf "OK"
-- stehen — jede andere Ausgabe ist ein Befund.
--
-- Die wichtigste Prüfung ist "Policy vollständig": In v1 gab es Policies ohne
-- `with check`. Sie sehen beim Lesen völlig normal aus und lassen trotzdem
-- Schreibzugriffe durch, die sie blockieren sollten. Genau daran ist v1
-- gescheitert (Fehler 42501 in fix-policies.sql).
-- =============================================================================

with
expected_tables(t) as (values
  ('plans'), ('plan_exercises'), ('workouts'), ('workout_sets'),
  ('weekly_checkins'), ('measurements'), ('progress_photos')
),
expected_constraints(c) as (values
  ('plan_exercises_target_sets_check'), ('plan_exercises_target_reps_check'),
  ('plan_exercises_target_weight_check'),
  ('workout_sets_set_number_check'), ('workout_sets_reps_check'),
  ('workout_sets_weight_check'), ('workout_sets_rir_check'),
  ('weekly_checkins_bodyweight_check'), ('weekly_checkins_sleep_hours_check'),
  ('weekly_checkins_week_rating_check'), ('weekly_checkins_user_date_key'),
  ('measurements_upper_arm_check'), ('measurements_chest_check'),
  ('measurements_thigh_check'), ('measurements_waist_check'),
  ('measurements_user_date_key'),
  ('progress_photos_pose_check')
),
expected_indexes(i) as (values
  ('workouts_user_finished_idx'),
  ('workout_sets_workout_exercise_idx'),
  ('workouts_one_open_per_plan_idx'),
  ('plans_user_created_idx'),
  ('plan_exercises_plan_order_idx'),
  ('weekly_checkins_user_date_idx'),
  ('measurements_user_date_idx'),
  ('progress_photos_user_date_idx')
),
expected_functions(f) as (values
  ('save_plan'), ('start_workout'), ('delete_set'), ('exercise_names')
),
expected_storage_policies(p) as (values
  ('progress_photos_select'), ('progress_photos_insert'),
  ('progress_photos_update'), ('progress_photos_delete')
)

-- 1. Tabellen ----------------------------------------------------------------
select '1 Tabelle' as bereich, t as pruefung,
       case when exists (
         select 1 from pg_tables where schemaname = 'public' and tablename = t
       ) then 'OK' else 'FEHLT' end as status
from expected_tables

union all

-- 2. Row Level Security eingeschaltet ----------------------------------------
select '2 RLS aktiv', t,
       case
         when not exists (
           select 1 from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = t
         ) then 'TABELLE FEHLT'
         when (
           select c.relrowsecurity from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = t
         ) then 'OK'
         else 'AUSGESCHALTET'
       end
from expected_tables

union all

-- 3. Policies mit using UND with check ---------------------------------------
-- Fehlt `with check`, greift Postgres beim Schreiben auf `using` zurück. Das
-- ist stillschweigend anderes Verhalten — sichtbar wird es erst, wenn jemand
-- Zeilen anlegt, die er nicht anlegen dürfte.
select '3 Policy vollständig', p.tablename || ' / ' || p.policyname,
       case
         when p.qual is not null and p.with_check is not null then 'OK'
         when p.with_check is null then 'with check FEHLT'
         else 'using FEHLT'
       end
from pg_policies p
where p.schemaname = 'public'

union all

-- Hat überhaupt jede Tabelle eine Policy?
select '3 Policy vorhanden', t,
       case when exists (
         select 1 from pg_policies where schemaname = 'public' and tablename = t
       ) then 'OK' else 'KEINE POLICY' end
from expected_tables

union all

-- 4. CHECK- und UNIQUE-Constraints -------------------------------------------
select '4 Constraint', c,
       case when exists (
         select 1 from pg_constraint
         where conname = c and connamespace = 'public'::regnamespace
       ) then 'OK' else 'FEHLT' end
from expected_constraints

union all

-- 5. Indizes -----------------------------------------------------------------
select '5 Index', i,
       case when exists (
         select 1 from pg_indexes where schemaname = 'public' and indexname = i
       ) then 'OK' else 'FEHLT' end
from expected_indexes

union all

-- 6. Funktionen --------------------------------------------------------------
-- `security definer` wäre hier ein Sicherheitsfehler: die Funktion liefe mit
-- den Rechten des Eigentümers und damit an RLS vorbei.
select '6 Funktion', f,
       case
         when not exists (
           select 1 from pg_proc pr
           join pg_namespace n on n.oid = pr.pronamespace
           where n.nspname = 'public' and pr.proname = f
         ) then 'FEHLT'
         when exists (
           select 1 from pg_proc pr
           join pg_namespace n on n.oid = pr.pronamespace
           where n.nspname = 'public' and pr.proname = f and pr.prosecdef
         ) then 'WARNUNG: security definer'
         else 'OK (security invoker)'
       end
from expected_functions

union all

-- 7. Storage -----------------------------------------------------------------
select '7 Storage', 'Bucket progress-photos',
       case
         when exists (select 1 from storage.buckets where id = 'progress-photos' and public = false)
           then 'OK (privat)'
         when exists (select 1 from storage.buckets where id = 'progress-photos')
           then 'WARNUNG: öffentlich'
         else 'FEHLT'
       end

union all

-- Die UPDATE-Policy ist zwingend, sonst scheitert das Überschreiben beim
-- Backup-Restore (upsert: true).
select '7 Storage-Policy', p,
       case when exists (
         select 1 from pg_policies
         where schemaname = 'storage' and tablename = 'objects' and policyname = p
       ) then 'OK' else 'FEHLT' end
from expected_storage_policies

order by 1, 2;
