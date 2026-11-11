import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { addDays } from './dates.ts'
import { analyzeRepasse } from './engine.ts'
import { buildSeedFixture, SEED_MD_DIVERGENCES } from './fixtures/seedFixture.ts'
import { centsToReais, percentOfCents, reaisToCents } from './money.ts'
import {
  DESCRICAO_COMISSAO,
  DESCRICAO_DEBITO_CANCELAMENTO,
  DESCRICAO_TAXA_ONLINE,
  ORIENTACAO_SEM_PRAZO,
  type AnalyzeInput,
  type ContratoInput,
  type LancamentoInput,
  type PedidoInput,
} from './types.ts'

const CONTRATO: ContratoInput = {
  comissao_percentual: 12,
  taxa_pagamento_online_percentual: 3.2,
  taxa_repasse_semanal: 1.99,
}

const TODAY = '2026-11-11'

function basePedido(overrides: Partial<PedidoInput> & Pick<PedidoInput, 'pedido_id_ifood'>): PedidoInput {
  return {
    id: `ped-${overrides.pedido_id_ifood}`,
    metodo_pagamento: 'ONLINE',
    status: 'ENTREGUE',
    valor_total: 100,
    data_criacao: TODAY,
    ...overrides,
  }
}

function lan(
  partial: Omit<LancamentoInput, 'impacto_no_repasse' | 'titulo' | 'data_apuracao_fim'> &
    Partial<Pick<LancamentoInput, 'impacto_no_repasse' | 'titulo' | 'data_apuracao_fim'>>,
): LancamentoInput {
  return {
    impacto_no_repasse: true,
    titulo: 'REPASSE-W0',
    data_apuracao_fim: partial.data_apuracao_inicio,
    ...partial,
  }
}

describe('money helpers', () => {
  it('converts reais without float drift', () => {
    assert.equal(reaisToCents('16.50'), 1650)
    assert.equal(reaisToCents(-34.5), -3450)
    assert.equal(centsToReais(1650), '16.50')
    assert.equal(percentOfCents(15000, 12), 1800)
    assert.equal(percentOfCents(15000, 23), 3450)
    assert.equal(percentOfCents(12500, 3.2), 400)
  })
})

describe('comissao_acima_contrato', () => {
  it('flags commission charged above the contract rate', () => {
    const pedido = basePedido({
      pedido_id_ifood: 'DEMO-ANOM-001',
      valor_total: 150,
      data_criacao: addDays(TODAY, -16),
    })
    const input: AnalyzeInput = {
      contrato: CONTRATO,
      today: TODAY,
      pedidos: [pedido],
      lancamentos: [
        lan({
          id: 'lan-1',
          pedido_id: pedido.id,
          pedido_id_ifood: pedido.pedido_id_ifood,
          descricao_lancamento: DESCRICAO_COMISSAO,
          valor: -34.5,
          base_calculo: 150,
          percentual_taxa: 23,
          data_apuracao_inicio: addDays(TODAY, -20),
          titulo: 'REPASSE-W2',
        }),
      ],
    }

    const result = analyzeRepasse(input)
    assert.equal(result.divergencias.length, 1)
    const d = result.divergencias[0]!
    assert.equal(d.tipo, 'comissao_acima_contrato')
    assert.equal(d.pedido_id_ifood, 'DEMO-ANOM-001')
    assert.equal(d.valor_cobrado, '34.50')
    assert.equal(d.valor_esperado, '18.00')
    assert.equal(d.diferenca, '16.50')
    assert.equal(d.data_limite, null)
    assert.equal(d.prazo_aberto, null)
    assert.equal(d.orientacao, ORIENTACAO_SEM_PRAZO)
  })
})

describe('cobranca_duplicada', () => {
  it('flags a duplicate commission charge', () => {
    const pedido = basePedido({
      pedido_id_ifood: 'DEMO-ANOM-002',
      valor_total: 100,
    })
    const input: AnalyzeInput = {
      contrato: CONTRATO,
      today: TODAY,
      pedidos: [pedido],
      lancamentos: [
        lan({
          id: 'lan-a',
          pedido_id: pedido.id,
          pedido_id_ifood: pedido.pedido_id_ifood,
          descricao_lancamento: DESCRICAO_COMISSAO,
          valor: -12,
          base_calculo: 100,
          percentual_taxa: 12,
          data_apuracao_inicio: addDays(TODAY, -20),
          titulo: 'REPASSE-W2',
        }),
        lan({
          id: 'lan-b',
          pedido_id: pedido.id,
          pedido_id_ifood: pedido.pedido_id_ifood,
          descricao_lancamento: DESCRICAO_COMISSAO,
          valor: -12,
          base_calculo: 100,
          percentual_taxa: 12,
          data_apuracao_inicio: addDays(TODAY, -20),
          titulo: 'REPASSE-W2',
        }),
      ],
    }

    const result = analyzeRepasse(input)
    assert.equal(result.divergencias.length, 1)
    const d = result.divergencias[0]!
    assert.equal(d.tipo, 'cobranca_duplicada')
    assert.equal(d.diferenca, '12.00')
    assert.deepEqual(d.lancamento_ids, ['lan-b'])
    assert.equal(d.orientacao, ORIENTACAO_SEM_PRAZO)
    assert.equal(d.data_limite, null)
  })
})

describe('cancelamento_debitado', () => {
  it('flags a cancellation debit and marks prazo open when within 7 days', () => {
    const pedido = basePedido({
      pedido_id_ifood: 'DEMO-ANOM-003',
      status: 'CANCELADO',
      valor_total: 80,
      data_criacao: addDays(TODAY, -3),
    })
    const input: AnalyzeInput = {
      contrato: CONTRATO,
      today: TODAY,
      pedidos: [pedido],
      lancamentos: [
        lan({
          id: 'lan-deb',
          pedido_id: pedido.id,
          pedido_id_ifood: pedido.pedido_id_ifood,
          descricao_lancamento: DESCRICAO_DEBITO_CANCELAMENTO,
          valor: -80,
          base_calculo: 80,
          percentual_taxa: null,
          data_apuracao_inicio: addDays(TODAY, -6),
          titulo: 'REPASSE-W0',
        }),
      ],
    }

    const result = analyzeRepasse(input)
    assert.equal(result.divergencias.length, 1)
    const d = result.divergencias[0]!
    assert.equal(d.tipo, 'cancelamento_debitado')
    assert.equal(d.diferenca, '80.00')
    assert.equal(d.data_limite, addDays(TODAY, 4)) // criacao-3 + 7
    assert.equal(d.prazo_aberto, true)
    assert.match(d.orientacao, /contestar cancelamento até/)
  })

  it('marks prazo expired for a cancellation older than 7 days', () => {
    const pedido = basePedido({
      pedido_id_ifood: 'DEMO-ANOM-004',
      status: 'CANCELADO',
      valor_total: 95,
      data_criacao: addDays(TODAY, -24),
    })
    const input: AnalyzeInput = {
      contrato: CONTRATO,
      today: TODAY,
      pedidos: [pedido],
      lancamentos: [
        lan({
          id: 'lan-deb-old',
          pedido_id: pedido.id,
          pedido_id_ifood: pedido.pedido_id_ifood,
          descricao_lancamento: DESCRICAO_DEBITO_CANCELAMENTO,
          valor: -95,
          base_calculo: 95,
          percentual_taxa: null,
          data_apuracao_inicio: addDays(TODAY, -27),
          titulo: 'REPASSE-W3',
        }),
      ],
    }

    const result = analyzeRepasse(input)
    const d = result.divergencias[0]!
    assert.equal(d.prazo_aberto, false)
    assert.equal(d.data_limite, addDays(TODAY, -17))
    assert.match(d.orientacao, /expirado/)
  })
})

describe('taxa_online_em_pago_na_entrega', () => {
  it('flags an online fee charged on a pay-on-delivery order', () => {
    const pedido = basePedido({
      pedido_id_ifood: 'DEMO-ANOM-005',
      metodo_pagamento: 'PAGO_NA_ENTREGA',
      valor_total: 125,
      data_criacao: addDays(TODAY, -5),
    })
    const input: AnalyzeInput = {
      contrato: CONTRATO,
      today: TODAY,
      pedidos: [pedido],
      lancamentos: [
        lan({
          id: 'lan-fee',
          pedido_id: pedido.id,
          pedido_id_ifood: pedido.pedido_id_ifood,
          descricao_lancamento: DESCRICAO_TAXA_ONLINE,
          valor: -4,
          base_calculo: 125,
          percentual_taxa: 3.2,
          data_apuracao_inicio: addDays(TODAY, -6),
          titulo: 'REPASSE-W0',
        }),
      ],
    }

    const result = analyzeRepasse(input)
    assert.equal(result.divergencias.length, 1)
    const d = result.divergencias[0]!
    assert.equal(d.tipo, 'taxa_online_em_pago_na_entrega')
    assert.equal(d.diferenca, '4.00')
    assert.equal(d.orientacao, ORIENTACAO_SEM_PRAZO)
    assert.equal(d.data_limite, null)
  })
})

describe('clean order', () => {
  it('produces no divergence for a correctly charged online order', () => {
    const pedido = basePedido({
      pedido_id_ifood: 'DEMO-PED-CLEAN',
      valor_total: 100,
    })
    const input: AnalyzeInput = {
      contrato: CONTRATO,
      today: TODAY,
      pedidos: [pedido],
      lancamentos: [
        lan({
          id: 'lan-c',
          pedido_id: pedido.id,
          pedido_id_ifood: pedido.pedido_id_ifood,
          descricao_lancamento: DESCRICAO_COMISSAO,
          valor: -12,
          base_calculo: 100,
          percentual_taxa: 12,
          data_apuracao_inicio: TODAY,
        }),
        lan({
          id: 'lan-t',
          pedido_id: pedido.id,
          pedido_id_ifood: pedido.pedido_id_ifood,
          descricao_lancamento: DESCRICAO_TAXA_ONLINE,
          valor: -3.2,
          base_calculo: 100,
          percentual_taxa: 3.2,
          data_apuracao_inicio: TODAY,
        }),
      ],
    }

    const result = analyzeRepasse(input)
    assert.deepEqual(result.divergencias, [])
    assert.equal(result.perdido_total, '0.00')
  })
})

describe('full seed fixture', () => {
  it('matches the 5 SEED.md divergences with exact R$ amounts', () => {
    const fixture = buildSeedFixture(TODAY)
    assert.equal(fixture.pedidos.length, 25)
    assert.equal(fixture.lancamentos.length, 49)

    const result = analyzeRepasse(fixture)
    assert.equal(result.divergencias.length, 5)

    const summary = result.divergencias.map((d) => ({
      pedido_id_ifood: d.pedido_id_ifood,
      tipo: d.tipo,
      diferenca: d.diferenca,
    }))
    assert.deepEqual(summary, SEED_MD_DIVERGENCES)

    const byId = Object.fromEntries(
      result.divergencias.map((d) => [d.pedido_id_ifood, d]),
    )
    assert.equal(byId['DEMO-ANOM-003']!.prazo_aberto, true)
    assert.equal(byId['DEMO-ANOM-004']!.prazo_aberto, false)
    assert.equal(byId['DEMO-ANOM-001']!.data_limite, null)
    assert.equal(byId['DEMO-ANOM-002']!.orientacao, ORIENTACAO_SEM_PRAZO)
    assert.equal(byId['DEMO-ANOM-005']!.orientacao, ORIENTACAO_SEM_PRAZO)

    assert.equal(result.perdido_por_tipo.comissao_acima_contrato, '16.50')
    assert.equal(result.perdido_por_tipo.cobranca_duplicada, '12.00')
    assert.equal(result.perdido_por_tipo.cancelamento_debitado, '175.00')
    assert.equal(result.perdido_por_tipo.taxa_online_em_pago_na_entrega, '4.00')
    assert.equal(result.perdido_total, '207.50')

    assert.equal(result.totais_por_semana.length, 4)
    for (const week of result.totais_por_semana) {
      assert.equal(week.diferenca_centavos, week.esperado_centavos - week.repassado_centavos)
      assert.ok(week.diferenca_centavos >= 0)
    }
  })
})
