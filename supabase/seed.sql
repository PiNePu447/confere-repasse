-- Confere Repasse T2: deterministic, idempotent seed (100% fictitious).
-- Dates use CURRENT_DATE offsets so "within 7 days" stays meaningful on every run.
-- Apply AFTER the migration. Safe to re-run: clears/reinserts the demo restaurant only.

BEGIN;

-- Fixed demo identities (must match SEED.md / T1 auth user)
-- restaurant: a1111111-1111-4111-8111-111111111111
-- contract:   a2222222-2222-4222-8222-222222222222
-- auth user:  05ebcbde-1c83-4768-9b26-c28a7a2a6782

CREATE TEMP TABLE seed_demo AS
SELECT
  'a1111111-1111-4111-8111-111111111111'::uuid AS restaurante_id,
  'a2222222-2222-4222-8222-222222222222'::uuid AS contrato_id,
  '05ebcbde-1c83-4768-9b26-c28a7a2a6782'::uuid AS user_id,
  12.00::numeric(5, 2) AS comissao_pct,
  3.20::numeric(5, 2) AS taxa_online_pct,
  1.99::numeric(10, 2) AS taxa_repasse_semanal;

-- Idempotent cleanup for this restaurant only
DELETE FROM public.divergencias
WHERE restaurante_id = (SELECT restaurante_id FROM seed_demo)
   OR restaurante_id IN (
        SELECT id FROM public.restaurantes WHERE user_id = (SELECT user_id FROM seed_demo)
      );

DELETE FROM public.lancamentos
WHERE restaurante_id = (SELECT restaurante_id FROM seed_demo)
   OR restaurante_id IN (
        SELECT id FROM public.restaurantes WHERE user_id = (SELECT user_id FROM seed_demo)
      );

DELETE FROM public.pedidos
WHERE restaurante_id = (SELECT restaurante_id FROM seed_demo)
   OR restaurante_id IN (
        SELECT id FROM public.restaurantes WHERE user_id = (SELECT user_id FROM seed_demo)
      );

DELETE FROM public.contratos
WHERE restaurante_id = (SELECT restaurante_id FROM seed_demo)
   OR restaurante_id IN (
        SELECT id FROM public.restaurantes WHERE user_id = (SELECT user_id FROM seed_demo)
      );

DELETE FROM public.restaurantes
WHERE id = (SELECT restaurante_id FROM seed_demo)
   OR user_id = (SELECT user_id FROM seed_demo);

INSERT INTO public.restaurantes (id, user_id, nome, cnpj, loja_id_ifood)
SELECT
  restaurante_id,
  user_id,
  'Restaurante Demo',
  '12.345.678/0001-90',
  'LOJA-DEMO-0001'
FROM seed_demo;

INSERT INTO public.contratos (
  id,
  restaurante_id,
  plano,
  comissao_percentual,
  taxa_pagamento_online_percentual,
  taxa_repasse_semanal,
  vigencia_inicio,
  vigencia_fim,
  ativo
)
SELECT
  contrato_id,
  restaurante_id,
  'Marketplace',
  comissao_pct,
  taxa_online_pct,
  taxa_repasse_semanal,
  CURRENT_DATE - 120,
  NULL,
  true
FROM seed_demo;

-- ---------------------------------------------------------------------------
-- Helper: 4 weekly apuração windows ending on CURRENT_DATE offsets
-- week 0 (newest): [CURRENT_DATE-6, CURRENT_DATE]
-- week 1:          [CURRENT_DATE-13, CURRENT_DATE-7]
-- week 2:          [CURRENT_DATE-20, CURRENT_DATE-14]
-- week 3 (oldest): [CURRENT_DATE-27, CURRENT_DATE-21]
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE seed_weeks AS
SELECT *
FROM (
  VALUES
    (0, CURRENT_DATE - 6,  CURRENT_DATE,      CURRENT_DATE + 1),
    (1, CURRENT_DATE - 13, CURRENT_DATE - 7,  CURRENT_DATE - 6),
    (2, CURRENT_DATE - 20, CURRENT_DATE - 14, CURRENT_DATE - 13),
    (3, CURRENT_DATE - 27, CURRENT_DATE - 21, CURRENT_DATE - 20)
) AS w(semana, inicio, fim, repasse_esperado);

-- ---------------------------------------------------------------------------
-- Normal pedidos (deterministic): 5 per week × 4 weeks = 20
-- pedido_id_ifood = DEMO-PED-W{semana}-N{n}
-- day within week: inicio + (n-1)  => always inside the week window
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE seed_normal_pedidos AS
SELECT
  d.restaurante_id,
  format('DEMO-PED-W%s-N%s', w.semana, n.n) AS pedido_id_ifood,
  lpad(((w.semana * 5) + n.n)::text, 4, '0') AS pedido_id_curto,
  CASE WHEN (w.semana + n.n) % 3 = 0 THEN 'PAGO_NA_ENTREGA' ELSE 'ONLINE' END AS metodo_pagamento,
  'ENTREGUE'::text AS status,
  (45.00 + (w.semana * 7) + (n.n * 8.50))::numeric(12, 2) AS valor_total,
  (w.inicio + (n.n - 1))::date AS data_criacao,
  NULL::text AS motivo_cancelamento,
  w.semana,
  w.inicio AS data_apuracao_inicio,
  w.fim AS data_apuracao_fim,
  w.repasse_esperado AS data_repasse_esperada
FROM seed_demo d
CROSS JOIN seed_weeks w
CROSS JOIN generate_series(1, 5) AS n(n);

INSERT INTO public.pedidos (
  id,
  restaurante_id,
  pedido_id_ifood,
  pedido_id_curto,
  metodo_pagamento,
  status,
  valor_total,
  data_criacao,
  motivo_cancelamento
)
SELECT
  -- Stable UUID derived from pedido_id_ifood text (md5 → uuid)
  (
    substr(md5(pedido_id_ifood), 1, 8) || '-' ||
    substr(md5(pedido_id_ifood), 9, 4) || '-' ||
    '4' || substr(md5(pedido_id_ifood), 13, 3) || '-' ||
    '8' || substr(md5(pedido_id_ifood), 16, 3) || '-' ||
    substr(md5(pedido_id_ifood), 19, 12)
  )::uuid,
  restaurante_id,
  pedido_id_ifood,
  pedido_id_curto,
  metodo_pagamento,
  status,
  valor_total,
  data_criacao,
  motivo_cancelamento
FROM seed_normal_pedidos;

-- Normal lançamentos: commission (+ online fee when ONLINE)
INSERT INTO public.lancamentos (
  restaurante_id,
  pedido_id,
  pedido_id_ifood,
  competencia,
  fato_gerador,
  tipo_lancamento,
  descricao_lancamento,
  valor,
  base_calculo,
  percentual_taxa,
  data_apuracao_inicio,
  data_apuracao_fim,
  data_repasse_esperada,
  data_criacao_pedido,
  impacto_no_repasse,
  metodo_pagamento,
  titulo
)
SELECT
  p.restaurante_id,
  ped.id,
  p.pedido_id_ifood,
  to_char(p.data_criacao, 'YYYY-MM'),
  'VENDA',
  'COMISSAO',
  'Comissão do iFood',
  round((-p.valor_total * d.comissao_pct / 100.0)::numeric, 2),
  p.valor_total,
  d.comissao_pct,
  p.data_apuracao_inicio,
  p.data_apuracao_fim,
  p.data_repasse_esperada,
  p.data_criacao,
  true,
  p.metodo_pagamento,
  format('REPASSE-W%s', p.semana)
FROM seed_normal_pedidos p
JOIN seed_demo d ON true
JOIN public.pedidos ped
  ON ped.restaurante_id = p.restaurante_id
 AND ped.pedido_id_ifood = p.pedido_id_ifood;

INSERT INTO public.lancamentos (
  restaurante_id,
  pedido_id,
  pedido_id_ifood,
  competencia,
  fato_gerador,
  tipo_lancamento,
  descricao_lancamento,
  valor,
  base_calculo,
  percentual_taxa,
  data_apuracao_inicio,
  data_apuracao_fim,
  data_repasse_esperada,
  data_criacao_pedido,
  impacto_no_repasse,
  metodo_pagamento,
  titulo
)
SELECT
  p.restaurante_id,
  ped.id,
  p.pedido_id_ifood,
  to_char(p.data_criacao, 'YYYY-MM'),
  'VENDA',
  'TAXA_PAGAMENTO',
  'Taxa de pagamento online',
  round((-p.valor_total * d.taxa_online_pct / 100.0)::numeric, 2),
  p.valor_total,
  d.taxa_online_pct,
  p.data_apuracao_inicio,
  p.data_apuracao_fim,
  p.data_repasse_esperada,
  p.data_criacao,
  true,
  p.metodo_pagamento,
  format('REPASSE-W%s', p.semana)
FROM seed_normal_pedidos p
JOIN seed_demo d ON true
JOIN public.pedidos ped
  ON ped.restaurante_id = p.restaurante_id
 AND ped.pedido_id_ifood = p.pedido_id_ifood
WHERE p.metodo_pagamento = 'ONLINE';

-- Weekly payout fee (one per week, no pedido)
INSERT INTO public.lancamentos (
  restaurante_id,
  pedido_id,
  pedido_id_ifood,
  competencia,
  fato_gerador,
  tipo_lancamento,
  descricao_lancamento,
  valor,
  base_calculo,
  percentual_taxa,
  data_apuracao_inicio,
  data_apuracao_fim,
  data_repasse_esperada,
  data_criacao_pedido,
  impacto_no_repasse,
  metodo_pagamento,
  titulo
)
SELECT
  d.restaurante_id,
  NULL,
  NULL,
  to_char(w.fim, 'YYYY-MM'),
  'FECHAMENTO',
  'TAXA_REPASSE',
  'Taxa de repasse semanal',
  -d.taxa_repasse_semanal,
  NULL,
  NULL,
  w.inicio,
  w.fim,
  w.repasse_esperado,
  NULL,
  true,
  NULL,
  format('REPASSE-W%s', w.semana)
FROM seed_demo d
CROSS JOIN seed_weeks w;

-- ---------------------------------------------------------------------------
-- Planted anomalies (fixed order IDs — see supabase/SEED.md)
-- ---------------------------------------------------------------------------

CREATE TEMP TABLE seed_anomalies (
  pedido_id_ifood text PRIMARY KEY,
  pedido_id_curto text NOT NULL,
  metodo_pagamento text NOT NULL,
  status text NOT NULL,
  valor_total numeric(12, 2) NOT NULL,
  data_criacao date NOT NULL,
  motivo_cancelamento text,
  semana int NOT NULL,
  data_apuracao_inicio date NOT NULL,
  data_apuracao_fim date NOT NULL,
  data_repasse_esperada date NOT NULL,
  anomalia_tipo text NOT NULL
);

INSERT INTO seed_anomalies
SELECT * FROM (
  VALUES
    -- (1) commission above contract (23% vs 12%), week 2
    (
      'DEMO-ANOM-001', 'A001', 'ONLINE', 'ENTREGUE', 150.00::numeric,
      (CURRENT_DATE - 16), NULL::text, 2,
      CURRENT_DATE - 20, CURRENT_DATE - 14, CURRENT_DATE - 13,
      'comissao_acima_contrato'
    ),
    -- (2) duplicate commission charge, week 2
    (
      'DEMO-ANOM-002', 'A002', 'ONLINE', 'ENTREGUE', 100.00::numeric,
      (CURRENT_DATE - 18), NULL::text, 2,
      CURRENT_DATE - 20, CURRENT_DATE - 14, CURRENT_DATE - 13,
      'cobranca_duplicada'
    ),
    -- (3a) cancellation deducted — inside last 7 days (week 0)
    (
      'DEMO-ANOM-003', 'A003', 'ONLINE', 'CANCELADO', 80.00::numeric,
      (CURRENT_DATE - 3), 'Cliente desistiu após confirmação', 0,
      CURRENT_DATE - 6, CURRENT_DATE, CURRENT_DATE + 1,
      'cancelamento_debitado'
    ),
    -- (3b) cancellation deducted — older than 7 days (week 3)
    (
      'DEMO-ANOM-004', 'A004', 'ONLINE', 'CANCELADO', 95.00::numeric,
      (CURRENT_DATE - 24), 'Item indisponível', 3,
      CURRENT_DATE - 27, CURRENT_DATE - 21, CURRENT_DATE - 20,
      'cancelamento_debitado'
    ),
    -- (4) online payment fee on pay-on-delivery order (week 0)
    (
      'DEMO-ANOM-005', 'A005', 'PAGO_NA_ENTREGA', 'ENTREGUE', 125.00::numeric,
      (CURRENT_DATE - 5), NULL::text, 0,
      CURRENT_DATE - 6, CURRENT_DATE, CURRENT_DATE + 1,
      'taxa_online_em_pago_na_entrega'
    )
) AS a(
  pedido_id_ifood, pedido_id_curto, metodo_pagamento, status, valor_total,
  data_criacao, motivo_cancelamento, semana,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, anomalia_tipo
);

INSERT INTO public.pedidos (
  id,
  restaurante_id,
  pedido_id_ifood,
  pedido_id_curto,
  metodo_pagamento,
  status,
  valor_total,
  data_criacao,
  motivo_cancelamento
)
SELECT
  (
    substr(md5(a.pedido_id_ifood), 1, 8) || '-' ||
    substr(md5(a.pedido_id_ifood), 9, 4) || '-' ||
    '4' || substr(md5(a.pedido_id_ifood), 13, 3) || '-' ||
    '8' || substr(md5(a.pedido_id_ifood), 16, 3) || '-' ||
    substr(md5(a.pedido_id_ifood), 19, 12)
  )::uuid,
  d.restaurante_id,
  a.pedido_id_ifood,
  a.pedido_id_curto,
  a.metodo_pagamento,
  a.status,
  a.valor_total,
  a.data_criacao,
  a.motivo_cancelamento
FROM seed_anomalies a
CROSS JOIN seed_demo d;

-- Shared helper view of anomaly pedidos joined
CREATE TEMP TABLE seed_anom_ped AS
SELECT a.*, ped.id AS pedido_uuid, d.restaurante_id, d.comissao_pct, d.taxa_online_pct
FROM seed_anomalies a
CROSS JOIN seed_demo d
JOIN public.pedidos ped
  ON ped.restaurante_id = d.restaurante_id
 AND ped.pedido_id_ifood = a.pedido_id_ifood;

-- (1) DEMO-ANOM-001: charge 23% commission instead of 12%
INSERT INTO public.lancamentos (
  restaurante_id, pedido_id, pedido_id_ifood, competencia, fato_gerador, tipo_lancamento,
  descricao_lancamento, valor, base_calculo, percentual_taxa,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao_pedido,
  impacto_no_repasse, metodo_pagamento, titulo
)
SELECT
  restaurante_id, pedido_uuid, pedido_id_ifood, to_char(data_criacao, 'YYYY-MM'),
  'VENDA', 'COMISSAO', 'Comissão do iFood',
  round((-valor_total * 23.00 / 100.0)::numeric, 2),
  valor_total, 23.00,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao,
  true, metodo_pagamento, format('REPASSE-W%s', semana)
FROM seed_anom_ped
WHERE pedido_id_ifood = 'DEMO-ANOM-001';

INSERT INTO public.lancamentos (
  restaurante_id, pedido_id, pedido_id_ifood, competencia, fato_gerador, tipo_lancamento,
  descricao_lancamento, valor, base_calculo, percentual_taxa,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao_pedido,
  impacto_no_repasse, metodo_pagamento, titulo
)
SELECT
  restaurante_id, pedido_uuid, pedido_id_ifood, to_char(data_criacao, 'YYYY-MM'),
  'VENDA', 'TAXA_PAGAMENTO', 'Taxa de pagamento online',
  round((-valor_total * taxa_online_pct / 100.0)::numeric, 2),
  valor_total, taxa_online_pct,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao,
  true, metodo_pagamento, format('REPASSE-W%s', semana)
FROM seed_anom_ped
WHERE pedido_id_ifood = 'DEMO-ANOM-001';

-- (2) DEMO-ANOM-002: correct commission once, then a duplicate commission row
INSERT INTO public.lancamentos (
  restaurante_id, pedido_id, pedido_id_ifood, competencia, fato_gerador, tipo_lancamento,
  descricao_lancamento, valor, base_calculo, percentual_taxa,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao_pedido,
  impacto_no_repasse, metodo_pagamento, titulo
)
SELECT
  restaurante_id, pedido_uuid, pedido_id_ifood, to_char(data_criacao, 'YYYY-MM'),
  'VENDA', 'COMISSAO', 'Comissão do iFood',
  round((-valor_total * comissao_pct / 100.0)::numeric, 2),
  valor_total, comissao_pct,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao,
  true, metodo_pagamento, format('REPASSE-W%s', semana)
FROM seed_anom_ped
WHERE pedido_id_ifood = 'DEMO-ANOM-002';

-- duplicate row (same description/valor)
INSERT INTO public.lancamentos (
  restaurante_id, pedido_id, pedido_id_ifood, competencia, fato_gerador, tipo_lancamento,
  descricao_lancamento, valor, base_calculo, percentual_taxa,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao_pedido,
  impacto_no_repasse, metodo_pagamento, titulo
)
SELECT
  restaurante_id, pedido_uuid, pedido_id_ifood, to_char(data_criacao, 'YYYY-MM'),
  'VENDA', 'COMISSAO', 'Comissão do iFood',
  round((-valor_total * comissao_pct / 100.0)::numeric, 2),
  valor_total, comissao_pct,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao,
  true, metodo_pagamento, format('REPASSE-W%s', semana)
FROM seed_anom_ped
WHERE pedido_id_ifood = 'DEMO-ANOM-002';

INSERT INTO public.lancamentos (
  restaurante_id, pedido_id, pedido_id_ifood, competencia, fato_gerador, tipo_lancamento,
  descricao_lancamento, valor, base_calculo, percentual_taxa,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao_pedido,
  impacto_no_repasse, metodo_pagamento, titulo
)
SELECT
  restaurante_id, pedido_uuid, pedido_id_ifood, to_char(data_criacao, 'YYYY-MM'),
  'VENDA', 'TAXA_PAGAMENTO', 'Taxa de pagamento online',
  round((-valor_total * taxa_online_pct / 100.0)::numeric, 2),
  valor_total, taxa_online_pct,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao,
  true, metodo_pagamento, format('REPASSE-W%s', semana)
FROM seed_anom_ped
WHERE pedido_id_ifood = 'DEMO-ANOM-002';

-- (3) DEMO-ANOM-003 / 004: cancelled orders still debiting payout
-- Commission + incorrect "Débito por cancelamento" clawback of full order value
INSERT INTO public.lancamentos (
  restaurante_id, pedido_id, pedido_id_ifood, competencia, fato_gerador, tipo_lancamento,
  descricao_lancamento, valor, base_calculo, percentual_taxa,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao_pedido,
  impacto_no_repasse, metodo_pagamento, titulo
)
SELECT
  restaurante_id, pedido_uuid, pedido_id_ifood, to_char(data_criacao, 'YYYY-MM'),
  'CANCELAMENTO', 'COMISSAO', 'Comissão do iFood',
  round((-valor_total * comissao_pct / 100.0)::numeric, 2),
  valor_total, comissao_pct,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao,
  true, metodo_pagamento, format('REPASSE-W%s', semana)
FROM seed_anom_ped
WHERE pedido_id_ifood IN ('DEMO-ANOM-003', 'DEMO-ANOM-004');

INSERT INTO public.lancamentos (
  restaurante_id, pedido_id, pedido_id_ifood, competencia, fato_gerador, tipo_lancamento,
  descricao_lancamento, valor, base_calculo, percentual_taxa,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao_pedido,
  impacto_no_repasse, metodo_pagamento, titulo
)
SELECT
  restaurante_id, pedido_uuid, pedido_id_ifood, to_char(data_criacao, 'YYYY-MM'),
  'CANCELAMENTO', 'DEBITO_CANCELAMENTO', 'Débito por cancelamento',
  -valor_total,
  valor_total, NULL,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao,
  true, metodo_pagamento, format('REPASSE-W%s', semana)
FROM seed_anom_ped
WHERE pedido_id_ifood IN ('DEMO-ANOM-003', 'DEMO-ANOM-004');

-- (4) DEMO-ANOM-005: PAGO_NA_ENTREGA but charged online payment fee
-- Correct: commission only. Incorrect: also "Taxa de pagamento online"
INSERT INTO public.lancamentos (
  restaurante_id, pedido_id, pedido_id_ifood, competencia, fato_gerador, tipo_lancamento,
  descricao_lancamento, valor, base_calculo, percentual_taxa,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao_pedido,
  impacto_no_repasse, metodo_pagamento, titulo
)
SELECT
  restaurante_id, pedido_uuid, pedido_id_ifood, to_char(data_criacao, 'YYYY-MM'),
  'VENDA', 'COMISSAO', 'Comissão do iFood',
  round((-valor_total * comissao_pct / 100.0)::numeric, 2),
  valor_total, comissao_pct,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao,
  true, metodo_pagamento, format('REPASSE-W%s', semana)
FROM seed_anom_ped
WHERE pedido_id_ifood = 'DEMO-ANOM-005';

INSERT INTO public.lancamentos (
  restaurante_id, pedido_id, pedido_id_ifood, competencia, fato_gerador, tipo_lancamento,
  descricao_lancamento, valor, base_calculo, percentual_taxa,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao_pedido,
  impacto_no_repasse, metodo_pagamento, titulo
)
SELECT
  restaurante_id, pedido_uuid, pedido_id_ifood, to_char(data_criacao, 'YYYY-MM'),
  'VENDA', 'TAXA_PAGAMENTO', 'Taxa de pagamento online',
  round((-valor_total * taxa_online_pct / 100.0)::numeric, 2),
  valor_total, taxa_online_pct,
  data_apuracao_inicio, data_apuracao_fim, data_repasse_esperada, data_criacao,
  true, metodo_pagamento, format('REPASSE-W%s', semana)
FROM seed_anom_ped
WHERE pedido_id_ifood = 'DEMO-ANOM-005';

-- divergencias intentionally left empty (T3)

COMMIT;
