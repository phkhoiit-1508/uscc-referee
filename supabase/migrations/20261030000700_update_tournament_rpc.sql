CREATE FUNCTION public.uscc_update_tournament(
  p_tournament_id uuid,
  p_actor uuid,
  p_name text,
  p_organizer text DEFAULT NULL,
  p_venue text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_total_rounds integer DEFAULT 1,
  p_logo_url text DEFAULT NULL,
  p_primary_color text DEFAULT '#172C4C'
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_name text;
  v_primary_color text;
  v_logo_url text;
  v_highest_round integer;
BEGIN
  IF (SELECT role FROM public.profiles WHERE id = p_actor) IS DISTINCT FROM 'technical' THEN
    RAISE EXCEPTION 'TECHNICAL_REFEREE_REQUIRED';
  END IF;

  PERFORM 1 FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND';
  END IF;

  v_name := nullif(btrim(p_name), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'TOURNAMENT_NAME_REQUIRED';
  END IF;
  IF length(v_name) > 200 THEN
    RAISE EXCEPTION 'TOURNAMENT_NAME_TOO_LONG';
  END IF;

  IF p_total_rounds IS NULL OR p_total_rounds < 1 OR p_total_rounds > 30 THEN
    RAISE EXCEPTION 'TOTAL_ROUNDS_OUT_OF_RANGE';
  END IF;

  SELECT max(round_number) INTO v_highest_round
  FROM public.matches
  WHERE tournament_id = p_tournament_id;

  IF v_highest_round IS NOT NULL AND p_total_rounds < v_highest_round THEN
    RAISE EXCEPTION 'TOTAL_ROUNDS_BELOW_EXISTING_ROUND';
  END IF;

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
    RAISE EXCEPTION 'INVALID_TOURNAMENT_DATES';
  END IF;

  v_logo_url := nullif(btrim(COALESCE(p_logo_url, '')), '');
  IF v_logo_url IS NOT NULL AND (length(v_logo_url) > 2048 OR v_logo_url !~ '^https?://') THEN
    RAISE EXCEPTION 'INVALID_LOGO_URL';
  END IF;

  v_primary_color := COALESCE(nullif(btrim(p_primary_color), ''), '#172C4C');
  IF v_primary_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'INVALID_PRIMARY_COLOR';
  END IF;

  PERFORM set_config('app.actor_user_id', p_actor::text, true);
  PERFORM set_config('app.audit_reason', 'Tournament updated', true);

  UPDATE public.tournaments
  SET name = v_name,
      organizer = nullif(btrim(COALESCE(p_organizer, '')), ''),
      venue = nullif(btrim(COALESCE(p_venue, '')), ''),
      start_date = p_start_date,
      end_date = p_end_date,
      total_rounds = p_total_rounds,
      logo_url = v_logo_url,
      primary_color = v_primary_color
  WHERE id = p_tournament_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_update_tournament(
  uuid, uuid, text, text, text, date, date, integer, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uscc_update_tournament(
  uuid, uuid, text, text, text, date, date, integer, text, text
) TO service_role;
