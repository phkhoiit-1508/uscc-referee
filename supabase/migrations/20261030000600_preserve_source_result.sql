-- Preserve Chess-Results text separately from the referee-entered result.
ALTER TABLE public.matches ADD COLUMN source_result text;

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
  v_white_id uuid;
  v_black_id uuid;
  v_board integer;
  v_count integer := 0;
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
  PERFORM set_config('app.audit_reason', 'Chess-Results pairing import', true);

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

  IF EXISTS (
    SELECT 1
    FROM public.matches
    WHERE tournament_id = p_tournament_id
      AND round_number = p_round
  ) THEN
    RAISE EXCEPTION 'ROUND_ALREADY_HAS_MATCHES';
  END IF;

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

    IF nullif(btrim(item->>'whiteName'), '') IS NULL
       OR nullif(btrim(item->>'blackName'), '') IS NULL THEN
      RAISE EXCEPTION 'MISSING_PLAYER_NAME';
    END IF;

    INSERT INTO public.players (
      tournament_id,
      external_id,
      full_name,
      club
    )
    VALUES (
      p_tournament_id,
      NULL,
      btrim(item->>'whiteName'),
      nullif(btrim(coalesce(item->>'whiteClub', '')), '')
    )
    RETURNING id INTO v_white_id;

    INSERT INTO public.players (
      tournament_id,
      external_id,
      full_name,
      club
    )
    VALUES (
      p_tournament_id,
      NULL,
      btrim(item->>'blackName'),
      nullif(btrim(coalesce(item->>'blackClub', '')), '')
    )
    RETURNING id INTO v_black_id;

    INSERT INTO public.matches (
      tournament_id,
      round_number,
      board_number,
      white_player_id,
      black_player_id,
      source_result,
      status
    )
    VALUES (
      p_tournament_id,
      p_round,
      v_board,
      v_white_id,
      v_black_id,
      nullif(btrim(coalesce(item->>'sourceResult', '')), ''),
      'unreported'
    );

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
