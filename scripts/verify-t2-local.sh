#!/usr/bin/env bash
# Apply migration + seed on a local Postgres 17 and print counts / anomalies.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="${CONFERE_VERIFY_DB:-confere_repasse_t2}"
PSQL=(sudo -u postgres psql -v ON_ERROR_STOP=1)

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

echo "==> seed.sql (first run)"
run -f "${ROOT}/supabase/seed.sql"

echo "==> seed.sql (second run — idempotency)"
run -f "${ROOT}/supabase/seed.sql"

echo
echo "==> Row counts"
run -c "
SELECT 'restaurantes' AS tabela, count(*)::int AS n FROM public.restaurantes
UNION ALL SELECT 'contratos', count(*)::int FROM public.contratos
UNION ALL SELECT 'pedidos', count(*)::int FROM public.pedidos
UNION ALL SELECT 'lancamentos', count(*)::int FROM public.lancamentos
UNION ALL SELECT 'divergencias', count(*)::int FROM public.divergencias
ORDER BY 1;
"

echo
echo "==> Planted anomalies"
run -c "
WITH contract AS (
  SELECT comissao_percentual, taxa_pagamento_online_percentual
  FROM public.contratos WHERE ativo
),
anom AS (
  SELECT * FROM (VALUES
    ('DEMO-ANOM-001', 'comissao_acima_contrato', 16.50::numeric),
    ('DEMO-ANOM-002', 'cobranca_duplicada', 12.00::numeric),
    ('DEMO-ANOM-003', 'cancelamento_debitado', 80.00::numeric),
    ('DEMO-ANOM-004', 'cancelamento_debitado', 95.00::numeric),
    ('DEMO-ANOM-005', 'taxa_online_em_pago_na_entrega', 4.00::numeric)
  ) AS t(pedido_id_ifood, tipo, impacto_esperado_rs)
)
SELECT
  a.pedido_id_ifood,
  a.tipo,
  a.impacto_esperado_rs,
  p.status,
  p.metodo_pagamento,
  p.valor_total,
  p.data_criacao,
  (CURRENT_DATE - p.data_criacao) AS dias_atras,
  (
    SELECT json_agg(json_build_object(
      'descricao', l.descricao_lancamento,
      'valor', l.valor,
      'percentual_taxa', l.percentual_taxa
    ) ORDER BY l.descricao_lancamento, l.valor)
    FROM public.lancamentos l
    WHERE l.pedido_id_ifood = a.pedido_id_ifood
  ) AS lancamentos
FROM anom a
JOIN public.pedidos p ON p.pedido_id_ifood = a.pedido_id_ifood
ORDER BY a.pedido_id_ifood;
"

echo
echo "==> Sanity: DEMO-ANOM-001 commission percent"
run -c "
SELECT pedido_id_ifood, descricao_lancamento, percentual_taxa, valor
FROM public.lancamentos
WHERE pedido_id_ifood = 'DEMO-ANOM-001' AND descricao_lancamento = 'Comissão do iFood';
"

echo
echo "==> Sanity: DEMO-ANOM-002 duplicate commission count"
run -c "
SELECT pedido_id_ifood, descricao_lancamento, count(*) AS n, sum(valor) AS soma
FROM public.lancamentos
WHERE pedido_id_ifood = 'DEMO-ANOM-002' AND descricao_lancamento = 'Comissão do iFood'
GROUP BY 1, 2;
"

echo "OK — local T2 verification finished."
