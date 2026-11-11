-- Confere Repasse: apply deterministic demo seed.
-- Single source of seed rows: public.reseed_restaurant_for_user()
-- (defined in supabase/migrations/20261111000002_csv_upload_and_reseed.sql).
-- Apply migrations first, then this file.

SELECT public.reseed_restaurant_for_user('05ebcbde-1c83-4768-9b26-c28a7a2a6782'::uuid);
