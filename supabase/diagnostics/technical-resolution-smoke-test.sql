-- Run in staging after applying migration 005. All changes are rolled back.
BEGIN;
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  v_technical uuid;
  v_recorder uuid;
  v_tournament uuid;
  v_match uuid;
BEGIN
  IF has_function_privilege('authenticated', 'public.uscc_resolve_dispute(uuid,uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.uscc_reopen_result(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.uscc_resolve_dispute(uuid,uuid,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.uscc_reopen_result(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC_CAN_MANAGE_RESULTS';
  END IF;

  SELECT id INTO v_technical FROM public.profiles WHERE role = 'technical' LIMIT 1;
  SELECT id INTO v_recorder FROM public.profiles WHERE role = 'recorder' LIMIT 1;
  IF v_technical IS NULL OR v_recorder IS NULL THEN
    RAISE EXCEPTION 'REFEREE_TEST_PROFILES_NOT_FOUND';
  END IF;

  SELECT public.uscc_create_tournament(p_actor := v_technical, p_name := 'Temporary result test') INTO v_tournament;
  PERFORM public.uscc_import_chess_results(v_tournament, 1, 'test.xlsx', v_technical,
    '[{"board":1,"whiteName":"White test","blackName":"Black test"}]'::jsonb);
  SELECT id INTO v_match FROM public.matches WHERE tournament_id = v_tournament;
  PERFORM public.uscc_submit_result(v_match, v_recorder, '1-0', 'normal');
  PERFORM public.uscc_confirm_result(v_match, v_recorder, 'white', false);

  BEGIN
    PERFORM public.uscc_resolve_dispute(v_match, v_recorder, '0-1', 'adjudicated', 'Test correction');
    RAISE EXCEPTION 'RECORDER_RESOLVED_DISPUTE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'TECHNICAL_REFEREE_REQUIRED' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.uscc_resolve_dispute(v_match, v_technical, '0-1', 'adjudicated', '  ');
    RAISE EXCEPTION 'EMPTY_REASON_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REASON_REQUIRED' THEN RAISE; END IF;
  END;

  PERFORM public.uscc_resolve_dispute(v_match, v_technical, '0-1', 'adjudicated', 'White contested the score');
  IF NOT EXISTS (SELECT 1 FROM public.matches WHERE id = v_match AND status = 'official'
                 AND result_code = '0-1' AND white_confirmed_at IS NULL AND black_confirmed_at IS NULL) THEN
    RAISE EXCEPTION 'DISPUTE_NOT_RESOLVED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.result_events WHERE match_id = v_match
                 AND event_type = 'result_approved' AND actor_user_id = v_technical
                 AND old_data->>'result_code' = '1-0' AND reason = 'White contested the score') THEN
    RAISE EXCEPTION 'RESOLUTION_HISTORY_MISSING';
  END IF;

  BEGIN
    PERFORM public.uscc_reopen_result(v_match, v_recorder, 'Wrong score');
    RAISE EXCEPTION 'RECORDER_REOPENED_RESULT';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'TECHNICAL_REFEREE_REQUIRED' THEN RAISE; END IF;
  END;

  PERFORM public.uscc_reopen_result(v_match, v_technical, 'Wrong score');
  IF NOT EXISTS (SELECT 1 FROM public.matches WHERE id = v_match AND status = 'reopened'
                 AND result_code IS NULL AND white_confirmed_at IS NULL AND black_confirmed_at IS NULL) THEN
    RAISE EXCEPTION 'RESULT_NOT_REOPENED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.result_events WHERE match_id = v_match
                 AND event_type = 'result_reopened' AND actor_user_id = v_technical
                 AND old_data->>'result_code' = '0-1' AND reason = 'Wrong score') THEN
    RAISE EXCEPTION 'REOPEN_HISTORY_MISSING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_log WHERE entity_table = 'matches'
                 AND entity_id = v_match::text AND actor_user_id = v_technical
                 AND reason = 'Wrong score') THEN
    RAISE EXCEPTION 'REOPEN_AUDIT_MISSING';
  END IF;

  BEGIN
    PERFORM public.uscc_reopen_result(v_match, v_technical, 'Again');
    RAISE EXCEPTION 'REOPENED_TWICE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MATCH_NOT_OFFICIAL' THEN RAISE; END IF;
  END;

  PERFORM public.uscc_submit_result(v_match, v_recorder, '1/2-1/2', 'normal');
  PERFORM public.uscc_confirm_result(v_match, v_recorder, 'white', true);
  PERFORM public.uscc_confirm_result(v_match, v_recorder, 'black', true);
  IF NOT EXISTS (SELECT 1 FROM public.matches WHERE id = v_match AND status = 'official'
                 AND result_code = '1/2-1/2' AND white_confirmed_at IS NOT NULL AND black_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'RECONFIRMATION_FAILED';
  END IF;
END;
$test$;

ROLLBACK;
SELECT 'TECHNICAL_RESOLUTION_SMOKE_TEST_PASSED' AS result;
