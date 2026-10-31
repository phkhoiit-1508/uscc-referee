-- Run on staging after migration 008. All test data is rolled back.
BEGIN;
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  v_technical uuid;
  v_recorder uuid;
  v_tournament uuid;
  v_resignation uuid;
  v_forfeit uuid;
  v_absence uuid;
BEGIN
  SELECT id INTO v_technical FROM public.profiles WHERE role = 'technical' LIMIT 1;
  SELECT id INTO v_recorder FROM public.profiles WHERE role = 'recorder' LIMIT 1;
  IF v_technical IS NULL OR v_recorder IS NULL THEN
    RAISE EXCEPTION 'REFEREE_TEST_PROFILES_NOT_FOUND';
  END IF;

  SELECT public.uscc_create_tournament(
    p_actor := v_technical,
    p_name := 'Special result smoke test'
  ) INTO v_tournament;

  PERFORM public.uscc_import_chess_results(
    v_tournament,
    1,
    'test.xlsx',
    v_technical,
    '[{"board":1,"whiteName":"White 1","blackName":"Black 1"},
      {"board":2,"whiteName":"White 2","blackName":"Black 2"},
      {"board":3,"whiteName":"White 3","blackName":"Black 3"}]'::jsonb
  );

  SELECT id INTO v_resignation FROM public.matches
  WHERE tournament_id = v_tournament AND board_number = 1;
  SELECT id INTO v_forfeit FROM public.matches
  WHERE tournament_id = v_tournament AND board_number = 2;
  SELECT id INTO v_absence FROM public.matches
  WHERE tournament_id = v_tournament AND board_number = 3;

  PERFORM public.uscc_submit_result(v_resignation, v_recorder, '1-0', 'resignation');
  IF NOT EXISTS (
    SELECT 1 FROM public.matches
    WHERE id = v_resignation AND status = 'pending_white' AND result_kind = 'resignation'
  ) THEN
    RAISE EXCEPTION 'RESIGNATION_DID_NOT_REQUIRE_CONFIRMATION';
  END IF;
  PERFORM public.uscc_confirm_result(v_resignation, v_recorder, 'white', true);
  PERFORM public.uscc_confirm_result(v_resignation, v_recorder, 'black', true);
  IF NOT EXISTS (SELECT 1 FROM public.matches WHERE id = v_resignation AND status = 'official') THEN
    RAISE EXCEPTION 'RESIGNATION_NOT_FINALIZED';
  END IF;

  PERFORM public.uscc_submit_result(v_forfeit, v_recorder, '0-1', 'forfeit');
  IF NOT EXISTS (
    SELECT 1 FROM public.matches
    WHERE id = v_forfeit AND status = 'special_review' AND result_kind = 'forfeit'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.result_events
    WHERE match_id = v_forfeit AND event_type = 'special_marked' AND actor_user_id = v_recorder
  ) THEN
    RAISE EXCEPTION 'FORFEIT_NOT_SENT_TO_TECHNICAL_REVIEW';
  END IF;

  BEGIN
    PERFORM public.uscc_confirm_result(v_forfeit, v_recorder, 'white', true);
    RAISE EXCEPTION 'PLAYER_CONFIRMATION_ALLOWED_FOR_SPECIAL_RESULT';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CONFIRMATION_OUT_OF_ORDER' THEN RAISE; END IF;
  END;

  PERFORM public.uscc_resolve_dispute(
    v_forfeit, v_technical, '0-1', 'forfeit', 'Technical approved forfeit'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.matches
    WHERE id = v_forfeit AND status = 'official' AND result_code = '0-1' AND result_kind = 'forfeit'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.result_events
    WHERE match_id = v_forfeit AND event_type = 'result_approved'
      AND actor_user_id = v_technical AND reason = 'Technical approved forfeit'
  ) THEN
    RAISE EXCEPTION 'FORFEIT_NOT_APPROVED';
  END IF;

  BEGIN
    PERFORM public.uscc_submit_result(v_absence, v_recorder, '1-0', 'bye');
    RAISE EXCEPTION 'BYE_WAS_ACCEPTED_WITHOUT_SWISS_MANAGER_RULES';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'INVALID_RESULT_KIND' THEN RAISE; END IF;
  END;

  PERFORM public.uscc_submit_result(v_absence, v_recorder, '1-0', 'absence');
  IF NOT EXISTS (
    SELECT 1 FROM public.matches
    WHERE id = v_absence AND status = 'special_review' AND result_kind = 'absence'
  ) THEN
    RAISE EXCEPTION 'ABSENCE_NOT_SENT_TO_TECHNICAL_REVIEW';
  END IF;
END;
$test$;

ROLLBACK;
SELECT 'SPECIAL_RESULT_WORKFLOW_SMOKE_TEST_PASSED' AS result;
