ALTER TABLE public.matches
DROP CONSTRAINT matches_result_kind_check;

ALTER TABLE public.matches
ADD CONSTRAINT matches_result_kind_check
CHECK (
  result_kind IS NULL
  OR result_kind = ANY (
    ARRAY[
      'normal'::text,
      'resignation'::text,
      'bye'::text,
      'forfeit'::text,
      'absence'::text,
      'adjudicated'::text,
      'other'::text
    ]
  )
);

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
  v_next_status text;
  v_event_type text;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = p_actor;
  IF v_role NOT IN ('technical', 'recorder') THEN
    RAISE EXCEPTION 'REFEREE_REQUIRED';
  END IF;

  SELECT status INTO v_status
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

  IF p_result_kind NOT IN ('normal', 'resignation', 'forfeit', 'absence', 'other') THEN
    RAISE EXCEPTION 'INVALID_RESULT_KIND';
  END IF;

  IF p_result_kind IN ('normal', 'resignation') THEN
    v_next_status := 'pending_white';
    v_event_type := 'result_submitted';
  ELSE
    v_next_status := 'special_review';
    v_event_type := 'special_marked';
  END IF;

  PERFORM set_config('app.actor_user_id', p_actor::text, true);
  PERFORM set_config('app.audit_reason', 'Result submitted', true);

  UPDATE public.matches SET
    result_code = p_result_code,
    result_kind = p_result_kind,
    status = v_next_status,
    entered_by = p_actor,
    white_confirmed_at = NULL,
    black_confirmed_at = NULL
  WHERE id = p_match_id;

  INSERT INTO public.result_events (match_id, actor_user_id, event_type, new_data)
  VALUES (
    p_match_id,
    p_actor,
    v_event_type,
    jsonb_build_object(
      'result_code', p_result_code,
      'result_kind', p_result_kind,
      'status', v_next_status
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_submit_result(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uscc_submit_result(uuid, uuid, text, text)
  TO service_role;

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
     OR p_result_kind NOT IN ('normal', 'resignation', 'forfeit', 'absence', 'adjudicated', 'other') THEN
    RAISE EXCEPTION 'INVALID_RESULT';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND';
  END IF;
  IF v_match.status NOT IN ('disputed', 'special_review') THEN
    RAISE EXCEPTION 'MATCH_NOT_REVIEWABLE';
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
