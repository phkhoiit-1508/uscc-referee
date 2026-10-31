-- ============================================================================
-- Transactional Smoke Test for Migration 010: Swiss-Manager Integration & Round Updates
-- Verifies:
--   1. source_id_type tracking and constraint
--   2. First-time pairing import for a round
--   3. Re-importing same pairing file without ROUND_ALREADY_HAS_MATCHES
--   4. Adding new board to existing round
--   5. Updating pairings on unreported board
--   6. Blocking player modification on board with official/active results (CANNOT_OVERWRITE_MATCH_WITH_RESULTS)
--   7. Blocking omission of board with active results (CANNOT_OMIT_MATCH_WITH_RESULTS)
--   8. Multi-round player reuse by external_id without unique constraint conflicts
--   9. Clean transactional rollback (leaves no trace in database)
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_tourn_id uuid := gen_random_uuid();
  v_imported integer;
  v_white_id_type text;
  v_white_ext text;
  v_board1_white_name text;
  v_board3_exists boolean;
  v_conflict_caught boolean := false;
  v_omit_caught boolean := false;
BEGIN
  -- 1. Setup technical profile (reuse existing technical profile if available, or create temporary)
  SELECT p.id INTO v_user_id
  FROM public.profiles p
  WHERE p.role = 'technical'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (id, email)
    VALUES (v_user_id, 'tech.smoke010@test.local')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (id, full_name, role)
    VALUES (v_user_id, 'Technical Referee Smoke 010', 'technical')
    ON CONFLICT (id) DO UPDATE SET role = 'technical';
  END IF;

  -- 2. Setup tournament
  INSERT INTO public.tournaments (id, name, total_rounds, created_by)
  VALUES (v_tourn_id, 'Smoke 010 Swiss-Manager Integration Tournament', 5, v_user_id);

  -- 3. Scenario 1: First-time pairing import with Swiss-Manager IDs
  v_imported := public.uscc_import_chess_results(
    v_tourn_id,
    1,
    'smoke-test-round-1.xlsx',
    v_user_id,
    jsonb_build_array(
      jsonb_build_object(
        'board', 1,
        'whiteName', 'Nguyễn An',
        'whiteClub', 'USCC',
        'whiteExternalId', '1',
        'whiteIdType', 'swiss_start_rank_no',
        'blackName', 'Trần Bình',
        'blackClub', 'HCMUS',
        'blackExternalId', '41',
        'blackIdType', 'swiss_start_rank_no',
        'sourceResult', '',
        'isBye', false
      ),
      jsonb_build_object(
        'board', 2,
        'whiteName', 'Lê Chi',
        'whiteClub', 'USCC',
        'whiteExternalId', '2',
        'whiteIdType', 'swiss_start_rank_no',
        'blackName', 'Bye',
        'blackClub', '',
        'blackExternalId', null,
        'blackIdType', 'unknown',
        'sourceResult', '1-0',
        'isBye', true
      )
    )
  );

  ASSERT v_imported = 2, 'Scenario 1 failed: Must import 2 rows on first import';

  -- Verify player on board 1 has source_id_type = 'swiss_start_rank_no'
  SELECT source_id_type, external_id INTO v_white_id_type, v_white_ext
  FROM public.players
  WHERE tournament_id = v_tourn_id AND full_name = 'Nguyễn An';

  ASSERT v_white_id_type = 'swiss_start_rank_no', 'White player must have swiss_start_rank_no';
  ASSERT v_white_ext = '1', 'White external_id must be 1';

  -- 4. Scenario 2: Re-import same file for round 1 (Must NOT raise ROUND_ALREADY_HAS_MATCHES)
  v_imported := public.uscc_import_chess_results(
    v_tourn_id,
    1,
    'smoke-test-round-1-reimport.xlsx',
    v_user_id,
    jsonb_build_array(
      jsonb_build_object(
        'board', 1,
        'whiteName', 'Nguyễn An',
        'whiteClub', 'USCC',
        'whiteExternalId', '1',
        'whiteIdType', 'swiss_start_rank_no',
        'blackName', 'Trần Bình',
        'blackClub', 'HCMUS',
        'blackExternalId', '41',
        'blackIdType', 'swiss_start_rank_no',
        'sourceResult', '',
        'isBye', false
      ),
      jsonb_build_object(
        'board', 2,
        'whiteName', 'Lê Chi',
        'whiteClub', 'USCC',
        'whiteExternalId', '2',
        'whiteIdType', 'swiss_start_rank_no',
        'blackName', 'Bye',
        'blackClub', '',
        'blackExternalId', null,
        'blackIdType', 'unknown',
        'sourceResult', '1-0',
        'isBye', true
      )
    )
  );

  ASSERT v_imported = 2, 'Scenario 2 failed: Re-importing same pairings must succeed and return 2';

  -- 5. Scenario 3: Add new board (Board 3) to Round 1
  v_imported := public.uscc_import_chess_results(
    v_tourn_id,
    1,
    'smoke-test-round-1-add-board.xlsx',
    v_user_id,
    jsonb_build_array(
      jsonb_build_object(
        'board', 1,
        'whiteName', 'Nguyễn An',
        'whiteClub', 'USCC',
        'whiteExternalId', '1',
        'whiteIdType', 'swiss_start_rank_no',
        'blackName', 'Trần Bình',
        'blackClub', 'HCMUS',
        'blackExternalId', '41',
        'blackIdType', 'swiss_start_rank_no',
        'sourceResult', '',
        'isBye', false
      ),
      jsonb_build_object(
        'board', 2,
        'whiteName', 'Lê Chi',
        'whiteClub', 'USCC',
        'whiteExternalId', '2',
        'whiteIdType', 'swiss_start_rank_no',
        'blackName', 'Bye',
        'blackClub', '',
        'blackExternalId', null,
        'blackIdType', 'unknown',
        'sourceResult', '1-0',
        'isBye', true
      ),
      jsonb_build_object(
        'board', 3,
        'whiteName', 'Phạm Dũng',
        'whiteClub', 'USCC',
        'whiteExternalId', '3',
        'whiteIdType', 'swiss_start_rank_no',
        'blackName', 'Hoàng Em',
        'blackClub', 'HCMUS',
        'blackExternalId', '43',
        'blackIdType', 'swiss_start_rank_no',
        'sourceResult', '',
        'isBye', false
      )
    )
  );

  ASSERT v_imported = 3, 'Scenario 3 failed: Must import 3 rows including new board 3';

  SELECT EXISTS (
    SELECT 1 FROM public.matches
    WHERE tournament_id = v_tourn_id AND round_number = 1 AND board_number = 3
  ) INTO v_board3_exists;
  ASSERT v_board3_exists, 'Board 3 must exist in matches';

  -- 6. Scenario 4: Modify pairings on unreported board (Board 1)
  v_imported := public.uscc_import_chess_results(
    v_tourn_id,
    1,
    'smoke-test-round-1-modify-unreported.xlsx',
    v_user_id,
    jsonb_build_array(
      jsonb_build_object(
        'board', 1,
        'whiteName', 'Vũ Giang',
        'whiteClub', 'USCC',
        'whiteExternalId', '4',
        'whiteIdType', 'swiss_start_rank_no',
        'blackName', 'Đặng Hoa',
        'blackClub', 'HCMUS',
        'blackExternalId', '44',
        'blackIdType', 'swiss_start_rank_no',
        'sourceResult', '',
        'isBye', false
      ),
      jsonb_build_object(
        'board', 2,
        'whiteName', 'Lê Chi',
        'whiteClub', 'USCC',
        'whiteExternalId', '2',
        'whiteIdType', 'swiss_start_rank_no',
        'blackName', 'Bye',
        'blackClub', '',
        'blackExternalId', null,
        'blackIdType', 'unknown',
        'sourceResult', '1-0',
        'isBye', true
      ),
      jsonb_build_object(
        'board', 3,
        'whiteName', 'Phạm Dũng',
        'whiteClub', 'USCC',
        'whiteExternalId', '3',
        'whiteIdType', 'swiss_start_rank_no',
        'blackName', 'Hoàng Em',
        'blackClub', 'HCMUS',
        'blackExternalId', '43',
        'blackIdType', 'swiss_start_rank_no',
        'sourceResult', '',
        'isBye', false
      )
    )
  );

  ASSERT v_imported = 3, 'Scenario 4 failed: Modification on unreported board must succeed';

  SELECT pw.full_name INTO v_board1_white_name
  FROM public.matches m
  JOIN public.players pw ON pw.id = m.white_player_id
  WHERE m.tournament_id = v_tourn_id AND m.round_number = 1 AND m.board_number = 1;
  ASSERT v_board1_white_name = 'Vũ Giang', 'Board 1 white player must be updated to Vũ Giang';

  -- 7. Setup result for Scenario 5 & 6: Set Board 2 to 'official'
  UPDATE public.matches
  SET status = 'official',
      result_code = '1-0',
      result_kind = 'bye',
      white_confirmed_at = now(),
      black_confirmed_at = now(),
      updated_at = now()
  WHERE tournament_id = v_tourn_id AND round_number = 1 AND board_number = 2;

  -- 8. Scenario 5: Attempt to modify board with official result (Must be BLOCKED)
  BEGIN
    PERFORM public.uscc_import_chess_results(
      v_tourn_id,
      1,
      'smoke-test-round-1-illegal-modify.xlsx',
      v_user_id,
      jsonb_build_array(
        jsonb_build_object(
          'board', 1,
          'whiteName', 'Vũ Giang',
          'whiteClub', 'USCC',
          'whiteExternalId', '4',
          'whiteIdType', 'swiss_start_rank_no',
          'blackName', 'Đặng Hoa',
          'blackClub', 'HCMUS',
          'blackExternalId', '44',
          'blackIdType', 'swiss_start_rank_no',
          'sourceResult', '',
          'isBye', false
        ),
        jsonb_build_object(
          'board', 2,
          'whiteName', 'Người Khác Nào Đó',
          'whiteClub', 'USCC',
          'whiteExternalId', '99',
          'whiteIdType', 'swiss_start_rank_no',
          'blackName', 'Bye',
          'blackClub', '',
          'blackExternalId', null,
          'blackIdType', 'unknown',
          'sourceResult', '1-0',
          'isBye', true
        ),
        jsonb_build_object(
          'board', 3,
          'whiteName', 'Phạm Dũng',
          'whiteClub', 'USCC',
          'whiteExternalId', '3',
          'whiteIdType', 'swiss_start_rank_no',
          'blackName', 'Hoàng Em',
          'blackClub', 'HCMUS',
          'blackExternalId', '43',
          'blackIdType', 'swiss_start_rank_no',
          'sourceResult', '',
          'isBye', false
        )
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%CANNOT_OVERWRITE_MATCH_WITH_RESULTS%' THEN
        v_conflict_caught := true;
      ELSE
        RAISE;
      END IF;
  END;

  ASSERT v_conflict_caught, 'Scenario 5 failed: Must raise CANNOT_OVERWRITE_MATCH_WITH_RESULTS when modifying official board';

  -- 9. Scenario 6: Attempt to omit board with official result (Must be BLOCKED)
  BEGIN
    PERFORM public.uscc_import_chess_results(
      v_tourn_id,
      1,
      'smoke-test-round-1-illegal-omit.xlsx',
      v_user_id,
      jsonb_build_array(
        jsonb_build_object(
          'board', 1,
          'whiteName', 'Vũ Giang',
          'whiteClub', 'USCC',
          'whiteExternalId', '4',
          'whiteIdType', 'swiss_start_rank_no',
          'blackName', 'Đặng Hoa',
          'blackClub', 'HCMUS',
          'blackExternalId', '44',
          'blackIdType', 'swiss_start_rank_no',
          'sourceResult', '',
          'isBye', false
        ),
        jsonb_build_object(
          'board', 3,
          'whiteName', 'Phạm Dũng',
          'whiteClub', 'USCC',
          'whiteExternalId', '3',
          'whiteIdType', 'swiss_start_rank_no',
          'blackName', 'Hoàng Em',
          'blackClub', 'HCMUS',
          'blackExternalId', '43',
          'blackIdType', 'swiss_start_rank_no',
          'sourceResult', '',
          'isBye', false
        )
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%CANNOT_OMIT_MATCH_WITH_RESULTS%' THEN
        v_omit_caught := true;
      ELSE
        RAISE;
      END IF;
  END;

  ASSERT v_omit_caught, 'Scenario 6 failed: Must raise CANNOT_OMIT_MATCH_WITH_RESULTS when omitting official board';

  -- 10. Scenario 7: Multi-round player reuse by external_id in Round 2
  v_imported := public.uscc_import_chess_results(
    v_tourn_id,
    2,
    'smoke-test-round-2.xlsx',
    v_user_id,
    jsonb_build_array(
      jsonb_build_object(
        'board', 1,
        'whiteName', 'Đặng Hoa',
        'whiteClub', 'HCMUS',
        'whiteExternalId', '44',
        'whiteIdType', 'swiss_start_rank_no',
        'blackName', 'Vũ Giang',
        'blackClub', 'USCC',
        'blackExternalId', '4',
        'blackIdType', 'swiss_start_rank_no',
        'sourceResult', '',
        'isBye', false
      )
    )
  );

  ASSERT v_imported = 1, 'Scenario 7 failed: Round 2 must import 1 row reusing player 4 and 44 without constraint conflict';

  RAISE NOTICE 'Smoke test Migration 010 PASSED ALL 7 SCENARIOS successfully.';
END;
$$;

ROLLBACK;
