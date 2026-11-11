#!/usr/bin/env bash
# Prove T8 policies + reseed on local Postgres 17 (auth stub).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="${CONFERE_VERIFY_DB:-confere_repasse_t8}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1)
DEMO_USER="05ebcbde-1c83-4768-9b26-c28a7a2a6782"

echo "==> Recreating database ${DB_NAME}"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ${DB_NAME};"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE ${DB_NAME};"

run() {
  "${PSQL[@]}" -d "${DB_NAME}" "$@"
}

echo "==> local_auth_stub.sql"
run -f "${ROOT}/supabase/local_auth_stub.sql"

echo "==> migrations"
run -f "${ROOT}/supabase/migrations/20261111000001_init_conciliacao_schema.sql"
run -f "${ROOT}/supabase/migrations/20261111000002_csv_upload_and_reseed.sql"

echo "==> seed.sql"
run -f "${ROOT}/supabase/seed.sql"

echo "==> Row counts after seed"
run -c "
SELECT 'pedidos' AS t, count(*)::int AS n FROM public.pedidos
UNION ALL SELECT 'lancamentos', count(*)::int FROM public.lancamentos
ORDER BY 1;
"

echo "==> Authenticated can INSERT/DELETE own lançamento"
run -c "
SET ROLE authenticated;
INSERT INTO public.lancamentos (
  restaurante_id, pedido_id, pedido_id_ifood, competencia, fato_gerador, tipo_lancamento,
  descricao_lancamento, valor, base_calculo, percentual_taxa,
  data_apuracao_inicio, data_apuracao_fim, impacto_no_repasse, titulo
) VALUES (
  'a1111111-1111-4111-8111-111111111111',
  NULL, NULL, '2026-11', 'FECHAMENTO', 'TAXA_REPASSE',
  'Taxa de repasse semanal', -1.99, NULL, NULL,
  CURRENT_DATE, CURRENT_DATE, true, 'REPASSE-TEST-T8'
);
DELETE FROM public.lancamentos WHERE titulo = 'REPASSE-TEST-T8';
RESET ROLE;
SELECT 'write_policies_ok' AS status;
"

echo "==> Authenticated can upsert own pedido"
run -c "
SET ROLE authenticated;
INSERT INTO public.pedidos (
  restaurante_id, pedido_id_ifood, pedido_id_curto, metodo_pagamento, status, valor_total, data_criacao
) VALUES (
  'a1111111-1111-4111-8111-111111111111',
  'DEMO-T8-PROBE', 'T8P1', 'ONLINE', 'ENTREGUE', 10.00, CURRENT_DATE
)
ON CONFLICT (restaurante_id, pedido_id_ifood) DO UPDATE
  SET valor_total = EXCLUDED.valor_total;
DELETE FROM public.pedidos WHERE pedido_id_ifood = 'DEMO-T8-PROBE';
RESET ROLE;
SELECT 'pedido_write_ok' AS status;
"

echo "==> Reseed via SECURITY DEFINER as authenticated"
run -c "
-- Mutate then restore
DELETE FROM public.lancamentos;
SELECT count(*) AS lancamentos_after_delete FROM public.lancamentos;
SET ROLE authenticated;
SELECT public.reseed_own_restaurant();
RESET ROLE;
SELECT count(*) AS lancamentos_after_reseed FROM public.lancamentos;
SELECT count(*) AS pedidos_after_reseed FROM public.pedidos;
"

echo "==> Idempotent second seed.sql"
run -f "${ROOT}/supabase/seed.sql"
run -c "SELECT count(*) AS lancamentos FROM public.lancamentos; SELECT count(*) AS pedidos FROM public.pedidos;"

echo "OK — local T8 verification finished."
