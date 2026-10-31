-- Run on staging after migration 009. All test data is rolled back.
BEGIN;
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  v_technical uuid;
  v_recorder uuid;
  v_tournament uuid;
  v_pending uuid;
  v_official uuid;
  v_events integer;
  v_signature constant text := 'public.uscc_cancel_result(uuid,uuid,text,text)';
BEGIN
  -- 4. Anonymous / browser roles cannot call the RPC at all.
  IF has_function_privilege('anon', v_signature, 'EXECUTE')
     OR has_function_privilege('authenticated', v_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC_CAN_CANCEL_RESULT';
  END IF;

  SELECT id INTO v_technical FROM public.profiles WHERE role = 'technical' LIMIT 1;
  SELECT id INTO v_recorder FROM public.profiles WHERE role = 'recorder' LIMIT 1;
  IF v_technical IS NULL OR v_recorder IS NULL THEN
    RAISE EXCEPTION 'REFEREE_TEST_PROFILES_NOT_FOUND';
  END IF;

  SELECT public.uscc_create_tournament(p_actor := v_technical, p_name := 'Cancel result smoke test')
  INTO v_tournament;
  PERFORM public.uscc_import_chess_results(v_tournament, 1, 'test.xlsx', v_technical,
    '[{"board":1,"whiteName":"White 1","blackName":"Black 1"},
      {"board":2,"whiteName":"White 2","blackName":"Black 2"}]'::jsonb);
  SELECT id INTO v_pending FROM public.matches WHERE tournament_id = v_tournament AND board_number = 1;
  SELECT id INTO v_official FROM public.matches WHERE tournament_id = v_tournament AND board_number = 2;

  -- Board 1: White has confirmed, waiting for Black.
  PERFORM public.uscc_submit_result(v_pending, v_recorder, '1-0', 'normal');
  PERFORM public.uscc_confirm_result(v_pending, v_recorder, 'white', true);

  -- 3. Recorder is rejected.
  BEGIN
    PERFORM public.uscc_cancel_result(v_pending, v_recorder, 'pending_black', 'Recorder attempt');
    RAISE EXCEPTION 'RECORDER_CANCEL_WAS_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'TECHNICAL_REFEREE_REQUIRED' THEN RAISE; END IF;
  END;

  -- 5. Reason is required.
  BEGIN
    PERFORM public.uscc_cancel_result(v_pending, v_technical, 'pending_black', '   ');
    RAISE EXCEPTION 'EMPTY_REASON_WAS_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'REASON_REQUIRED' THEN RAISE; END IF;
  END;

  -- 6. Stale view (referee saw pending_white, match is now pending_black) is rejected.
  BEGIN
    PERFORM public.uscc_cancel_result(v_pending, v_technical, 'pending_white', 'Stale view');
    RAISE EXCEPTION 'STALE_CANCEL_WAS_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MATCH_STATE_CHANGED' THEN RAISE; END IF;
  END;

  -- 1. Technical cancels a pending result; old confirmation is cleared.
  PERFORM public.uscc_cancel_result(v_pending, v_technical, 'pending_black', 'Wrong score entered');
  IF NOT EXISTS (
    SELECT 1 FROM public.matches
    WHERE id = v_pending AND status = 'unreported' AND result_code IS NULL AND result_kind IS NULL
      AND white_confirmed_at IS NULL AND black_confirmed_at IS NULL AND entered_by IS NULL
  ) THEN
    RAISE EXCEPTION 'PENDING_RESULT_NOT_CANCELLED';
  END IF;

  -- 8. result_events and audit_log keep old/new, actor, timestamp and reason.
  IF NOT EXISTS (
    SELECT 1 FROM public.result_events
    WHERE match_id = v_pending AND event_type = 'result_cancelled' AND actor_user_id = v_technical
      AND reason = 'Wrong score entered' AND old_data->>'status' = 'pending_black'
      AND old_data->>'result_code' = '1-0' AND old_data->>'white_confirmed_at' IS NOT NULL
      AND new_data->>'status' = 'unreported' AND created_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'CANCEL_EVENT_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.audit_log
    WHERE entity_table = 'matches' AND entity_id = v_pending::text AND action = 'UPDATE'
      AND actor_user_id = v_technical AND reason = 'Wrong score entered'
      AND old_data->>'status' = 'pending_black' AND new_data->>'status' = 'unreported'
  ) THEN
    RAISE EXCEPTION 'CANCEL_AUDIT_MISSING';
  END IF;

  -- 6. Repeating the same cancel is rejected and writes nothing.
  SELECT count(*) INTO v_events FROM public.result_events WHERE match_id = v_pending;
  BEGIN
    PERFORM public.uscc_cancel_result(v_pending, v_technical, 'pending_black', 'Double click');
    RAISE EXCEPTION 'REPEATED_CANCEL_WAS_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MATCH_STATE_CHANGED' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.uscc_cancel_result(v_pending, v_technical, 'unreported', 'Nothing to cancel');
    RAISE EXCEPTION 'UNREPORTED_CANCEL_WAS_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'MATCH_NOT_CANCELLABLE' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.result_events WHERE match_id = v_pending) <> v_events THEN
    RAISE EXCEPTION 'REJECTED_CANCEL_WROTE_EVENT';
  END IF;

  -- 9. The normal submit -> White -> Black flow still works after cancelling.
  PERFORM public.uscc_submit_result(v_pending, v_recorder, '0-1', 'normal');
  PERFORM public.uscc_confirm_result(v_pending, v_recorder, 'white', true);
  PERFORM public.uscc_confirm_result(v_pending, v_recorder, 'black', true);
  IF NOT EXISTS (
    SELECT 1 FROM public.matches WHERE id = v_pending AND status = 'official' AND result_code = '0-1'
  ) THEN
    RAISE EXCEPTION 'RESUBMIT_AFTER_CANCEL_FAILED';
  END IF;

  -- 2. Technical cancels an official result.
  PERFORM public.uscc_submit_result(v_official, v_recorder, '1/2-1/2', 'normal');
  PERFORM public.uscc_confirm_result(v_official, v_recorder, 'white', true);
  PERFORM public.uscc_confirm_result(v_official, v_recorder, 'black', true);
  PERFORM public.uscc_cancel_result(v_official, v_technical, 'official', 'Board recorded twice');

  -- 7. The cancelled result is no longer official (the projection reads status = 'official').
  IF EXISTS (SELECT 1 FROM public.matches WHERE id = v_official AND status = 'official') THEN
    RAISE EXCEPTION 'CANCELLED_RESULT_STILL_OFFICIAL';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.result_events
    WHERE match_id = v_official AND event_type = 'result_cancelled'
      AND old_data->>'status' = 'official' AND old_data->>'result_code' = '1/2-1/2'
  ) THEN
    RAISE EXCEPTION 'OFFICIAL_CANCEL_EVENT_MISSING';
  END IF;
END;
$test$;

ROLLBACK;
SELECT 'CANCEL_RESULT_SMOKE_TEST_PASSED' AS result;

