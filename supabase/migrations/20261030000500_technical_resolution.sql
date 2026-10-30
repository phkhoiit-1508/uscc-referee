CREATE FUNCTION public.uscc_resolve_dispute(
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
     OR p_result_kind IS NULL OR p_result_kind NOT IN ('normal', 'forfeit', 'absence', 'adjudicated', 'other') THEN
    RAISE EXCEPTION 'INVALID_RESULT';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND';
  END IF;
  IF v_match.status <> 'disputed' THEN
    RAISE EXCEPTION 'MATCH_NOT_DISPUTED';
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
    p_match_id, p_actor, 'result_approved',
    jsonb_build_object('result_code', v_match.result_code, 'result_kind', v_match.result_kind,
                       'status', v_match.status, 'white_confirmed_at', v_match.white_confirmed_at,
                       'black_confirmed_at', v_match.black_confirmed_at),
    jsonb_build_object('result_code', p_result_code, 'result_kind', p_result_kind, 'status', 'official'),
    v_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_resolve_dispute(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uscc_resolve_dispute(uuid, uuid, text, text, text)
  TO service_role;

CREATE FUNCTION public.uscc_reopen_result(
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
      result_kind = NULL,
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
