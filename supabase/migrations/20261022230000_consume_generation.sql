-- Atomically count one recipe generation for today (UTC).
-- Returns the new count, or raises DAILY_LIMIT_REACHED when the user is already at p_limit.
CREATE OR REPLACE FUNCTION public.consume_generation(p_user uuid, p_limit int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_user IS NULL OR p_limit IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'DAILY_LIMIT_REACHED';
  END IF;

  INSERT INTO public.generation_usage AS g (user_id, usage_date, count)
  VALUES (p_user, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (user_id, usage_date)
    DO UPDATE SET count = g.count + 1
    WHERE g.count < p_limit
  RETURNING g.count INTO v_count;

  -- No row returned means the conflict row was already at the limit.
  IF v_count IS NULL THEN
    RAISE EXCEPTION 'DAILY_LIMIT_REACHED';
  END IF;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_generation(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_generation(uuid, int) TO service_role;
