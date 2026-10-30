-- Transactional smoke test for the audit foundation.
-- All temporary writes are rolled back before the final success result.
BEGIN;

DO $test$
DECLARE
  v_actor uuid;
  v_tournament_id uuid;
  v_match_id uuid;
  v_result_event_id bigint;
  v_audit_id bigint;
  v_old_updated_at timestamp with time zone;
  v_new_updated_at timestamp with time zone;
BEGIN
  SELECT id INTO v_actor
  FROM public.profiles
  WHERE role = 'technical'
  LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'TECHNICAL_TEST_PROFILE_NOT_FOUND';
  END IF;

  PERFORM set_config('app.actor_user_id', v_actor::text, true);
  PERFORM set_config('app.audit_reason', 'Transactional audit smoke test', true);

  SELECT id INTO v_tournament_id
  FROM public.tournaments
  LIMIT 1;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'TEST_TOURNAMENT_NOT_FOUND';
  END IF;

  UPDATE public.tournaments
  SET name = name
  WHERE id = v_tournament_id;

  SELECT id INTO v_audit_id
  FROM public.audit_log
  WHERE entity_table = 'tournaments'
    AND entity_id = v_tournament_id::text
    AND action = 'UPDATE'
    AND actor_user_id = v_actor
    AND reason = 'Transactional audit smoke test'
  ORDER BY id DESC
  LIMIT 1;

  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'TOURNAMENT_AUDIT_NOT_CREATED';
  END IF;

  SELECT id, updated_at
  INTO v_match_id, v_old_updated_at
  FROM public.matches
  LIMIT 1;

  IF v_match_id IS NULL THEN
    RAISE EXCEPTION 'TEST_MATCH_NOT_FOUND';
  END IF;

  UPDATE public.matches
  SET status = status
  WHERE id = v_match_id;

  SELECT updated_at INTO v_new_updated_at
  FROM public.matches
  WHERE id = v_match_id;

  IF v_new_updated_at <= v_old_updated_at THEN
    RAISE EXCEPTION 'MATCH_UPDATED_AT_NOT_ADVANCED';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.audit_log
    WHERE entity_table = 'matches'
      AND entity_id = v_match_id::text
      AND action = 'UPDATE'
      AND actor_user_id = v_actor
  ) THEN
    RAISE EXCEPTION 'MATCH_AUDIT_NOT_CREATED';
  END IF;

  BEGIN
    UPDATE public.audit_log
    SET reason = reason
    WHERE id = v_audit_id;

    RAISE EXCEPTION 'AUDIT_LOG_UPDATE_WAS_ALLOWED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'APPEND_ONLY_TABLE' THEN
        RAISE;
      END IF;
  END;

  SELECT id INTO v_result_event_id
  FROM public.result_events
  LIMIT 1;

  IF v_result_event_id IS NULL THEN
    RAISE EXCEPTION 'TEST_RESULT_EVENT_NOT_FOUND';
  END IF;

  BEGIN
    UPDATE public.result_events
    SET event_type = event_type
    WHERE id = v_result_event_id;

    RAISE EXCEPTION 'RESULT_EVENT_UPDATE_WAS_ALLOWED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'APPEND_ONLY_TABLE' THEN
        RAISE;
      END IF;
  END;
END;
$test$;

ROLLBACK;

SELECT 'AUDIT_FOUNDATION_SMOKE_TEST_PASSED' AS result;
