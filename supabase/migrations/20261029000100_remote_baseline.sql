-- Baseline reconstructed from the linked development project on 2026-10-29.
-- Do not execute this migration against that existing project: its objects already exist.
-- Mark it as applied there after review; fresh environments should execute it normally.

CREATE TABLE public.connection_check (
  id integer NOT NULL,
  message text NOT NULL,
  CONSTRAINT connection_check_pkey PRIMARY KEY (id)
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_role_check
    CHECK (role = ANY (ARRAY['technical'::text, 'recorder'::text]))
);

CREATE TABLE public.tournaments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  organizer text,
  venue text,
  start_date date,
  end_date date,
  total_rounds integer NOT NULL DEFAULT 1,
  timezone text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh'::text,
  logo_url text,
  primary_color text DEFAULT '#172C4C'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tournaments_pkey PRIMARY KEY (id),
  CONSTRAINT tournaments_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT tournaments_total_rounds_check
    CHECK (total_rounds >= 1 AND total_rounds <= 30),
  CONSTRAINT valid_tournament_dates
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT valid_tournament_name
    CHECK (length(TRIM(BOTH FROM name)) > 0)
);

CREATE TABLE public.players (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  external_id text,
  full_name text NOT NULL,
  club text,
  rating integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT players_pkey PRIMARY KEY (id),
  CONSTRAINT players_tournament_id_fkey
    FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT players_rating_check
    CHECK (rating IS NULL OR rating >= 0),
  CONSTRAINT valid_player_name
    CHECK (length(TRIM(BOTH FROM full_name)) > 0),
  CONSTRAINT unique_player_external_id
    UNIQUE (tournament_id, external_id),
  CONSTRAINT unique_player_tournament_pair
    UNIQUE (tournament_id, id)
);

CREATE TABLE public.matches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  round_number integer NOT NULL,
  board_number integer NOT NULL,
  white_player_id uuid NOT NULL,
  black_player_id uuid,
  result_code text,
  result_kind text,
  status text NOT NULL DEFAULT 'unreported'::text,
  white_confirmed_at timestamp with time zone,
  black_confirmed_at timestamp with time zone,
  entered_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT matches_pkey PRIMARY KEY (id),
  CONSTRAINT matches_tournament_id_fkey
    FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT white_same_tournament
    FOREIGN KEY (tournament_id, white_player_id)
    REFERENCES public.players(tournament_id, id),
  CONSTRAINT black_same_tournament
    FOREIGN KEY (tournament_id, black_player_id)
    REFERENCES public.players(tournament_id, id),
  CONSTRAINT matches_entered_by_fkey
    FOREIGN KEY (entered_by) REFERENCES auth.users(id),
  CONSTRAINT matches_board_number_check
    CHECK (board_number > 0),
  CONSTRAINT matches_round_number_check
    CHECK (round_number > 0),
  CONSTRAINT different_opponents
    CHECK (black_player_id IS NULL OR white_player_id <> black_player_id),
  CONSTRAINT matches_result_code_check
    CHECK (
      result_code IS NULL
      OR result_code = ANY (
        ARRAY['1-0'::text, '0-1'::text, '1/2-1/2'::text]
      )
    ),
  CONSTRAINT matches_result_kind_check
    CHECK (
      result_kind IS NULL
      OR result_kind = ANY (
        ARRAY[
          'normal'::text,
          'bye'::text,
          'forfeit'::text,
          'absence'::text,
          'adjudicated'::text,
          'other'::text
        ]
      )
    ),
  CONSTRAINT matches_status_check
    CHECK (
      status = ANY (
        ARRAY[
          'unreported'::text,
          'pending_white'::text,
          'pending_black'::text,
          'disputed'::text,
          'special_review'::text,
          'official'::text,
          'reopened'::text
        ]
      )
    ),
  CONSTRAINT valid_missing_black
    CHECK (
      black_player_id IS NOT NULL
      OR COALESCE(result_kind = 'bye'::text, false)
    ),
  CONSTRAINT unique_match_board
    UNIQUE (tournament_id, round_number, board_number)
);

CREATE TABLE public.import_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL,
  round_number integer NOT NULL,
  file_name text NOT NULL,
  file_source text NOT NULL DEFAULT 'unknown'::text,
  status text NOT NULL DEFAULT 'previewed'::text,
  imported_rows integer NOT NULL DEFAULT 0,
  imported_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT import_batches_pkey PRIMARY KEY (id),
  CONSTRAINT import_batches_tournament_id_fkey
    FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id),
  CONSTRAINT import_batches_imported_by_fkey
    FOREIGN KEY (imported_by) REFERENCES auth.users(id),
  CONSTRAINT import_batches_round_number_check
    CHECK (round_number > 0),
  CONSTRAINT import_batches_imported_rows_check
    CHECK (imported_rows >= 0),
  CONSTRAINT import_batches_file_source_check
    CHECK (
      file_source = ANY (
        ARRAY[
          'swiss_manager'::text,
          'chess_results'::text,
          'unknown'::text
        ]
      )
    ),
  CONSTRAINT import_batches_status_check
    CHECK (
      status = ANY (
        ARRAY['previewed'::text, 'committed'::text, 'failed'::text]
      )
    )
);

CREATE TABLE public.result_events (
  id bigint GENERATED ALWAYS AS IDENTITY,
  match_id uuid NOT NULL,
  actor_user_id uuid,
  event_type text NOT NULL,
  player_side text,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT result_events_pkey PRIMARY KEY (id),
  CONSTRAINT result_events_match_id_fkey
    FOREIGN KEY (match_id) REFERENCES public.matches(id),
  CONSTRAINT result_events_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id),
  CONSTRAINT result_events_event_type_check
    CHECK (
      event_type = ANY (
        ARRAY[
          'result_submitted'::text,
          'player_confirmed'::text,
          'player_disagreed'::text,
          'result_approved'::text,
          'result_reopened'::text,
          'result_corrected'::text,
          'special_marked'::text
        ]
      )
    ),
  CONSTRAINT result_events_player_side_check
    CHECK (
      player_side IS NULL
      OR player_side = ANY (ARRAY['white'::text, 'black'::text])
    )
);

CREATE INDEX import_batches_tournament_idx
  ON public.import_batches (tournament_id, created_at);
CREATE INDEX matches_status_idx
  ON public.matches (status);
CREATE INDEX matches_tournament_round_idx
  ON public.matches (tournament_id, round_number, board_number);
CREATE INDEX players_tournament_name_idx
  ON public.players (tournament_id, full_name);
CREATE INDEX result_events_match_idx
  ON public.result_events (match_id, created_at);

ALTER TABLE public.connection_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.result_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_connection_check
  ON public.connection_check
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY users_read_own_profile
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY staff_read_tournaments
  ON public.tournaments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.role = ANY (
          ARRAY['technical'::text, 'recorder'::text]
        )
    )
  );

CREATE POLICY staff_read_players
  ON public.players
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.role = ANY (
          ARRAY['technical'::text, 'recorder'::text]
        )
    )
  );

CREATE POLICY staff_read_matches
  ON public.matches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.role = ANY (
          ARRAY['technical'::text, 'recorder'::text]
        )
    )
  );

CREATE POLICY staff_read_import_batches
  ON public.import_batches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.role = ANY (
          ARRAY['technical'::text, 'recorder'::text]
        )
    )
  );

CREATE POLICY staff_read_result_events
  ON public.result_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = (SELECT auth.uid())
        AND profile.role = ANY (
          ARRAY['technical'::text, 'recorder'::text]
        )
    )
  );

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

REVOKE ALL ON TABLE public.connection_check FROM anon, authenticated;
GRANT ALL ON TABLE public.connection_check TO anon, authenticated;

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
GRANT ALL ON TABLE public.profiles TO authenticated;

REVOKE ALL ON TABLE public.tournaments FROM anon, authenticated;
REVOKE ALL ON TABLE public.players FROM anon, authenticated;
REVOKE ALL ON TABLE public.matches FROM anon, authenticated;
REVOKE ALL ON TABLE public.import_batches FROM anon, authenticated;
REVOKE ALL ON TABLE public.result_events FROM anon, authenticated;

GRANT SELECT ON TABLE public.tournaments TO authenticated;
GRANT SELECT ON TABLE public.players TO authenticated;
GRANT SELECT ON TABLE public.matches TO authenticated;
GRANT SELECT ON TABLE public.import_batches TO authenticated;
GRANT SELECT ON TABLE public.result_events TO authenticated;

GRANT ALL ON TABLE public.connection_check TO service_role;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.tournaments TO service_role;
GRANT ALL ON TABLE public.players TO service_role;
GRANT ALL ON TABLE public.matches TO service_role;
GRANT ALL ON TABLE public.import_batches TO service_role;
GRANT ALL ON TABLE public.result_events TO service_role;
GRANT ALL ON SEQUENCE public.result_events_id_seq TO service_role;
