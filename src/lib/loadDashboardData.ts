import {
  analyzeRepasse,
  type AnalyzeResult,
  type ContratoInput,
  type Divergence,
  type LancamentoInput,
  type PedidoInput,
} from '../rules/index.ts'
import { todayInSaoPaulo } from '../agent/dates.ts'
import { supabase } from './supabase.ts'

export type DashboardData = {
  today: string
  restauranteNome: string
  engine: AnalyzeResult
}

/**
 * Load the demo user's RLS-scoped rows via supabase-js and run the T3 engine in the browser.
 * All money figures on the dashboard come from `engine` — no parallel frontend math.
 */
export async function loadDashboardData(): Promise<DashboardData> {
  const today = todayInSaoPaulo()

  const { data: restaurante, error: restError } = await supabase
    .from('restaurantes')
    .select('id, nome')
    .limit(1)
    .maybeSingle()

  if (restError) throw new Error(restError.message)
  if (!restaurante) throw new Error('Nenhum restaurante encontrado para este usuário.')

  const { data: contratoRow, error: contratoError } = await supabase
    .from('contratos')
    .select(
      'comissao_percentual, taxa_pagamento_online_percentual, taxa_repasse_semanal, ativo',
    )
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()

  if (contratoError) throw new Error(contratoError.message)
  if (!contratoRow) throw new Error('Contrato ativo não encontrado.')

  const { data: pedidosRaw, error: pedidosError } = await supabase
    .from('pedidos')
    .select(
      'id, pedido_id_ifood, metodo_pagamento, status, valor_total, data_criacao',
    )
    .order('data_criacao', { ascending: true })

  if (pedidosError) throw new Error(pedidosError.message)

  const { data: lancamentosRaw, error: lancError } = await supabase
    .from('lancamentos')
    .select(
      'id, pedido_id, pedido_id_ifood, descricao_lancamento, valor, base_calculo, percentual_taxa, data_apuracao_inicio, data_apuracao_fim, titulo, impacto_no_repasse',
    )
    .order('data_apuracao_inicio', { ascending: true })

  if (lancError) throw new Error(lancError.message)

  const contrato: ContratoInput = {
    comissao_percentual: contratoRow.comissao_percentual,
    taxa_pagamento_online_percentual: contratoRow.taxa_pagamento_online_percentual,
    taxa_repasse_semanal: contratoRow.taxa_repasse_semanal,
  }

  const pedidos: PedidoInput[] = (pedidosRaw ?? []).map((p) => ({
    id: p.id,
    pedido_id_ifood: p.pedido_id_ifood,
    metodo_pagamento: p.metodo_pagamento,
    status: p.status,
    valor_total: p.valor_total,
    data_criacao: p.data_criacao,
  }))

  const lancamentos: LancamentoInput[] = (lancamentosRaw ?? []).map((l) => ({
    id: l.id,
    pedido_id: l.pedido_id,
    pedido_id_ifood: l.pedido_id_ifood,
    descricao_lancamento: l.descricao_lancamento,
    valor: l.valor,
    base_calculo: l.base_calculo,
    percentual_taxa: l.percentual_taxa,
    data_apuracao_inicio: l.data_apuracao_inicio,
    data_apuracao_fim: l.data_apuracao_fim,
    titulo: l.titulo,
    impacto_no_repasse: l.impacto_no_repasse,
  }))

  const engine = analyzeRepasse({ contrato, pedidos, lancamentos, today })

  return {
    today,
    restauranteNome: restaurante.nome,
    engine,
  }
}

export type DivergenceTypeLabel = {
  tipo: Divergence['tipo']
  label: string
}

export const DIVERGENCE_TYPE_LABELS: Record<Divergence['tipo'], string> = {
  comissao_acima_contrato: 'Comissão acima do contrato',
  cobranca_duplicada: 'Cobrança duplicada',
  cancelamento_debitado: 'Cancelamento debitado',
  taxa_online_em_pago_na_entrega: 'Taxa online em pago na entrega',
}
