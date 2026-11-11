import { addDays, isOnOrBefore } from './dates.ts'
import { centsToReais, percentOfCents, reaisToCents } from './money.ts'
import {
  DESCRICAO_COMISSAO,
  DESCRICAO_DEBITO_CANCELAMENTO,
  DESCRICAO_TAXA_ONLINE,
  ORIENTACAO_SEM_PRAZO,
  PRAZO_CANCELAMENTO_DIAS,
  type AnalyzeInput,
  type AnalyzeResult,
  type Divergence,
  type DivergenceType,
  type LancamentoInput,
  type PedidoInput,
  type WeekTotal,
} from './types.ts'

function weekKey(l: Pick<LancamentoInput, 'titulo' | 'data_apuracao_inicio'>): string {
  return l.titulo ?? l.data_apuracao_inicio
}

function absCents(value: number | string): number {
  return Math.abs(reaisToCents(value))
}

function orientacaoCancelamento(dataLimite: string, prazoAberto: boolean): string {
  if (prazoAberto) {
    return `contestar cancelamento até ${dataLimite} (prazo de ${PRAZO_CANCELAMENTO_DIAS} dias a partir da data do pedido)`
  }
  return `prazo de ${PRAZO_CANCELAMENTO_DIAS} dias expirado em ${dataLimite}; abrir chamado no suporte`
}

function emptyLostByType(): Record<DivergenceType, number> {
  return {
    comissao_acima_contrato: 0,
    cobranca_duplicada: 0,
    cancelamento_debitado: 0,
    taxa_online_em_pago_na_entrega: 0,
  }
}

/**
 * Pure rules engine: expected fees from the contract vs lançamentos,
 * flagging planted divergence types with exact-cent R$ amounts.
 */
export function analyzeRepasse(input: AnalyzeInput): AnalyzeResult {
  const { contrato, pedidos, lancamentos, today } = input
  const comissaoPct = contrato.comissao_percentual

  const pedidosByIfood = new Map<string, PedidoInput>()
  for (const p of pedidos) {
    pedidosByIfood.set(p.pedido_id_ifood, p)
  }

  const lancamentosByPedido = new Map<string, LancamentoInput[]>()
  for (const l of lancamentos) {
    if (!l.pedido_id_ifood) continue
    const list = lancamentosByPedido.get(l.pedido_id_ifood) ?? []
    list.push(l)
    lancamentosByPedido.set(l.pedido_id_ifood, list)
  }

  const divergencias: Divergence[] = []
  const recoveredByWeek = new Map<string, number>()

  const bumpWeek = (semana: string, cents: number) => {
    recoveredByWeek.set(semana, (recoveredByWeek.get(semana) ?? 0) + cents)
  }

  for (const [pedidoIfood, lines] of lancamentosByPedido) {
    const pedido = pedidosByIfood.get(pedidoIfood)
    if (!pedido) continue

    const comissoes = lines.filter((l) => l.descricao_lancamento === DESCRICAO_COMISSAO)
    const taxasOnline = lines.filter((l) => l.descricao_lancamento === DESCRICAO_TAXA_ONLINE)
    const debitosCancel = lines.filter(
      (l) => l.descricao_lancamento === DESCRICAO_DEBITO_CANCELAMENTO,
    )

    // --- (2) duplicate commission charges ---
    // Keep the first commission row as the canonical charge; extras are duplicates.
    let canonicalComissao: LancamentoInput | null = comissoes[0] ?? null
    if (comissoes.length > 1) {
      const extras = comissoes.slice(1)
      const cobrado = extras.reduce((sum, l) => sum + absCents(l.valor), 0)
      const semana = weekKey(extras[0]!)
      divergencias.push({
        tipo: 'cobranca_duplicada',
        pedido_id_ifood: pedidoIfood,
        pedido_ids: [pedido.id],
        lancamento_ids: extras.map((l) => l.id),
        valor_cobrado: centsToReais(cobrado),
        valor_esperado: centsToReais(0),
        diferenca: centsToReais(cobrado),
        diferenca_centavos: cobrado,
        semana,
        data_apuracao_inicio: extras[0]!.data_apuracao_inicio,
        orientacao: ORIENTACAO_SEM_PRAZO,
        data_limite: null,
        prazo_aberto: null,
      })
      bumpWeek(semana, cobrado)
      canonicalComissao = comissoes[0]!
    }

    // --- (1) commission above contract (on the canonical / sole commission row) ---
    if (canonicalComissao) {
      const valorPedidoCents = reaisToCents(pedido.valor_total)
      const esperadoCents = percentOfCents(valorPedidoCents, comissaoPct)
      const cobradoCents = absCents(canonicalComissao.valor)
      if (cobradoCents > esperadoCents) {
        const diff = cobradoCents - esperadoCents
        const semana = weekKey(canonicalComissao)
        divergencias.push({
          tipo: 'comissao_acima_contrato',
          pedido_id_ifood: pedidoIfood,
          pedido_ids: [pedido.id],
          lancamento_ids: [canonicalComissao.id],
          valor_cobrado: centsToReais(cobradoCents),
          valor_esperado: centsToReais(esperadoCents),
          diferenca: centsToReais(diff),
          diferenca_centavos: diff,
          semana,
          data_apuracao_inicio: canonicalComissao.data_apuracao_inicio,
          orientacao: ORIENTACAO_SEM_PRAZO,
          data_limite: null,
          prazo_aberto: null,
        })
        bumpWeek(semana, diff)
      }
    }

    // --- (3) deducted cancellation (deadline ONLY here) ---
    if (pedido.status === 'CANCELADO' && debitosCancel.length > 0) {
      for (const debito of debitosCancel) {
        const cobrado = absCents(debito.valor)
        const dataLimite = addDays(pedido.data_criacao, PRAZO_CANCELAMENTO_DIAS)
        const prazoAberto = isOnOrBefore(today, dataLimite)
        const semana = weekKey(debito)
        divergencias.push({
          tipo: 'cancelamento_debitado',
          pedido_id_ifood: pedidoIfood,
          pedido_ids: [pedido.id],
          lancamento_ids: [debito.id],
          valor_cobrado: centsToReais(cobrado),
          valor_esperado: centsToReais(0),
          diferenca: centsToReais(cobrado),
          diferenca_centavos: cobrado,
          semana,
          data_apuracao_inicio: debito.data_apuracao_inicio,
          orientacao: orientacaoCancelamento(dataLimite, prazoAberto),
          data_limite: dataLimite,
          prazo_aberto: prazoAberto,
        })
        bumpWeek(semana, cobrado)
      }
    }

    // --- (4) online payment fee on pay-on-delivery ---
    if (pedido.metodo_pagamento === 'PAGO_NA_ENTREGA' && taxasOnline.length > 0) {
      for (const taxa of taxasOnline) {
        const cobrado = absCents(taxa.valor)
        const semana = weekKey(taxa)
        divergencias.push({
          tipo: 'taxa_online_em_pago_na_entrega',
          pedido_id_ifood: pedidoIfood,
          pedido_ids: [pedido.id],
          lancamento_ids: [taxa.id],
          valor_cobrado: centsToReais(cobrado),
          valor_esperado: centsToReais(0),
          diferenca: centsToReais(cobrado),
          diferenca_centavos: cobrado,
          semana,
          data_apuracao_inicio: taxa.data_apuracao_inicio,
          orientacao: ORIENTACAO_SEM_PRAZO,
          data_limite: null,
          prazo_aberto: null,
        })
        bumpWeek(semana, cobrado)
      }
    }
  }

  divergencias.sort((a, b) => {
    const byPedido = a.pedido_id_ifood.localeCompare(b.pedido_id_ifood)
    if (byPedido !== 0) return byPedido
    return a.tipo.localeCompare(b.tipo)
  })

  const totais_por_semana = buildWeekTotals(lancamentos, recoveredByWeek)
  const perdido_por_tipo_centavos = emptyLostByType()
  for (const d of divergencias) {
    perdido_por_tipo_centavos[d.tipo] += d.diferenca_centavos
  }

  const perdido_total_centavos = Object.values(perdido_por_tipo_centavos).reduce(
    (a, b) => a + b,
    0,
  )

  const perdido_por_tipo = {
    comissao_acima_contrato: centsToReais(perdido_por_tipo_centavos.comissao_acima_contrato),
    cobranca_duplicada: centsToReais(perdido_por_tipo_centavos.cobranca_duplicada),
    cancelamento_debitado: centsToReais(perdido_por_tipo_centavos.cancelamento_debitado),
    taxa_online_em_pago_na_entrega: centsToReais(
      perdido_por_tipo_centavos.taxa_online_em_pago_na_entrega,
    ),
  }

  return {
    divergencias,
    totais_por_semana,
    perdido_por_tipo,
    perdido_por_tipo_centavos,
    perdido_total: centsToReais(perdido_total_centavos),
    perdido_total_centavos,
  }
}

function buildWeekTotals(
  lancamentos: LancamentoInput[],
  recoveredByWeek: Map<string, number>,
): WeekTotal[] {
  type Acc = {
    semana: string
    data_apuracao_inicio: string
    data_apuracao_fim: string
    repassado_centavos: number
  }

  const byWeek = new Map<string, Acc>()

  for (const l of lancamentos) {
    if (!l.impacto_no_repasse) continue
    const semana = weekKey(l)
    const existing = byWeek.get(semana)
    const valor = reaisToCents(l.valor)
    if (existing) {
      existing.repassado_centavos += valor
      if (l.data_apuracao_inicio < existing.data_apuracao_inicio) {
        existing.data_apuracao_inicio = l.data_apuracao_inicio
      }
      if (l.data_apuracao_fim > existing.data_apuracao_fim) {
        existing.data_apuracao_fim = l.data_apuracao_fim
      }
    } else {
      byWeek.set(semana, {
        semana,
        data_apuracao_inicio: l.data_apuracao_inicio,
        data_apuracao_fim: l.data_apuracao_fim,
        repassado_centavos: valor,
      })
    }
  }

  const rows: WeekTotal[] = []
  for (const acc of byWeek.values()) {
    const recovered = recoveredByWeek.get(acc.semana) ?? 0
    // Overcharges are negative in repassado; adding recovered cents yields the
    // net the restaurant should have kept for that week.
    const esperado_centavos = acc.repassado_centavos + recovered
    const diferenca_centavos = esperado_centavos - acc.repassado_centavos
    rows.push({
      semana: acc.semana,
      data_apuracao_inicio: acc.data_apuracao_inicio,
      data_apuracao_fim: acc.data_apuracao_fim,
      repassado: centsToReais(acc.repassado_centavos),
      repassado_centavos: acc.repassado_centavos,
      esperado: centsToReais(esperado_centavos),
      esperado_centavos,
      diferenca: centsToReais(diferenca_centavos),
      diferenca_centavos,
    })
  }

  rows.sort((a, b) => a.data_apuracao_inicio.localeCompare(b.data_apuracao_inicio))
  return rows
}
