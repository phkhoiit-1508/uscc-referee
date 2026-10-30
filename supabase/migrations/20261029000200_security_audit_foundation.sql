-- Security and audit reconciliation for the existing USCC development schema.

-- The connection-check table is no longer part of the product flow.
DROP POLICY IF EXISTS read_connection_check ON public.connection_check;
REVOKE ALL ON TABLE public.connection_check FROM anon, authenticated;

-- Profiles are provisioned by trusted administration; referees only read their own row.
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;

CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY,
  entity_table text NOT NULL,
  entity_id text,
  action text NOT NULL,
  actor_user_id uuid,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT audit_log_action_check
    CHECK (action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])),
  CONSTRAINT audit_log_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX audit_log_entity_idx
  ON public.audit_log (entity_table, entity_id, created_at);
CREATE INDEX audit_log_actor_idx
  ON public.audit_log (actor_user_id, created_at);
CREATE INDEX audit_log_created_at_idx
  ON public.audit_log (created_at);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY technical_read_audit_log
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.role = 'technical'::text
    )
  );

REVOKE ALL ON TABLE public.audit_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.audit_log TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.uscc_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_set_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER matches_set_updated_at
BEFORE UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.uscc_set_updated_at();

CREATE OR REPLACE FUNCTION public.uscc_reject_append_only_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'APPEND_ONLY_TABLE';
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_reject_append_only_change()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW
EXECUTE FUNCTION public.uscc_reject_append_only_change();

CREATE TRIGGER result_events_append_only
BEFORE UPDATE OR DELETE ON public.result_events
FOR EACH ROW
EXECUTE FUNCTION public.uscc_reject_append_only_change();

-- Semantic result events may be inserted by trusted server operations, but never changed.
REVOKE ALL ON TABLE public.result_events FROM service_role;
GRANT SELECT, INSERT ON TABLE public.result_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.result_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.uscc_audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_reason text;
  v_old_data jsonb;
  v_new_data jsonb;
  v_entity_id text;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    BEGIN
      v_actor := nullif(
        current_setting('app.actor_user_id', true),
        ''
      )::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_actor := NULL;
    END;
  END IF;

  v_reason := nullif(
    current_setting('app.audit_reason', true),
    ''
  );

  IF TG_OP = 'INSERT' THEN
    v_new_data := to_jsonb(NEW);
    v_entity_id := v_new_data->>'id';
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_entity_id := COALESCE(v_new_data->>'id', v_old_data->>'id');
  ELSE
    v_old_data := to_jsonb(OLD);
    v_entity_id := v_old_data->>'id';
  END IF;

  INSERT INTO public.audit_log (
    entity_table,
    entity_id,
    action,
    actor_user_id,
    old_data,
    new_data,
    reason
  )
  VALUES (
    TG_TABLE_NAME,
    v_entity_id,
    TG_OP,
    v_actor,
    v_old_data,
    v_new_data,
    v_reason
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_audit_row()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER profiles_audit
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.uscc_audit_row();

CREATE TRIGGER tournaments_audit
AFTER INSERT OR UPDATE OR DELETE ON public.tournaments
FOR EACH ROW
EXECUTE FUNCTION public.uscc_audit_row();

CREATE TRIGGER players_audit
AFTER INSERT OR UPDATE OR DELETE ON public.players
FOR EACH ROW
EXECUTE FUNCTION public.uscc_audit_row();

CREATE TRIGGER matches_audit
AFTER INSERT OR UPDATE OR DELETE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.uscc_audit_row();

CREATE TRIGGER import_batches_audit
AFTER INSERT OR UPDATE OR DELETE ON public.import_batches
FOR EACH ROW
EXECUTE FUNCTION public.uscc_audit_row();

CREATE TRIGGER result_events_audit
AFTER INSERT ON public.result_events
FOR EACH ROW
EXECUTE FUNCTION public.uscc_audit_row();

-- The import RPC remains service-role-only. It now establishes trusted audit context
-- after proving that the supplied actor is a technical referee.
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
      status
    )
    VALUES (
      p_tournament_id,
      p_round,
      v_board,
      v_white_id,
      v_black_id,
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

REVOKE ALL ON FUNCTION public.uscc_import_chess_results(
  uuid,
  integer,
  text,
  uuid,
  jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uscc_import_chess_results(
  uuid,
  integer,
  text,
  uuid,
  jsonb
) TO service_role;
