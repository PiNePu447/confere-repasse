/**
 * Deterministic fixture mirroring supabase/seed.sql relative to an anchor `today`.
 * Used by unit tests — not loaded from the DB.
 */
import { addDays } from '../dates.ts'
import { centsToReais, percentOfCents, reaisToCents } from '../money.ts'
import type {
  AnalyzeInput,
  ContratoInput,
  LancamentoInput,
  PedidoInput,
} from '../types.ts'
import {
  DESCRICAO_COMISSAO,
  DESCRICAO_DEBITO_CANCELAMENTO,
  DESCRICAO_TAXA_ONLINE,
  DESCRICAO_TAXA_REPASSE,
} from '../types.ts'

const CONTRATO: ContratoInput = {
  comissao_percentual: 12,
  taxa_pagamento_online_percentual: 3.2,
  taxa_repasse_semanal: 1.99,
}

type Week = {
  semana: number
  inicio: string
  fim: string
  repasse: string
}

function weeksFor(today: string): Week[] {
  return [
    { semana: 0, inicio: addDays(today, -6), fim: today, repasse: addDays(today, 1) },
    {
      semana: 1,
      inicio: addDays(today, -13),
      fim: addDays(today, -7),
      repasse: addDays(today, -6),
    },
    {
      semana: 2,
      inicio: addDays(today, -20),
      fim: addDays(today, -14),
      repasse: addDays(today, -13),
    },
    {
      semana: 3,
      inicio: addDays(today, -27),
      fim: addDays(today, -21),
      repasse: addDays(today, -20),
    },
  ]
}

function pedidoId(ifood: string): string {
  return `ped-${ifood}`
}

function lanId(ifood: string, kind: string, seq: number): string {
  return `lan-${ifood}-${kind}-${seq}`
}

function pushComissao(
  out: LancamentoInput[],
  pedido: PedidoInput,
  week: Week,
  opts: { percent: number | string; seq?: number },
): void {
  const base = reaisToCents(pedido.valor_total)
  const amount = percentOfCents(base, opts.percent)
  out.push({
    id: lanId(pedido.pedido_id_ifood, 'comissao', opts.seq ?? 1),
    pedido_id: pedido.id,
    pedido_id_ifood: pedido.pedido_id_ifood,
    descricao_lancamento: DESCRICAO_COMISSAO,
    valor: centsToReais(-amount),
    base_calculo: pedido.valor_total,
    percentual_taxa: opts.percent,
    data_apuracao_inicio: week.inicio,
    data_apuracao_fim: week.fim,
    titulo: `REPASSE-W${week.semana}`,
    impacto_no_repasse: true,
  })
}

function pushTaxaOnline(
  out: LancamentoInput[],
  pedido: PedidoInput,
  week: Week,
  contrato: ContratoInput,
  seq = 1,
): void {
  const base = reaisToCents(pedido.valor_total)
  const amount = percentOfCents(base, contrato.taxa_pagamento_online_percentual)
  out.push({
    id: lanId(pedido.pedido_id_ifood, 'taxa-online', seq),
    pedido_id: pedido.id,
    pedido_id_ifood: pedido.pedido_id_ifood,
    descricao_lancamento: DESCRICAO_TAXA_ONLINE,
    valor: centsToReais(-amount),
    base_calculo: pedido.valor_total,
    percentual_taxa: contrato.taxa_pagamento_online_percentual,
    data_apuracao_inicio: week.inicio,
    data_apuracao_fim: week.fim,
    titulo: `REPASSE-W${week.semana}`,
    impacto_no_repasse: true,
  })
}

/** Build AnalyzeInput equivalent to the committed seed for a given `today`. */
export function buildSeedFixture(today: string): AnalyzeInput {
  const weeks = weeksFor(today)
  const pedidos: PedidoInput[] = []
  const lancamentos: LancamentoInput[] = []

  for (const week of weeks) {
    for (let n = 1; n <= 5; n++) {
      const ifood = `DEMO-PED-W${week.semana}-N${n}`
      const metodo =
        (week.semana + n) % 3 === 0 ? 'PAGO_NA_ENTREGA' : 'ONLINE'
      const valor = 45 + week.semana * 7 + n * 8.5
      const pedido: PedidoInput = {
        id: pedidoId(ifood),
        pedido_id_ifood: ifood,
        metodo_pagamento: metodo,
        status: 'ENTREGUE',
        valor_total: Number(valor.toFixed(2)),
        data_criacao: addDays(week.inicio, n - 1),
      }
      pedidos.push(pedido)
      pushComissao(lancamentos, pedido, week, {
        percent: CONTRATO.comissao_percentual,
      })
      if (metodo === 'ONLINE') {
        pushTaxaOnline(lancamentos, pedido, week, CONTRATO)
      }
    }

    lancamentos.push({
      id: `lan-weekfee-W${week.semana}`,
      pedido_id: null,
      pedido_id_ifood: null,
      descricao_lancamento: DESCRICAO_TAXA_REPASSE,
      valor: centsToReais(-reaisToCents(CONTRATO.taxa_repasse_semanal)),
      base_calculo: null,
      percentual_taxa: null,
      data_apuracao_inicio: week.inicio,
      data_apuracao_fim: week.fim,
      titulo: `REPASSE-W${week.semana}`,
      impacto_no_repasse: true,
    })
  }

  const weekBySemana = new Map(weeks.map((w) => [w.semana, w]))

  // (1) DEMO-ANOM-001 — commission 23% on R$150
  {
    const week = weekBySemana.get(2)!
    const pedido: PedidoInput = {
      id: pedidoId('DEMO-ANOM-001'),
      pedido_id_ifood: 'DEMO-ANOM-001',
      metodo_pagamento: 'ONLINE',
      status: 'ENTREGUE',
      valor_total: 150,
      data_criacao: addDays(today, -16),
    }
    pedidos.push(pedido)
    pushComissao(lancamentos, pedido, week, { percent: 23 })
    pushTaxaOnline(lancamentos, pedido, week, CONTRATO)
  }

  // (2) DEMO-ANOM-002 — duplicate commission on R$100
  {
    const week = weekBySemana.get(2)!
    const pedido: PedidoInput = {
      id: pedidoId('DEMO-ANOM-002'),
      pedido_id_ifood: 'DEMO-ANOM-002',
      metodo_pagamento: 'ONLINE',
      status: 'ENTREGUE',
      valor_total: 100,
      data_criacao: addDays(today, -18),
    }
    pedidos.push(pedido)
    pushComissao(lancamentos, pedido, week, {
      percent: CONTRATO.comissao_percentual,
      seq: 1,
    })
    pushComissao(lancamentos, pedido, week, {
      percent: CONTRATO.comissao_percentual,
      seq: 2,
    })
    pushTaxaOnline(lancamentos, pedido, week, CONTRATO)
  }

  // (3a) DEMO-ANOM-003 — cancelled, debit, within 7 days
  {
    const week = weekBySemana.get(0)!
    const pedido: PedidoInput = {
      id: pedidoId('DEMO-ANOM-003'),
      pedido_id_ifood: 'DEMO-ANOM-003',
      metodo_pagamento: 'ONLINE',
      status: 'CANCELADO',
      valor_total: 80,
      data_criacao: addDays(today, -3),
    }
    pedidos.push(pedido)
    pushComissao(lancamentos, pedido, week, {
      percent: CONTRATO.comissao_percentual,
    })
    lancamentos.push({
      id: lanId(pedido.pedido_id_ifood, 'debito-cancel', 1),
      pedido_id: pedido.id,
      pedido_id_ifood: pedido.pedido_id_ifood,
      descricao_lancamento: DESCRICAO_DEBITO_CANCELAMENTO,
      valor: '-80.00',
      base_calculo: 80,
      percentual_taxa: null,
      data_apuracao_inicio: week.inicio,
      data_apuracao_fim: week.fim,
      titulo: `REPASSE-W${week.semana}`,
      impacto_no_repasse: true,
    })
  }

  // (3b) DEMO-ANOM-004 — cancelled, debit, older than 7 days
  {
    const week = weekBySemana.get(3)!
    const pedido: PedidoInput = {
      id: pedidoId('DEMO-ANOM-004'),
      pedido_id_ifood: 'DEMO-ANOM-004',
      metodo_pagamento: 'ONLINE',
      status: 'CANCELADO',
      valor_total: 95,
      data_criacao: addDays(today, -24),
    }
    pedidos.push(pedido)
    pushComissao(lancamentos, pedido, week, {
      percent: CONTRATO.comissao_percentual,
    })
    lancamentos.push({
      id: lanId(pedido.pedido_id_ifood, 'debito-cancel', 1),
      pedido_id: pedido.id,
      pedido_id_ifood: pedido.pedido_id_ifood,
      descricao_lancamento: DESCRICAO_DEBITO_CANCELAMENTO,
      valor: '-95.00',
      base_calculo: 95,
      percentual_taxa: null,
      data_apuracao_inicio: week.inicio,
      data_apuracao_fim: week.fim,
      titulo: `REPASSE-W${week.semana}`,
      impacto_no_repasse: true,
    })
  }

  // (4) DEMO-ANOM-005 — online fee on pay-on-delivery R$125
  {
    const week = weekBySemana.get(0)!
    const pedido: PedidoInput = {
      id: pedidoId('DEMO-ANOM-005'),
      pedido_id_ifood: 'DEMO-ANOM-005',
      metodo_pagamento: 'PAGO_NA_ENTREGA',
      status: 'ENTREGUE',
      valor_total: 125,
      data_criacao: addDays(today, -5),
    }
    pedidos.push(pedido)
    pushComissao(lancamentos, pedido, week, {
      percent: CONTRATO.comissao_percentual,
    })
    pushTaxaOnline(lancamentos, pedido, week, CONTRATO)
  }

  return {
    contrato: CONTRATO,
    pedidos,
    lancamentos,
    today,
  }
}

/** SEED.md expected divergences (R$ strings). */
export const SEED_MD_DIVERGENCES = [
  {
    pedido_id_ifood: 'DEMO-ANOM-001',
    tipo: 'comissao_acima_contrato' as const,
    diferenca: '16.50',
  },
  {
    pedido_id_ifood: 'DEMO-ANOM-002',
    tipo: 'cobranca_duplicada' as const,
    diferenca: '12.00',
  },
  {
    pedido_id_ifood: 'DEMO-ANOM-003',
    tipo: 'cancelamento_debitado' as const,
    diferenca: '80.00',
  },
  {
    pedido_id_ifood: 'DEMO-ANOM-004',
    tipo: 'cancelamento_debitado' as const,
    diferenca: '95.00',
  },
  {
    pedido_id_ifood: 'DEMO-ANOM-005',
    tipo: 'taxa_online_em_pago_na_entrega' as const,
    diferenca: '4.00',
  },
]
