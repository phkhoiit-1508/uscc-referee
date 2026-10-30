-- Recorder result submission and sequential White/Black confirmation.

-- uscc_submit_result: recorder submits result for an unreported/reopened match.
CREATE OR REPLACE FUNCTION public.uscc_submit_result(
  p_match_id uuid,
  p_actor uuid,
  p_result_code text,
  p_result_kind text DEFAULT 'normal'
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
  v_status text;
  v_tournament_id uuid;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = p_actor;
  IF v_role NOT IN ('technical', 'recorder') THEN
    RAISE EXCEPTION 'REFEREE_REQUIRED';
  END IF;

  SELECT status, tournament_id INTO v_status, v_tournament_id
  FROM public.matches WHERE id = p_match_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND';
  END IF;

  IF v_status NOT IN ('unreported', 'reopened') THEN
    RAISE EXCEPTION 'MATCH_NOT_SUBMITTABLE';
  END IF;

  IF p_result_code NOT IN ('1-0', '0-1', '1/2-1/2') THEN
    RAISE EXCEPTION 'INVALID_RESULT_CODE';
  END IF;

  IF p_result_kind NOT IN ('normal', 'bye', 'forfeit', 'absence', 'adjudicated', 'other') THEN
    RAISE EXCEPTION 'INVALID_RESULT_KIND';
  END IF;

  PERFORM set_config('app.actor_user_id', p_actor::text, true);
  PERFORM set_config('app.audit_reason', 'Result submitted', true);

  UPDATE public.matches SET
    result_code = p_result_code,
    result_kind = p_result_kind,
    status = 'pending_white',
    entered_by = p_actor,
    white_confirmed_at = NULL,
    black_confirmed_at = NULL,
    updated_at = now()
  WHERE id = p_match_id;

  INSERT INTO public.result_events (match_id, actor_user_id, event_type, new_data)
  VALUES (
    p_match_id,
    p_actor,
    'result_submitted',
    jsonb_build_object('result_code', p_result_code, 'result_kind', p_result_kind)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_submit_result(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uscc_submit_result(uuid, uuid, text, text)
  TO service_role;


-- uscc_confirm_result: recorder facilitates White then Black confirmation.
-- player_side must be 'white' or 'black'. Black only allowed after White.
CREATE OR REPLACE FUNCTION public.uscc_confirm_result(
  p_match_id uuid,
  p_actor uuid,
  p_player_side text,
  p_agreed boolean
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
  v_status text;
  v_new_status text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = p_actor;
  IF v_role NOT IN ('technical', 'recorder') THEN
    RAISE EXCEPTION 'REFEREE_REQUIRED';
  END IF;

  IF p_player_side NOT IN ('white', 'black') THEN
    RAISE EXCEPTION 'INVALID_PLAYER_SIDE';
  END IF;

  SELECT status INTO v_status FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND';
  END IF;

  IF p_player_side = 'white' AND v_status <> 'pending_white' THEN
    RAISE EXCEPTION 'CONFIRMATION_OUT_OF_ORDER';
  END IF;
  IF p_player_side = 'black' AND v_status <> 'pending_black' THEN
    RAISE EXCEPTION 'CONFIRMATION_OUT_OF_ORDER';
  END IF;

  PERFORM set_config('app.actor_user_id', p_actor::text, true);

  IF NOT p_agreed THEN
    -- Player disputed — escalate to technical
    PERFORM set_config('app.audit_reason', 'Player disagreed', true);
    UPDATE public.matches SET status = 'disputed', updated_at = now() WHERE id = p_match_id;
    INSERT INTO public.result_events (match_id, actor_user_id, event_type, player_side)
    VALUES (p_match_id, p_actor, 'player_disagreed', p_player_side);
    RETURN;
  END IF;

  IF p_player_side = 'white' THEN
    v_new_status := 'pending_black';
    PERFORM set_config('app.audit_reason', 'White confirmed', true);
    UPDATE public.matches SET
      status = 'pending_black',
      white_confirmed_at = now(),
      updated_at = now()
    WHERE id = p_match_id;
  ELSE
    v_new_status := 'official';
    PERFORM set_config('app.audit_reason', 'Black confirmed — result official', true);
    UPDATE public.matches SET
      status = 'official',
      black_confirmed_at = now(),
      updated_at = now()
    WHERE id = p_match_id;
  END IF;

  INSERT INTO public.result_events (match_id, actor_user_id, event_type, player_side)
  VALUES (p_match_id, p_actor, 'player_confirmed', p_player_side);
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_confirm_result(uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uscc_confirm_result(uuid, uuid, text, boolean)
  TO service_role;


-- RLS: referees (both roles) can read matches and players for their tournaments.
-- Technical can also update matches via RPCs (service_role bypasses RLS).
DROP POLICY IF EXISTS referee_read_matches ON public.matches;
CREATE POLICY referee_read_matches ON public.matches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('technical', 'recorder')
    )
  );

DROP POLICY IF EXISTS referee_read_players ON public.players;
CREATE POLICY referee_read_players ON public.players
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('technical', 'recorder')
    )
  );

DROP POLICY IF EXISTS referee_read_tournaments ON public.tournaments;
CREATE POLICY referee_read_tournaments ON public.tournaments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('technical', 'recorder')
    )
  );

DROP POLICY IF EXISTS referee_read_result_events ON public.result_events;
CREATE POLICY referee_read_result_events ON public.result_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
        AND role IN ('technical', 'recorder')
    )
  );
