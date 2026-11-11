import type {
  AnalyzeResult,
  ContratoInput,
  LancamentoInput,
  PedidoInput,
} from '../rules/index.ts'
import { analyzeRepasse } from '../rules/index.ts'

/** Minimal Supabase client surface used by the agent tools. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AgentSupabase = { from: (table: string) => any }

export type LoadedRestaurantData = {
  restaurante: {
    id: string
    nome: string
    user_id: string
  }
  contrato: ContratoInput & {
    id: string
    plano: string
    ativo: boolean
  }
  pedidos: Array<
    PedidoInput & {
      motivo_cancelamento?: string | null
    }
  >
  lancamentos: LancamentoInput[]
  engine: AnalyzeResult
}

async function awaitQuery<T>(query: unknown): Promise<T> {
  const result = (await query) as { data: T; error: { message: string } | null }
  if (result.error) {
    throw new Error(result.error.message)
  }
  return result.data
}

export async function loadRestaurantData(
  supabase: AgentSupabase,
  today: string,
): Promise<LoadedRestaurantData> {
  const restaurante = await awaitQuery<{
    id: string
    nome: string
    user_id: string
  } | null>(supabase.from('restaurantes').select('id, nome, user_id').limit(1).maybeSingle())

  if (!restaurante) {
    throw new Error('Nenhum restaurante encontrado para este usuário.')
  }

  const contratoRow = await awaitQuery<{
    id: string
    plano: string
    comissao_percentual: number | string
    taxa_pagamento_online_percentual: number | string
    taxa_repasse_semanal: number | string
    ativo: boolean
  } | null>(
    supabase
      .from('contratos')
      .select(
        'id, plano, comissao_percentual, taxa_pagamento_online_percentual, taxa_repasse_semanal, ativo',
      )
      .eq('ativo', true)
      .limit(1)
      .maybeSingle(),
  )

  if (!contratoRow) {
    throw new Error('Contrato ativo não encontrado.')
  }

  const pedidosRaw = await awaitQuery<
    Array<{
      id: string
      pedido_id_ifood: string
      metodo_pagamento: 'ONLINE' | 'PAGO_NA_ENTREGA'
      status: string
      valor_total: number | string
      data_criacao: string
      motivo_cancelamento: string | null
    }>
  >(
    supabase
      .from('pedidos')
      .select(
        'id, pedido_id_ifood, metodo_pagamento, status, valor_total, data_criacao, motivo_cancelamento',
      )
      .order('data_criacao', { ascending: true }),
  )

  const lancamentosRaw = await awaitQuery<
    Array<{
      id: string
      pedido_id: string | null
      pedido_id_ifood: string | null
      descricao_lancamento: string
      valor: number | string
      base_calculo: number | string | null
      percentual_taxa: number | string | null
      data_apuracao_inicio: string
      data_apuracao_fim: string
      titulo: string | null
      impacto_no_repasse: boolean
    }>
  >(
    supabase
      .from('lancamentos')
      .select(
        'id, pedido_id, pedido_id_ifood, descricao_lancamento, valor, base_calculo, percentual_taxa, data_apuracao_inicio, data_apuracao_fim, titulo, impacto_no_repasse',
      )
      .order('data_apuracao_inicio', { ascending: true }),
  )

  const pedidos: LoadedRestaurantData['pedidos'] = (pedidosRaw ?? []).map((p) => ({
    id: p.id,
    pedido_id_ifood: p.pedido_id_ifood,
    metodo_pagamento: p.metodo_pagamento,
    status: p.status,
    valor_total: p.valor_total,
    data_criacao: p.data_criacao,
    motivo_cancelamento: p.motivo_cancelamento,
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

  const contrato: LoadedRestaurantData['contrato'] = {
    id: contratoRow.id,
    plano: contratoRow.plano,
    ativo: contratoRow.ativo,
    comissao_percentual: contratoRow.comissao_percentual,
    taxa_pagamento_online_percentual: contratoRow.taxa_pagamento_online_percentual,
    taxa_repasse_semanal: contratoRow.taxa_repasse_semanal,
  }

  const engine = analyzeRepasse({
    contrato,
    pedidos,
    lancamentos,
    today,
  })

  return {
    restaurante,
    contrato,
    pedidos,
    lancamentos,
    engine,
  }
}
