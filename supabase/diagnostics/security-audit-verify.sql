-- Read-only verification after the security/audit foundation migration.
WITH selected_grants AS (
  SELECT
    table_name,
    grantee,
    privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN (
      'connection_check',
      'profiles',
      'result_events',
      'audit_log'
    )
    AND grantee IN ('anon', 'authenticated', 'service_role')
  ORDER BY table_name, grantee, privilege_type
),
selected_triggers AS (
  SELECT
    event_object_table AS table_name,
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
  FROM information_schema.triggers
  WHERE event_object_schema = 'public'
    AND event_object_table IN (
      'profiles',
      'tournaments',
      'players',
      'matches',
      'import_batches',
      'result_events',
      'audit_log'
    )
  ORDER BY event_object_table, trigger_name, event_manipulation
),
audit_policy AS (
  SELECT
    policyname,
    roles,
    cmd,
    qual,
    with_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'audit_log'
  ORDER BY policyname
),
function_security AS (
  SELECT
    function_row.proname AS name,
    pg_get_function_identity_arguments(function_row.oid) AS arguments,
    function_row.prosecdef AS security_definer,
    has_function_privilege('anon', function_row.oid, 'EXECUTE') AS anon_can_execute,
    has_function_privilege('authenticated', function_row.oid, 'EXECUTE') AS authenticated_can_execute,
    has_function_privilege('service_role', function_row.oid, 'EXECUTE') AS service_role_can_execute,
    position(
      'app.actor_user_id' IN pg_get_functiondef(function_row.oid)
    ) > 0 AS establishes_actor_context
  FROM pg_proc AS function_row
  JOIN pg_namespace AS namespace_row
    ON namespace_row.oid = function_row.pronamespace
  WHERE namespace_row.nspname = 'public'
    AND function_row.proname IN (
      'uscc_import_chess_results',
      'uscc_audit_row',
      'uscc_set_updated_at',
      'uscc_reject_append_only_change'
    )
  ORDER BY function_row.proname
),
migration_history AS (
  SELECT version, name
  FROM supabase_migrations.schema_migrations
  WHERE version IN ('20261029000100', '20261029000200')
  ORDER BY version
)
SELECT jsonb_pretty(
  jsonb_build_object(
    'migration_history', COALESCE(
      (SELECT jsonb_agg(to_jsonb(migration_history)) FROM migration_history),
      '[]'::jsonb
    ),
    'data_counts', jsonb_build_object(
      'tournaments', (SELECT count(*) FROM public.tournaments),
      'players', (SELECT count(*) FROM public.players),
      'matches', (SELECT count(*) FROM public.matches),
      'import_batches', (SELECT count(*) FROM public.import_batches),
      'result_events', (SELECT count(*) FROM public.result_events),
      'audit_log', (SELECT count(*) FROM public.audit_log)
    ),
    'audit_log_rls', (
      SELECT jsonb_build_object(
        'enabled', relation.relrowsecurity,
        'forced', relation.relforcerowsecurity
      )
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace_row
        ON namespace_row.oid = relation.relnamespace
      WHERE namespace_row.nspname = 'public'
        AND relation.relname = 'audit_log'
    ),
    'audit_policy', COALESCE(
      (SELECT jsonb_agg(to_jsonb(audit_policy)) FROM audit_policy),
      '[]'::jsonb
    ),
    'selected_grants', COALESCE(
      (SELECT jsonb_agg(to_jsonb(selected_grants)) FROM selected_grants),
      '[]'::jsonb
    ),
    'selected_triggers', COALESCE(
      (SELECT jsonb_agg(to_jsonb(selected_triggers)) FROM selected_triggers),
      '[]'::jsonb
    ),
    'function_security', COALESCE(
      (SELECT jsonb_agg(to_jsonb(function_security)) FROM function_security),
      '[]'::jsonb
    )
  )
) AS security_audit_verification;
