-- Read-only follow-up for identity, function privileges, and aggregate data state.
WITH identity_columns AS (
  SELECT
    table_name,
    column_name,
    is_identity,
    identity_generation,
    is_generated,
    generation_expression
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      is_identity = 'YES'
      OR is_generated <> 'NEVER'
    )
  ORDER BY table_name, ordinal_position
),
public_sequences AS (
  SELECT
    sequence_name,
    data_type,
    start_value,
    minimum_value,
    maximum_value,
    increment,
    cycle_option
  FROM information_schema.sequences
  WHERE sequence_schema = 'public'
  ORDER BY sequence_name
),
function_security AS (
  SELECT
    function_row.proname AS name,
    pg_get_function_identity_arguments(function_row.oid) AS arguments,
    pg_get_userbyid(function_row.proowner) AS owner,
    function_row.prosecdef AS security_definer,
    function_row.proacl::text AS explicit_acl,
    has_function_privilege('anon', function_row.oid, 'EXECUTE') AS anon_can_execute,
    has_function_privilege('authenticated', function_row.oid, 'EXECUTE') AS authenticated_can_execute,
    has_function_privilege('service_role', function_row.oid, 'EXECUTE') AS service_role_can_execute
  FROM pg_proc AS function_row
  JOIN pg_namespace AS namespace_row
    ON namespace_row.oid = function_row.pronamespace
  WHERE namespace_row.nspname = 'public'
  ORDER BY function_row.proname, pg_get_function_identity_arguments(function_row.oid)
),
match_state_counts AS (
  SELECT
    status,
    result_kind,
    result_code,
    count(*) AS count
  FROM public.matches
  GROUP BY status, result_kind, result_code
  ORDER BY status, result_kind NULLS FIRST, result_code NULLS FIRST
),
import_state_counts AS (
  SELECT
    file_source,
    status,
    count(*) AS count,
    sum(imported_rows) AS imported_rows
  FROM public.import_batches
  GROUP BY file_source, status
  ORDER BY file_source, status
),
result_event_counts AS (
  SELECT
    event_type,
    player_side,
    count(*) AS count
  FROM public.result_events
  GROUP BY event_type, player_side
  ORDER BY event_type, player_side NULLS FIRST
)
SELECT jsonb_pretty(
  jsonb_build_object(
    'identity_columns', COALESCE(
      (SELECT jsonb_agg(to_jsonb(identity_columns)) FROM identity_columns),
      '[]'::jsonb
    ),
    'public_sequences', COALESCE(
      (SELECT jsonb_agg(to_jsonb(public_sequences)) FROM public_sequences),
      '[]'::jsonb
    ),
    'result_events_id_sequence', pg_get_serial_sequence(
      'public.result_events',
      'id'
    ),
    'function_security', COALESCE(
      (SELECT jsonb_agg(to_jsonb(function_security)) FROM function_security),
      '[]'::jsonb
    ),
    'exact_table_counts', jsonb_build_object(
      'tournaments', (SELECT count(*) FROM public.tournaments),
      'players', (SELECT count(*) FROM public.players),
      'matches', (SELECT count(*) FROM public.matches),
      'import_batches', (SELECT count(*) FROM public.import_batches),
      'result_events', (SELECT count(*) FROM public.result_events)
    ),
    'match_states', COALESCE(
      (SELECT jsonb_agg(to_jsonb(match_state_counts)) FROM match_state_counts),
      '[]'::jsonb
    ),
    'import_states', COALESCE(
      (SELECT jsonb_agg(to_jsonb(import_state_counts)) FROM import_state_counts),
      '[]'::jsonb
    ),
    'result_event_states', COALESCE(
      (SELECT jsonb_agg(to_jsonb(result_event_counts)) FROM result_event_counts),
      '[]'::jsonb
    )
  )
) AS schema_security_followup;
