-- Run on staging after migration 006. All test data is rolled back.
BEGIN;
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  v_actor uuid;
  v_tournament uuid;
  v_count integer;
BEGIN
  SELECT id INTO v_actor FROM public.profiles WHERE role = 'technical' LIMIT 1;
  IF v_actor IS NULL THEN RAISE EXCEPTION 'TECHNICAL_PROFILE_REQUIRED'; END IF;

  SELECT public.uscc_create_tournament(p_actor := v_actor, p_name := 'Source result smoke test')
  INTO v_tournament;

  SELECT public.uscc_import_chess_results(
    v_tournament, 1, 'test.xlsx', v_actor,
    '[{"board":1,"whiteName":"White One","blackName":"Black One","sourceResult":"1 - 0"},
      {"board":2,"whiteName":"White Two","blackName":"Black Two","sourceResult":""}]'::jsonb
  ) INTO v_count;

  IF v_count <> 2 OR NOT EXISTS (
    SELECT 1 FROM public.matches
    WHERE tournament_id = v_tournament AND board_number = 1 AND source_result = '1 - 0'
      AND result_code IS NULL AND status = 'unreported'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.matches
    WHERE tournament_id = v_tournament AND board_number = 2 AND source_result IS NULL
      AND result_code IS NULL AND status = 'unreported'
  ) THEN
    RAISE EXCEPTION 'SOURCE_RESULT_NOT_PRESERVED_SEPARATELY';
  END IF;

  BEGIN
    PERFORM public.uscc_import_chess_results(
      v_tournament, 1, 'test.xlsx', v_actor,
      '[{"board":1,"whiteName":"Other White","blackName":"Other Black","sourceResult":"0-1"}]'::jsonb
    );
    RAISE EXCEPTION 'REIMPORT_WAS_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROUND_ALREADY_HAS_MATCHES' THEN RAISE; END IF;
  END;

  IF (SELECT count(*) FROM public.matches WHERE tournament_id = v_tournament) <> 2 THEN
    RAISE EXCEPTION 'REIMPORT_CHANGED_MATCHES';
  END IF;
END;
$test$;

ROLLBACK;
SELECT 'SOURCE_RESULT_SMOKE_TEST_PASSED' AS result;
