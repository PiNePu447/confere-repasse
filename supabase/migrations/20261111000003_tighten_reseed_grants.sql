-- T8 follow-up: Supabase grants EXECUTE on public functions to anon/authenticated
-- by default, so REVOKE FROM PUBLIC alone left reseed_restaurant_for_user(uuid)
-- callable by any authenticated client for any user_id.
-- Idempotent: safe to re-run.

REVOKE ALL ON FUNCTION public.reseed_restaurant_for_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reseed_restaurant_for_user(uuid) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.reseed_own_restaurant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reseed_own_restaurant() FROM anon;

-- Demo UI / authenticated users may only reseed their own restaurant.
GRANT EXECUTE ON FUNCTION public.reseed_own_restaurant() TO authenticated;

-- Bootstrap / service role keep the targeted reseed (seed.sql, ops).
GRANT EXECUTE ON FUNCTION public.reseed_restaurant_for_user(uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.reseed_restaurant_for_user(uuid) TO service_role;
