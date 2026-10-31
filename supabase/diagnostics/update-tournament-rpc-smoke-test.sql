-- Run on staging after migration 007. All test data is rolled back.
BEGIN;
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  v_technical uuid;
  v_recorder uuid;
  v_tournament uuid;
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.uscc_update_tournament(uuid,uuid,text,text,text,date,date,integer,text,text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.uscc_update_tournament(uuid,uuid,text,text,text,date,date,integer,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC_CAN_UPDATE_TOURNAMENT';
  END IF;

  SELECT id INTO v_technical FROM public.profiles WHERE role = 'technical' LIMIT 1;
  SELECT id INTO v_recorder FROM public.profiles WHERE role = 'recorder' LIMIT 1;
  IF v_technical IS NULL OR v_recorder IS NULL THEN
    RAISE EXCEPTION 'REFEREE_TEST_PROFILES_NOT_FOUND';
  END IF;

  SELECT public.uscc_create_tournament(
    p_actor := v_technical,
    p_name := 'Tournament before update',
    p_total_rounds := 3
  ) INTO v_tournament;

  PERFORM public.uscc_import_chess_results(
    v_tournament,
    3,
    'test.xlsx',
    v_technical,
    '[{"board":1,"whiteName":"White test","blackName":"Black test"}]'::jsonb
  );

  BEGIN
    PERFORM public.uscc_update_tournament(
      v_tournament, v_recorder, 'Recorder edit', NULL, NULL, NULL, NULL, 3, NULL, '#172C4C'
    );
    RAISE EXCEPTION 'RECORDER_UPDATE_WAS_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'TECHNICAL_REFEREE_REQUIRED' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.uscc_update_tournament(
      v_tournament, v_technical, 'Too few rounds', NULL, NULL, NULL, NULL, 2, NULL, '#172C4C'
    );
    RAISE EXCEPTION 'ROUND_REDUCTION_WAS_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'TOTAL_ROUNDS_BELOW_EXISTING_ROUND' THEN RAISE; END IF;
  END;

  PERFORM public.uscc_update_tournament(
    v_tournament,
    v_technical,
    'Tournament after update',
    'USCC',
    'TP. Hồ Chí Minh',
    current_date,
    current_date + 1,
    4,
    'https://example.com/logo.png',
    '#0F766E'
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.tournaments
    WHERE id = v_tournament
      AND name = 'Tournament after update'
      AND organizer = 'USCC'
      AND venue = 'TP. Hồ Chí Minh'
      AND total_rounds = 4
      AND logo_url = 'https://example.com/logo.png'
      AND primary_color = '#0F766E'
  ) THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_UPDATED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.audit_log
    WHERE entity_table = 'tournaments'
      AND entity_id = v_tournament::text
      AND action = 'UPDATE'
      AND actor_user_id = v_technical
      AND reason = 'Tournament updated'
      AND old_data->>'name' = 'Tournament before update'
      AND new_data->>'name' = 'Tournament after update'
  ) THEN
    RAISE EXCEPTION 'TOURNAMENT_UPDATE_AUDIT_MISSING';
  END IF;
END;
$test$;

ROLLBACK;
SELECT 'UPDATE_TOURNAMENT_RPC_SMOKE_TEST_PASSED' AS result;
