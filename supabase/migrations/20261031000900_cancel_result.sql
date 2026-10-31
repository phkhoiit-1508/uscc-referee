-- FR-08: technical referees cancel a pending or official result.
-- A cancelled match returns to 'unreported' so the existing submit -> White -> Black
-- flow is reused. Nothing is deleted: the cancellation is recorded in result_events
-- (event 'result_cancelled') and, via the matches_audit trigger, in audit_log.

ALTER TABLE public.result_events
DROP CONSTRAINT result_events_event_type_check;

ALTER TABLE public.result_events
ADD CONSTRAINT result_events_event_type_check
CHECK (
  event_type = ANY (
    ARRAY[
      'result_submitted'::text,
      'player_confirmed'::text,
      'player_disagreed'::text,
      'result_approved'::text,
      'result_reopened'::text,
      'result_corrected'::text,
      'special_marked'::text,
      'result_cancelled'::text
    ]
  )
);

CREATE FUNCTION public.uscc_cancel_result(
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

  -- Row lock serialises concurrent cancel / confirm / resolve calls on this match.
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND';
  END IF;

  -- The referee must cancel the state they actually saw; a repeated or stale
  -- request is rejected instead of cancelling a newer result.
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
      result_kind = NULL,
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

