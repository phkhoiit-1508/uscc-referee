-- Migration 010: Swiss-Manager Integration & Source ID Tracking
-- Adds source_id_type to players to track whether an ID is Start-Rank No (SNo), Ident No, Unique ID, or FIDE ID.

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS source_id_type text DEFAULT 'unknown';

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_source_id_type_check;

ALTER TABLE public.players
  ADD CONSTRAINT players_source_id_type_check
  CHECK (source_id_type IS NULL OR source_id_type IN ('swiss_start_rank_no', 'swiss_ident_no', 'swiss_unique_id', 'fide_id', 'unknown'));

-- Update uscc_import_chess_results to persist external_id and source_id_type when provided
CREATE OR REPLACE FUNCTION public.uscc_import_chess_results(
  p_tournament_id uuid,
  p_round integer,
  p_filename text,
  p_actor uuid,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_total_rounds integer;
  v_role text;
  item jsonb;
  v_incoming_board_item jsonb;
  v_existing_match record;
  v_existing_id uuid;
  v_existing_status text;
  v_existing_result_code text;
  v_white_id uuid;
  v_black_id uuid;
  v_board integer;
  v_count integer := 0;
  v_is_bye boolean;
  v_white_id_type text;
  v_black_id_type text;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tournament_id::text || ':' || p_round::text, 0)
  );

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_actor;

  IF v_role IS DISTINCT FROM 'technical' THEN
    RAISE EXCEPTION 'TECHNICAL_REFEREE_REQUIRED';
  END IF;

  PERFORM set_config('app.actor_user_id', p_actor::text, true);
  PERFORM set_config('app.audit_reason', 'Chess-Results/Swiss-Manager pairing import', true);

  SELECT total_rounds INTO v_total_rounds
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND';
  END IF;

  IF p_round < 1 OR p_round > v_total_rounds THEN
    RAISE EXCEPTION 'ROUND_OUT_OF_RANGE';
  END IF;

  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_PAIRING_ROWS';
  END IF;

  IF jsonb_array_length(p_rows) < 1
     OR jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'INVALID_PAIRING_ROWS';
  END IF;

  -- Step 1: Pre-validation to protect existing matches that already have active or official results.
  -- Cannot omit or change players of any match with status != 'unreported' or result_code IS NOT NULL.
  FOR v_existing_match IN
    SELECT
      m.id,
      m.board_number,
      m.status,
      m.result_code,
      m.white_player_id,
      m.black_player_id,
      pw.full_name AS white_name,
      pw.external_id AS white_external_id,
      pb.full_name AS black_name,
      pb.external_id AS black_external_id
    FROM public.matches m
    LEFT JOIN public.players pw ON pw.id = m.white_player_id
    LEFT JOIN public.players pb ON pb.id = m.black_player_id
    WHERE m.tournament_id = p_tournament_id
      AND m.round_number = p_round
  LOOP
    IF v_existing_match.status <> 'unreported' OR v_existing_match.result_code IS NOT NULL THEN
      -- Find matching incoming board in p_rows
      SELECT value INTO v_incoming_board_item
      FROM jsonb_array_elements(p_rows)
      WHERE (value->>'board')::integer = v_existing_match.board_number
      LIMIT 1;

      IF v_incoming_board_item IS NULL THEN
        RAISE EXCEPTION 'CANNOT_OMIT_MATCH_WITH_RESULTS: Board % has status % but is missing from incoming file',
          v_existing_match.board_number, v_existing_match.status;
      END IF;

      -- Check if incoming players match the existing match players
      IF lower(btrim(v_incoming_board_item->>'whiteName')) <> lower(btrim(coalesce(v_existing_match.white_name, '')))
         OR (
           coalesce((v_incoming_board_item->>'isBye')::boolean, false) = false
           AND (
             v_existing_match.black_player_id IS NULL
             OR lower(btrim(v_incoming_board_item->>'blackName')) <> lower(btrim(coalesce(v_existing_match.black_name, '')))
           )
         )
         OR (
           coalesce((v_incoming_board_item->>'isBye')::boolean, false) = true
           AND v_existing_match.black_player_id IS NOT NULL
         )
         OR (
           nullif(btrim(coalesce(v_incoming_board_item->>'whiteExternalId', '')), '') IS NOT NULL
           AND v_existing_match.white_external_id IS NOT NULL
           AND btrim(v_incoming_board_item->>'whiteExternalId') <> v_existing_match.white_external_id
         )
         OR (
           nullif(btrim(coalesce(v_incoming_board_item->>'blackExternalId', '')), '') IS NOT NULL
           AND v_existing_match.black_external_id IS NOT NULL
           AND btrim(v_incoming_board_item->>'blackExternalId') <> v_existing_match.black_external_id
         )
      THEN
        RAISE EXCEPTION 'CANNOT_OVERWRITE_MATCH_WITH_RESULTS: Board % already has status % and cannot change players',
          v_existing_match.board_number, v_existing_match.status;
      END IF;
    END IF;
  END LOOP;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(item->'board') <> 'number' THEN
      RAISE EXCEPTION 'INVALID_BOARD';
    END IF;

    v_board := (item->>'board')::integer;

    IF v_board < 1 OR v_board > 500 THEN
      RAISE EXCEPTION 'INVALID_BOARD';
    END IF;

    IF nullif(btrim(item->>'whiteName'), '') IS NULL THEN
      RAISE EXCEPTION 'MISSING_PLAYER_NAME';
    END IF;

    v_is_bye := coalesce((item->>'isBye')::boolean, false);
    IF NOT v_is_bye AND nullif(btrim(item->>'blackName'), '') IS NULL THEN
      RAISE EXCEPTION 'MISSING_PLAYER_NAME';
    END IF;

    v_white_id := NULL;
    v_black_id := NULL;

    v_white_id_type := coalesce(nullif(btrim(item->>'whiteIdType'), ''), 'unknown');
    v_black_id_type := coalesce(nullif(btrim(item->>'blackIdType'), ''), 'unknown');

    -- Re-use existing player record if external_id is already registered in this tournament
    IF nullif(btrim(coalesce(item->>'whiteExternalId', '')), '') IS NOT NULL THEN
      SELECT id INTO v_white_id
      FROM public.players
      WHERE tournament_id = p_tournament_id
        AND external_id = btrim(item->>'whiteExternalId')
      LIMIT 1;
    END IF;

    IF v_white_id IS NULL THEN
      INSERT INTO public.players (
        tournament_id,
        external_id,
        source_id_type,
        full_name,
        club
      )
      VALUES (
        p_tournament_id,
        nullif(btrim(coalesce(item->>'whiteExternalId', '')), ''),
        v_white_id_type,
        btrim(item->>'whiteName'),
        nullif(btrim(coalesce(item->>'whiteClub', '')), '')
      )
      RETURNING id INTO v_white_id;
    END IF;

    IF v_is_bye THEN
      v_black_id := NULL;
    ELSE
      IF nullif(btrim(coalesce(item->>'blackExternalId', '')), '') IS NOT NULL THEN
        SELECT id INTO v_black_id
        FROM public.players
        WHERE tournament_id = p_tournament_id
          AND external_id = btrim(item->>'blackExternalId')
        LIMIT 1;
      END IF;

      IF v_black_id IS NULL THEN
        INSERT INTO public.players (
          tournament_id,
          external_id,
          source_id_type,
          full_name,
          club
        )
        VALUES (
          p_tournament_id,
          nullif(btrim(coalesce(item->>'blackExternalId', '')), ''),
          v_black_id_type,
          btrim(item->>'blackName'),
          nullif(btrim(coalesce(item->>'blackClub', '')), '')
        )
        RETURNING id INTO v_black_id;
      END IF;
    END IF;

    -- Check if match record already exists for this board
    SELECT id, status, result_code INTO v_existing_id, v_existing_status, v_existing_result_code
    FROM public.matches
    WHERE tournament_id = p_tournament_id
      AND round_number = p_round
      AND board_number = v_board
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      -- New board insertion
      INSERT INTO public.matches (
        tournament_id,
        round_number,
        board_number,
        white_player_id,
        black_player_id,
        source_result,
        result_kind,
        status
      )
      VALUES (
        p_tournament_id,
        p_round,
        v_board,
        v_white_id,
        v_black_id,
        nullif(btrim(coalesce(item->>'sourceResult', '')), ''),
        CASE WHEN v_is_bye THEN 'bye'::text ELSE NULL END,
        'unreported'
      );
    ELSIF v_existing_status = 'unreported' AND v_existing_result_code IS NULL THEN
      -- Safe pairing update on unreported match
      UPDATE public.matches
      SET white_player_id = v_white_id,
          black_player_id = v_black_id,
          result_kind = CASE WHEN v_is_bye THEN 'bye'::text ELSE NULL END,
          source_result = nullif(btrim(coalesce(item->>'sourceResult', '')), ''),
          updated_at = now()
      WHERE id = v_existing_id;
    ELSE
      -- Match already has result; preserve status and result, only update source_result metadata if provided
      UPDATE public.matches
      SET source_result = coalesce(nullif(btrim(coalesce(item->>'sourceResult', '')), ''), source_result),
          updated_at = now()
      WHERE id = v_existing_id;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.import_batches (
    tournament_id,
    round_number,
    file_name,
    file_source,
    status,
    imported_rows,
    imported_by
  )
  VALUES (
    p_tournament_id,
    p_round,
    left(p_filename, 255),
    'chess_results',
    'committed',
    v_count,
    p_actor
  );

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_import_chess_results(uuid, integer, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uscc_import_chess_results(uuid, integer, text, uuid, jsonb) TO service_role;

-- Ensure uscc_resolve_dispute, uscc_reopen_result, and uscc_cancel_result safely handle bye boards (black_player_id IS NULL)
CREATE OR REPLACE FUNCTION public.uscc_resolve_dispute(
  p_match_id uuid,
  p_actor uuid,
  p_result_code text,
  p_result_kind text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_match public.matches%ROWTYPE;
  v_reason text;
BEGIN
  IF (SELECT role FROM public.profiles WHERE id = p_actor) IS DISTINCT FROM 'technical' THEN
    RAISE EXCEPTION 'TECHNICAL_REFEREE_REQUIRED';
  END IF;

  v_reason := nullif(btrim(p_reason), '');
  IF v_reason IS NULL OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  IF p_result_code IS NULL OR p_result_code NOT IN ('1-0', '0-1', '1/2-1/2')
     OR p_result_kind IS NULL
     OR p_result_kind NOT IN ('normal', 'resignation', 'bye', 'forfeit', 'absence', 'adjudicated', 'other') THEN
    RAISE EXCEPTION 'INVALID_RESULT';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND';
  END IF;
  IF v_match.status NOT IN ('disputed', 'special_review') THEN
    RAISE EXCEPTION 'MATCH_NOT_REVIEWABLE';
  END IF;
  IF v_match.black_player_id IS NULL AND p_result_kind <> 'bye' THEN
    RAISE EXCEPTION 'INVALID_RESULT';
  END IF;

  PERFORM set_config('app.actor_user_id', p_actor::text, true);
  PERFORM set_config('app.audit_reason', v_reason, true);

  UPDATE public.matches
  SET result_code = p_result_code,
      result_kind = p_result_kind,
      status = 'official',
      white_confirmed_at = NULL,
      black_confirmed_at = NULL
  WHERE id = p_match_id;

  INSERT INTO public.result_events (match_id, actor_user_id, event_type, old_data, new_data, reason)
  VALUES (
    p_match_id,
    p_actor,
    'result_approved',
    jsonb_build_object(
      'result_code', v_match.result_code,
      'result_kind', v_match.result_kind,
      'status', v_match.status,
      'white_confirmed_at', v_match.white_confirmed_at,
      'black_confirmed_at', v_match.black_confirmed_at
    ),
    jsonb_build_object(
      'result_code', p_result_code,
      'result_kind', p_result_kind,
      'status', 'official'
    ),
    v_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_resolve_dispute(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uscc_resolve_dispute(uuid, uuid, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.uscc_reopen_result(
  p_match_id uuid,
  p_actor uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_match public.matches%ROWTYPE;
  v_reason text;
BEGIN
  IF (SELECT role FROM public.profiles WHERE id = p_actor) IS DISTINCT FROM 'technical' THEN
    RAISE EXCEPTION 'TECHNICAL_REFEREE_REQUIRED';
  END IF;

  v_reason := nullif(btrim(p_reason), '');
  IF v_reason IS NULL OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND';
  END IF;
  IF v_match.status <> 'official' THEN
    RAISE EXCEPTION 'MATCH_NOT_OFFICIAL';
  END IF;

  PERFORM set_config('app.actor_user_id', p_actor::text, true);
  PERFORM set_config('app.audit_reason', v_reason, true);

  UPDATE public.matches
  SET status = 'reopened',
      result_code = NULL,
      result_kind = CASE WHEN black_player_id IS NULL THEN 'bye'::text ELSE NULL END,
      white_confirmed_at = NULL,
      black_confirmed_at = NULL,
      entered_by = NULL
  WHERE id = p_match_id;

  INSERT INTO public.result_events (match_id, actor_user_id, event_type, old_data, new_data, reason)
  VALUES (
    p_match_id, p_actor, 'result_reopened',
    jsonb_build_object('result_code', v_match.result_code, 'result_kind', v_match.result_kind,
                       'status', v_match.status, 'white_confirmed_at', v_match.white_confirmed_at,
                       'black_confirmed_at', v_match.black_confirmed_at, 'entered_by', v_match.entered_by),
    jsonb_build_object('status', 'reopened'), v_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_reopen_result(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uscc_reopen_result(uuid, uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.uscc_cancel_result(
  p_match_id uuid,
  p_actor uuid,
  p_expected_status text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_match public.matches%ROWTYPE;
  v_reason text;
BEGIN
  IF (SELECT role FROM public.profiles WHERE id = p_actor) IS DISTINCT FROM 'technical' THEN
    RAISE EXCEPTION 'TECHNICAL_REFEREE_REQUIRED';
  END IF;

  v_reason := nullif(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL OR length(v_reason) > 1000 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND';
  END IF;

  IF v_match.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'MATCH_STATE_CHANGED';
  END IF;

  IF v_match.status NOT IN ('pending_white', 'pending_black', 'disputed', 'special_review', 'official') THEN
    RAISE EXCEPTION 'MATCH_NOT_CANCELLABLE';
  END IF;

  PERFORM set_config('app.actor_user_id', p_actor::text, true);
  PERFORM set_config('app.audit_reason', v_reason, true);

  UPDATE public.matches
  SET status = 'unreported',
      result_code = NULL,
      result_kind = CASE WHEN black_player_id IS NULL THEN 'bye'::text ELSE NULL END,
      white_confirmed_at = NULL,
      black_confirmed_at = NULL,
      entered_by = NULL
  WHERE id = p_match_id;

  INSERT INTO public.result_events (match_id, actor_user_id, event_type, old_data, new_data, reason)
  VALUES (
    p_match_id,
    p_actor,
    'result_cancelled',
    jsonb_build_object(
      'status', v_match.status,
      'result_code', v_match.result_code,
      'result_kind', v_match.result_kind,
      'white_confirmed_at', v_match.white_confirmed_at,
      'black_confirmed_at', v_match.black_confirmed_at,
      'entered_by', v_match.entered_by
    ),
    jsonb_build_object('status', 'unreported'),
    v_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_cancel_result(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uscc_cancel_result(uuid, uuid, text, text)
  TO service_role;

