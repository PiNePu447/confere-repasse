/** Plain input/output shapes for the rules engine (DB-row-like, no SDK types). */

export type MetodoPagamento = 'ONLINE' | 'PAGO_NA_ENTREGA'

export type ContratoInput = {
  comissao_percentual: number | string
  taxa_pagamento_online_percentual: number | string
  taxa_repasse_semanal: number | string
}

export type PedidoInput = {
  id: string
  pedido_id_ifood: string
  metodo_pagamento: MetodoPagamento
  status: string
  valor_total: number | string
  data_criacao: string // YYYY-MM-DD
}

export type LancamentoInput = {
  id: string
  pedido_id: string | null
  pedido_id_ifood: string | null
  descricao_lancamento: string
  valor: number | string
  base_calculo: number | string | null
  percentual_taxa: number | string | null
  data_apuracao_inicio: string // YYYY-MM-DD
  data_apuracao_fim: string // YYYY-MM-DD
  titulo: string | null
  impacto_no_repasse: boolean
}

export type AnalyzeInput = {
  contrato: ContratoInput
  pedidos: PedidoInput[]
  lancamentos: LancamentoInput[]
  /** Calendar day YYYY-MM-DD — never read the system clock inside the engine. */
  today: string
}

export type DivergenceType =
  | 'comissao_acima_contrato'
  | 'cobranca_duplicada'
  | 'cancelamento_debitado'
  | 'taxa_online_em_pago_na_entrega'

export type Divergence = {
  tipo: DivergenceType
  pedido_id_ifood: string
  pedido_ids: string[]
  lancamento_ids: string[]
  /** Absolute amount charged for the disputed item (R$). */
  valor_cobrado: string
  /** Amount that should have been charged (R$). */
  valor_esperado: string
  /** Restaurant loss in R$ (valor_cobrado - valor_esperado as magnitudes). */
  diferenca: string
  diferenca_centavos: number
  /** Week key: titulo when present, else data_apuracao_inicio. */
  semana: string
  data_apuracao_inicio: string
  orientacao: string
  /** Only for cancelamento_debitado; null for every other type. */
  data_limite: string | null
  /** Only for cancelamento_debitado; null for every other type. */
  prazo_aberto: boolean | null
}

export type WeekTotal = {
  semana: string
  data_apuracao_inicio: string
  data_apuracao_fim: string
  /** Sum of impacting lançamentos (actual payout composition). */
  repassado: string
  repassado_centavos: number
  /** What the week should have netted after removing overcharges. */
  esperado: string
  esperado_centavos: number
  /** esperado - repassado (positive ⇒ restaurant was underpaid). */
  diferenca: string
  diferenca_centavos: number
}

export type AnalyzeResult = {
  divergencias: Divergence[]
  totais_por_semana: WeekTotal[]
  perdido_por_tipo: Record<DivergenceType, string>
  perdido_por_tipo_centavos: Record<DivergenceType, number>
  perdido_total: string
  perdido_total_centavos: number
}

export const ORIENTACAO_SEM_PRAZO =
  'abrir chamado no suporte, sem prazo documentado' as const

export const DESCRICAO_COMISSAO = 'Comissão do iFood'
export const DESCRICAO_TAXA_ONLINE = 'Taxa de pagamento online'
export const DESCRICAO_DEBITO_CANCELAMENTO = 'Débito por cancelamento'
export const DESCRICAO_TAXA_REPASSE = 'Taxa de repasse semanal'

/** Contest window for deducted cancellations only (Product Spec). */
export const PRAZO_CANCELAMENTO_DIAS = 7
