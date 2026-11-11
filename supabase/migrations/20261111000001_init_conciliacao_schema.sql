-- Confere Repasse T2: schema for fictitious iFood-style reconciliation data.
-- Safe to apply on Supabase Postgres 17 (auth schema already exists there).
-- gen_random_uuid() is built into Postgres 13+ (no pgcrypto required).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.restaurantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  nome text NOT NULL,
  cnpj text NOT NULL,
  loja_id_ifood text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id) ON DELETE CASCADE,
  plano text NOT NULL,
  comissao_percentual numeric(5, 2) NOT NULL,
  taxa_pagamento_online_percentual numeric(5, 2) NOT NULL,
  taxa_repasse_semanal numeric(10, 2) NOT NULL,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  ativo boolean NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX contratos_one_active_per_restaurante
  ON public.contratos (restaurante_id)
  WHERE (ativo);

CREATE TABLE public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id) ON DELETE CASCADE,
  pedido_id_ifood text NOT NULL,
  pedido_id_curto text NOT NULL,
  metodo_pagamento text NOT NULL
    CHECK (metodo_pagamento IN ('ONLINE', 'PAGO_NA_ENTREGA')),
  status text NOT NULL
    CHECK (status IN ('ENTREGUE', 'CANCELADO', 'EM_PREPARO', 'SAIU_ENTREGA')),
  valor_total numeric(12, 2) NOT NULL CHECK (valor_total >= 0),
  data_criacao date NOT NULL,
  motivo_cancelamento text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurante_id, pedido_id_ifood)
);

CREATE INDEX pedidos_restaurante_data_idx
  ON public.pedidos (restaurante_id, data_criacao);

CREATE TABLE public.lancamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id) ON DELETE CASCADE,
  pedido_id uuid REFERENCES public.pedidos (id) ON DELETE CASCADE,
  pedido_id_ifood text,
  competencia text NOT NULL,
  fato_gerador text NOT NULL,
  tipo_lancamento text NOT NULL,
  descricao_lancamento text NOT NULL,
  valor numeric(12, 2) NOT NULL,
  base_calculo numeric(12, 2),
  percentual_taxa numeric(5, 2),
  data_apuracao_inicio date NOT NULL,
  data_apuracao_fim date NOT NULL,
  data_repasse_esperada date,
  data_criacao_pedido date,
  impacto_no_repasse boolean NOT NULL DEFAULT true,
  metodo_pagamento text,
  titulo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lancamentos_pedido_id_ifood_when_pedido
    CHECK (pedido_id IS NULL OR pedido_id_ifood IS NOT NULL)
);

CREATE INDEX lancamentos_restaurante_apuracao_idx
  ON public.lancamentos (restaurante_id, data_apuracao_inicio);

CREATE INDEX lancamentos_pedido_ifood_idx
  ON public.lancamentos (restaurante_id, pedido_id_ifood);

-- Filled by the rules engine in T3; empty after seed.
CREATE TABLE public.divergencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurante_id uuid NOT NULL REFERENCES public.restaurantes (id) ON DELETE CASCADE,
  pedido_id uuid REFERENCES public.pedidos (id) ON DELETE SET NULL,
  pedido_id_ifood text,
  tipo text NOT NULL,
  descricao text NOT NULL,
  valor_esperado numeric(12, 2),
  valor_cobrado numeric(12, 2),
  impacto_rs numeric(12, 2) NOT NULL,
  data_apuracao_inicio date,
  detectada_em timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'confirmada', 'descartada'))
);

CREATE INDEX divergencias_restaurante_idx
  ON public.divergencias (restaurante_id);

-- ---------------------------------------------------------------------------
-- Grants: no anon access; authenticated may SELECT (RLS still applies)
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.restaurantes FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.contratos FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.pedidos FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.lancamentos FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.divergencias FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.restaurantes TO authenticated;
GRANT SELECT ON TABLE public.contratos TO authenticated;
GRANT SELECT ON TABLE public.pedidos TO authenticated;
GRANT SELECT ON TABLE public.lancamentos TO authenticated;
GRANT SELECT ON TABLE public.divergencias TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS: each authenticated user reads only their restaurant's rows
-- ---------------------------------------------------------------------------

ALTER TABLE public.restaurantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divergencias ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.restaurantes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contratos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lancamentos FORCE ROW LEVEL SECURITY;
ALTER TABLE public.divergencias FORCE ROW LEVEL SECURITY;

CREATE POLICY restaurantes_select_own
  ON public.restaurantes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY contratos_select_own
  ON public.contratos
  FOR SELECT
  TO authenticated
  USING (
    restaurante_id IN (
      SELECT r.id FROM public.restaurantes r WHERE r.user_id = auth.uid()
    )
  );

CREATE POLICY pedidos_select_own
  ON public.pedidos
  FOR SELECT
  TO authenticated
  USING (
    restaurante_id IN (
      SELECT r.id FROM public.restaurantes r WHERE r.user_id = auth.uid()
    )
  );

CREATE POLICY lancamentos_select_own
  ON public.lancamentos
  FOR SELECT
  TO authenticated
  USING (
    restaurante_id IN (
      SELECT r.id FROM public.restaurantes r WHERE r.user_id = auth.uid()
    )
  );

CREATE POLICY divergencias_select_own
  ON public.divergencias
  FOR SELECT
  TO authenticated
  USING (
    restaurante_id IN (
      SELECT r.id FROM public.restaurantes r WHERE r.user_id = auth.uid()
    )
  );
