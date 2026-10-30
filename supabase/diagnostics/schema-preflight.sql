-- Read-only Supabase schema preflight. This script does not modify data or schema.
WITH public_tables AS (
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
  ORDER BY table_name
),
profile_columns AS (
  SELECT
    ordinal_position,
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
  ORDER BY ordinal_position
),
profile_constraints AS (
  SELECT
    constraint_row.conname AS name,
    constraint_row.contype AS type,
    pg_get_constraintdef(constraint_row.oid, true) AS definition
  FROM pg_constraint AS constraint_row
  JOIN pg_class AS relation
    ON relation.oid = constraint_row.conrelid
  JOIN pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'profiles'
  ORDER BY constraint_row.conname
),
profile_indexes AS (
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'profiles'
  ORDER BY indexname
),
profile_rls AS (
  SELECT
    relation.relrowsecurity AS enabled,
    relation.relforcerowsecurity AS forced
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'profiles'
),
profile_policies AS (
  SELECT
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'profiles'
  ORDER BY policyname
),
profile_triggers AS (
  SELECT
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
  FROM information_schema.triggers
  WHERE event_object_schema = 'public'
    AND event_object_table = 'profiles'
  ORDER BY trigger_name, event_manipulation
),
auth_user_triggers AS (
  SELECT
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
  FROM information_schema.triggers
  WHERE event_object_schema = 'auth'
    AND event_object_table = 'users'
  ORDER BY trigger_name, event_manipulation
),
public_enums AS (
  SELECT
    enum_type.typname AS type_name,
    enum_value.enumsortorder AS sort_order,
    enum_value.enumlabel AS value
  FROM pg_type AS enum_type
  JOIN pg_enum AS enum_value
    ON enum_value.enumtypid = enum_type.oid
  JOIN pg_namespace AS namespace
    ON namespace.oid = enum_type.typnamespace
  WHERE namespace.nspname = 'public'
  ORDER BY enum_type.typname, enum_value.enumsortorder
),
profile_counts AS (
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE role::text = 'technical') AS technical,
    count(*) FILTER (WHERE role::text = 'recorder') AS recorder,
    count(*) FILTER (
      WHERE role IS NULL
         OR role::text NOT IN ('technical', 'recorder')
    ) AS other_or_missing_role
  FROM public.profiles
),
migration_history_status AS (
  SELECT
    to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS table_exists
)
SELECT jsonb_pretty(
  jsonb_build_object(
    'public_tables', COALESCE(
      (SELECT jsonb_agg(to_jsonb(public_tables)) FROM public_tables),
      '[]'::jsonb
    ),
    'profiles', jsonb_build_object(
      'columns', COALESCE(
        (SELECT jsonb_agg(to_jsonb(profile_columns)) FROM profile_columns),
        '[]'::jsonb
      ),
      'constraints', COALESCE(
        (SELECT jsonb_agg(to_jsonb(profile_constraints)) FROM profile_constraints),
        '[]'::jsonb
      ),
      'indexes', COALESCE(
        (SELECT jsonb_agg(to_jsonb(profile_indexes)) FROM profile_indexes),
        '[]'::jsonb
      ),
      'rls', COALESCE(
        (SELECT to_jsonb(profile_rls) FROM profile_rls),
        '{}'::jsonb
      ),
      'policies', COALESCE(
        (SELECT jsonb_agg(to_jsonb(profile_policies)) FROM profile_policies),
        '[]'::jsonb
      ),
      'triggers', COALESCE(
        (SELECT jsonb_agg(to_jsonb(profile_triggers)) FROM profile_triggers),
        '[]'::jsonb
      ),
      'counts', (SELECT to_jsonb(profile_counts) FROM profile_counts)
    ),
    'auth_user_triggers', COALESCE(
      (SELECT jsonb_agg(to_jsonb(auth_user_triggers)) FROM auth_user_triggers),
      '[]'::jsonb
    ),
    'public_enums', COALESCE(
      (SELECT jsonb_agg(to_jsonb(public_enums)) FROM public_enums),
      '[]'::jsonb
    ),
    'migration_history', jsonb_build_object(
      'table_exists', (
        SELECT table_exists
        FROM migration_history_status
      )
    )
  )
) AS schema_preflight;
