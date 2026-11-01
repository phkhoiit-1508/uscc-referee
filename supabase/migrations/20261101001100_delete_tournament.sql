-- Migration 011: uscc_delete_tournament RPC for technical referees
-- Allows authorized technical referee to delete a tournament and safely clean up related tournament data.

CREATE OR REPLACE FUNCTION public.uscc_delete_tournament(
  p_tournament_id uuid,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text;
BEGIN
  -- 1. Actor must be technical referee
  SELECT role INTO v_role FROM public.profiles WHERE id = p_actor;
  IF v_role IS DISTINCT FROM 'technical' THEN
    RAISE EXCEPTION 'TECHNICAL_REFEREE_REQUIRED';
  END IF;

  -- 2. Tournament must exist
  PERFORM 1 FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND';
  END IF;

  -- 3. Audit trail context
  PERFORM set_config('app.actor_user_id', p_actor::text, true);
  PERFORM set_config('app.audit_reason', 'Tournament deleted by technical referee', true);

  -- 4. Temporarily bypass append-only triggers for cascading delete in this transaction
  SET LOCAL session_replication_role = 'replica';

  -- 5. Cascade delete in proper FK order
  DELETE FROM public.result_events
  WHERE match_id IN (SELECT id FROM public.matches WHERE tournament_id = p_tournament_id);

  DELETE FROM public.matches WHERE tournament_id = p_tournament_id;
  DELETE FROM public.players WHERE tournament_id = p_tournament_id;
  DELETE FROM public.import_batches WHERE tournament_id = p_tournament_id;
  DELETE FROM public.tournaments WHERE id = p_tournament_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.uscc_delete_tournament(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uscc_delete_tournament(uuid, uuid)
  TO authenticated, service_role;

