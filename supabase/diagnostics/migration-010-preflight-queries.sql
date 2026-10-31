-- ============================================================================
-- READ-ONLY PREFLIGHT CHECK FOR MIGRATION 010 (Swiss-Manager Integration)
-- Run this on Supabase SQL Editor BEFORE applying migration 010.
-- Zero writes. Completely read-only.
-- ============================================================================

-- 1. Check existing columns of public.players (to verify source_id_type status)
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'players'
ORDER BY ordinal_position;

-- 2. Check existing constraints on public.players (ensure unique_player_external_id is present)
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(c.oid, true) AS definition
FROM pg_constraint c
JOIN pg_class cl ON cl.oid = c.conrelid
JOIN pg_namespace n ON n.oid = cl.relnamespace
WHERE n.nspname = 'public'
  AND cl.relname = 'players';

-- 3. Check existing function signature & owner of uscc_import_chess_results
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'uscc_import_chess_results';

-- 4. Check execute grants on uscc_import_chess_results
SELECT
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'uscc_import_chess_results';

-- 5. Check RLS state on affected tables
SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND relname IN ('players', 'matches', 'import_batches', 'audit_log', 'result_events');

-- 6. Check for potential duplicate non-null external_ids in existing tournaments
SELECT
  tournament_id,
  external_id,
  COUNT(*) AS duplicate_count
FROM public.players
WHERE external_id IS NOT NULL
GROUP BY tournament_id, external_id
HAVING COUNT(*) > 1;

