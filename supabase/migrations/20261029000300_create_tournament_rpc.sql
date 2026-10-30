-- Trusted tournament creation RPC. Browser roles cannot execute it directly.

ALTER TABLE public.tournaments
ADD CONSTRAINT tournaments_primary_color_check
CHECK (
  primary_color IS NULL
  OR primary_color ~ '^#[0-9A-Fa-f]{6}$'
);

CREATE OR REPLACE FUNCTION public.uscc_create_tournament(
  p_actor uuid,
  p_name text,
  p_organizer text DEFAULT NULL,
  p_venue text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_total_rounds integer DEFAULT 1,
  p_timezone text DEFAULT 'Asia/Ho_Chi_Minh',
  p_logo_url text DEFAULT NULL,
  p_primary_color text DEFAULT '#172C4C'
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
  v_tournament_id uuid;
  v_name text;
  v_timezone text;
  v_primary_color text;
BEGIN
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_actor;

  IF v_role IS DISTINCT FROM 'technical' THEN
    RAISE EXCEPTION 'TECHNICAL_REFEREE_REQUIRED';
  END IF;

  v_name := nullif(btrim(p_name), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'TOURNAMENT_NAME_REQUIRED';
  END IF;
  IF length(v_name) > 200 THEN
    RAISE EXCEPTION 'TOURNAMENT_NAME_TOO_LONG';
  END IF;

  IF p_total_rounds IS NULL
     OR p_total_rounds < 1
     OR p_total_rounds > 30 THEN
    RAISE EXCEPTION 'TOTAL_ROUNDS_OUT_OF_RANGE';
  END IF;

  IF p_start_date IS NOT NULL
     AND p_end_date IS NOT NULL
     AND p_end_date < p_start_date THEN
    RAISE EXCEPTION 'INVALID_TOURNAMENT_DATES';
  END IF;

  v_timezone := COALESCE(nullif(btrim(p_timezone), ''), 'Asia/Ho_Chi_Minh');
  IF NOT EXISTS (
    SELECT 1
    FROM pg_timezone_names
    WHERE name = v_timezone
  ) THEN
    RAISE EXCEPTION 'INVALID_TIMEZONE';
  END IF;

  v_primary_color := COALESCE(
    nullif(btrim(p_primary_color), ''),
    '#172C4C'
  );
  IF v_primary_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'INVALID_PRIMARY_COLOR';
  END IF;

  PERFORM set_config('app.actor_user_id', p_actor::text, true);
  PERFORM set_config('app.audit_reason', 'Tournament created', true);

  INSERT INTO public.tournaments (
    name,
    organizer,
    venue,
    start_date,
    end_date,
    total_rounds,
    timezone,
    logo_url,
    primary_color,
    created_by
  )
  VALUES (
    v_name,
    nullif(btrim(COALESCE(p_organizer, '')), ''),
    nullif(btrim(COALESCE(p_venue, '')), ''),
    p_start_date,
    p_end_date,
    p_total_rounds,
    v_timezone,
    nullif(btrim(COALESCE(p_logo_url, '')), ''),
    v_primary_color,
    p_actor
  )
  RETURNING id INTO v_tournament_id;

  RETURN v_tournament_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_create_tournament(
  uuid,
  text,
  text,
  text,
  date,
  date,
  integer,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uscc_create_tournament(
  uuid,
  text,
  text,
  text,
  date,
  date,
  integer,
  text,
  text,
  text
) TO service_role;
