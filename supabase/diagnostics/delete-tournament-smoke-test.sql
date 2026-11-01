-- Run on staging after migration 011. All test data is rolled back.
BEGIN;
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  v_technical uuid;
  v_recorder uuid;
  v_tournament uuid;
  v_match uuid;
  v_signature constant text := 'public.uscc_delete_tournament(uuid,uuid)';
BEGIN
  -- 1. Anonymous roles cannot call the RPC.
  IF has_function_privilege('anon', v_signature, 'EXECUTE') THEN
    RAISE EXCEPTION 'ANON_CAN_DELETE_TOURNAMENT';
  END IF;

  SELECT id INTO v_technical FROM public.profiles WHERE role = 'technical' LIMIT 1;
  SELECT id INTO v_recorder FROM public.profiles WHERE role = 'recorder' LIMIT 1;
  IF v_technical IS NULL OR v_recorder IS NULL THEN
    RAISE EXCEPTION 'REFEREE_TEST_PROFILES_NOT_FOUND';
  END IF;

  -- 2. Create a test tournament
  SELECT public.uscc_create_tournament(p_actor := v_technical, p_name := 'Delete tournament smoke test')
  INTO v_tournament;

  -- Import pairings
  PERFORM public.uscc_import_chess_results(v_tournament, 1, 'test.xlsx', v_technical,
    '[{"board":1,"whiteName":"White Player","blackName":"Black Player"}]'::jsonb);

  SELECT id INTO v_match FROM public.matches WHERE tournament_id = v_tournament AND board_number = 1;

  -- Submit result to create result_events
  PERFORM public.uscc_submit_result(v_match, v_recorder, '1-0', 'normal');

  -- 3. Recorder is rejected
  BEGIN
    PERFORM public.uscc_delete_tournament(v_tournament, v_recorder);
    RAISE EXCEPTION 'RECORDER_DELETE_WAS_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'TECHNICAL_REFEREE_REQUIRED' THEN RAISE; END IF;
  END;

  -- 4. Technical referee deletes tournament successfully
  PERFORM public.uscc_delete_tournament(v_tournament, v_technical);

  -- 5. Verify tournament and child data are deleted
  IF EXISTS (SELECT 1 FROM public.tournaments WHERE id = v_tournament) THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_DELETED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE tournament_id = v_tournament) THEN
    RAISE EXCEPTION 'MATCHES_NOT_DELETED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.players WHERE tournament_id = v_tournament) THEN
    RAISE EXCEPTION 'PLAYERS_NOT_DELETED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.import_batches WHERE tournament_id = v_tournament) THEN
    RAISE EXCEPTION 'IMPORT_BATCHES_NOT_DELETED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.result_events WHERE match_id = v_match) THEN
    RAISE EXCEPTION 'RESULT_EVENTS_NOT_DELETED';
  END IF;

  -- 6. Deleting non-existent tournament throws TOURNAMENT_NOT_FOUND
  BEGIN
    PERFORM public.uscc_delete_tournament(v_tournament, v_technical);
    RAISE EXCEPTION 'NONEXISTENT_TOURNAMENT_DELETE_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'TOURNAMENT_NOT_FOUND' THEN RAISE; END IF;
  END;
END;
$test$;

ROLLBACK;

