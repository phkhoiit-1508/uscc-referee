-- Read-only product schema preflight. This script does not modify data or schema.
WITH public_tables AS (
  SELECT
    table_row.table_name,
    class_row.relrowsecurity AS rls_enabled,
    class_row.relforcerowsecurity AS rls_forced,
    COALESCE(stats_row.n_live_tup, 0) AS estimated_rows
  FROM information_schema.tables AS table_row
  JOIN pg_namespace AS namespace_row
    ON namespace_row.nspname = table_row.table_schema
  JOIN pg_class AS class_row
    ON class_row.relnamespace = namespace_row.oid
   AND class_row.relname = table_row.table_name
  LEFT JOIN pg_stat_user_tables AS stats_row
    ON stats_row.schemaname = table_row.table_schema
   AND stats_row.relname = table_row.table_name
  WHERE table_row.table_schema = 'public'
    AND table_row.table_type = 'BASE TABLE'
  ORDER BY table_row.table_name
),
public_columns AS (
  SELECT
    table_name,
    ordinal_position,
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position
),
public_constraints AS (
  SELECT
    relation.relname AS table_name,
    constraint_row.conname AS name,
    constraint_row.contype AS type,
    pg_get_constraintdef(constraint_row.oid, true) AS definition
  FROM pg_constraint AS constraint_row
  JOIN pg_class AS relation
    ON relation.oid = constraint_row.conrelid
  JOIN pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
  ORDER BY relation.relname, constraint_row.conname
),
public_indexes AS (
  SELECT tablename AS table_name, indexname, indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
  ORDER BY tablename, indexname
),
public_policies AS (
  SELECT
    tablename AS table_name,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname
),
public_triggers AS (
  SELECT
    event_object_table AS table_name,
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
  FROM information_schema.triggers
  WHERE event_object_schema = 'public'
  ORDER BY event_object_table, trigger_name, event_manipulation
),
public_functions AS (
  SELECT
    function_row.proname AS name,
    pg_get_function_identity_arguments(function_row.oid) AS arguments,
    pg_get_function_result(function_row.oid) AS result,
    language_row.lanname AS language,
    function_row.prosecdef AS security_definer,
    function_row.provolatile AS volatility,
    pg_get_functiondef(function_row.oid) AS definition
  FROM pg_proc AS function_row
  JOIN pg_namespace AS namespace_row
    ON namespace_row.oid = function_row.pronamespace
  JOIN pg_language AS language_row
    ON language_row.oid = function_row.prolang
  WHERE namespace_row.nspname = 'public'
  ORDER BY function_row.proname, pg_get_function_identity_arguments(function_row.oid)
),
public_grants AS (
  SELECT
    table_name,
    grantee,
    privilege_type,
    is_grantable
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated', 'service_role')
  ORDER BY table_name, grantee, privilege_type
),
realtime_tables AS (
  SELECT schemaname, tablename
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
  ORDER BY tablename
)
SELECT jsonb_pretty(
  jsonb_build_object(
    'tables', COALESCE(
      (SELECT jsonb_agg(to_jsonb(public_tables)) FROM public_tables),
      '[]'::jsonb
    ),
    'columns', COALESCE(
      (SELECT jsonb_agg(to_jsonb(public_columns)) FROM public_columns),
      '[]'::jsonb
    ),
    'constraints', COALESCE(
      (SELECT jsonb_agg(to_jsonb(public_constraints)) FROM public_constraints),
      '[]'::jsonb
    ),
    'indexes', COALESCE(
      (SELECT jsonb_agg(to_jsonb(public_indexes)) FROM public_indexes),
      '[]'::jsonb
    ),
    'policies', COALESCE(
      (SELECT jsonb_agg(to_jsonb(public_policies)) FROM public_policies),
      '[]'::jsonb
    ),
    'triggers', COALESCE(
      (SELECT jsonb_agg(to_jsonb(public_triggers)) FROM public_triggers),
      '[]'::jsonb
    ),
    'functions', COALESCE(
      (SELECT jsonb_agg(to_jsonb(public_functions)) FROM public_functions),
      '[]'::jsonb
    ),
    'grants', COALESCE(
      (SELECT jsonb_agg(to_jsonb(public_grants)) FROM public_grants),
      '[]'::jsonb
    ),
    'realtime_tables', COALESCE(
      (SELECT jsonb_agg(to_jsonb(realtime_tables)) FROM realtime_tables),
      '[]'::jsonb
    )
  )
) AS product_schema_preflight;
