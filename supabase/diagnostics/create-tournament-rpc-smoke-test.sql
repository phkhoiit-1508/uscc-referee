-- Transactional smoke test for uscc_create_tournament.
-- The tournament and audit entries created here are rolled back.
BEGIN;
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  v_technical_actor uuid;
  v_recorder_actor uuid;
  v_tournament_id uuid;
BEGIN
  IF has_function_privilege(
    'anon',
    'public.uscc_create_tournament(uuid,text,text,text,date,date,integer,text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'ANON_CAN_EXECUTE_CREATE_TOURNAMENT';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.uscc_create_tournament(uuid,text,text,text,date,date,integer,text,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'AUTHENTICATED_CAN_EXECUTE_CREATE_TOURNAMENT';
  END IF;

  SELECT id INTO v_technical_actor
  FROM public.profiles
  WHERE role = 'technical'
  LIMIT 1;

  SELECT id INTO v_recorder_actor
  FROM public.profiles
  WHERE role = 'recorder'
  LIMIT 1;

  IF v_technical_actor IS NULL OR v_recorder_actor IS NULL THEN
    RAISE EXCEPTION 'REFEREE_TEST_PROFILES_NOT_FOUND';
  END IF;

  SELECT public.uscc_create_tournament(
    p_actor := v_technical_actor,
    p_name := 'Transactional tournament smoke test',
    p_organizer := 'USCC',
    p_venue := 'Test venue',
    p_start_date := current_date,
    p_end_date := current_date,
    p_total_rounds := 3,
    p_timezone := 'Asia/Ho_Chi_Minh',
    p_logo_url := NULL,
    p_primary_color := '#172C4C'
  ) INTO v_tournament_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tournaments
    WHERE id = v_tournament_id
      AND name = 'Transactional tournament smoke test'
      AND total_rounds = 3
      AND created_by = v_technical_actor
  ) THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_CREATED_CORRECTLY';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.audit_log
    WHERE entity_table = 'tournaments'
      AND entity_id = v_tournament_id::text
      AND action = 'INSERT'
      AND actor_user_id = v_technical_actor
      AND reason = 'Tournament created'
  ) THEN
    RAISE EXCEPTION 'TOURNAMENT_AUDIT_NOT_CREATED';
  END IF;

  BEGIN
    PERFORM public.uscc_create_tournament(
      p_actor := v_recorder_actor,
      p_name := 'Recorder must not create this'
    );

    RAISE EXCEPTION 'RECORDER_CREATE_WAS_ALLOWED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'TECHNICAL_REFEREE_REQUIRED' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.uscc_create_tournament(
      p_actor := v_technical_actor,
      p_name := 'Invalid rounds',
      p_total_rounds := 0
    );

    RAISE EXCEPTION 'INVALID_ROUND_COUNT_WAS_ALLOWED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'TOTAL_ROUNDS_OUT_OF_RANGE' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    PERFORM public.uscc_create_tournament(
      p_actor := v_technical_actor,
      p_name := 'Invalid color',
      p_primary_color := 'navy'
    );

    RAISE EXCEPTION 'INVALID_COLOR_WAS_ALLOWED';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM <> 'INVALID_PRIMARY_COLOR' THEN
        RAISE;
      END IF;
  END;
END;
$test$;

ROLLBACK;

SELECT 'CREATE_TOURNAMENT_RPC_SMOKE_TEST_PASSED' AS result;
