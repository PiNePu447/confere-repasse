import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { analyzeRepasse } from '../src/rules/index.ts'
import { buildSeedFixture } from '../src/rules/fixtures/seedFixture.ts'
import type { LoadedRestaurantData } from '../src/agent/db.ts'
import {
  gradeAnswer,
  indicatesPrazoAberto,
  indicatesPrazoExpirado,
  textContainsIsoDate,
} from './grade.ts'
import type { EvalQuestion } from './types.ts'

const TODAY = '2026-11-11'

function fixtureData(): LoadedRestaurantData {
  const fixture = buildSeedFixture(TODAY)
  return {
    restaurante: {
      id: 'rest-demo',
      nome: 'Restaurante Demo',
      user_id: '05ebcbde-1c83-4768-9b26-c28a7a2a6782',
    },
    contrato: {
      id: 'contrato-demo',
      plano: 'Marketplace',
      ativo: true,
      ...fixture.contrato,
    },
    pedidos: fixture.pedidos,
    lancamentos: fixture.lancamentos,
    engine: analyzeRepasse(fixture),
  }
}

const Q11: EvalQuestion = {
  id: 'q11',
  categoria: 'prazo',
  pergunta: 'O cancelamento DEMO-ANOM-004 ainda está dentro dos 7 dias?',
  grade: {
    mode: 'assert',
    expect_reais: [{ divergencia: 'DEMO-ANOM-004', field: 'diferenca' }],
    expect_ids: ['DEMO-ANOM-004'],
    expect_data_limite_of: 'DEMO-ANOM-004',
    expect_prazo_aberto: false,
  },
}

const Q12: EvalQuestion = {
  id: 'q12',
  categoria: 'prazo',
  pergunta: 'Quais cancelamentos eu ainda posso contestar agora?',
  grade: {
    mode: 'assert',
    expect_reais: [{ divergencia: 'DEMO-ANOM-003', field: 'diferenca' }],
    expect_ids: ['DEMO-ANOM-003'],
    expect_data_limite_of: 'DEMO-ANOM-003',
    expect_prazo_aberto: true,
  },
}

const Q13: EvalQuestion = {
  id: 'q13',
  categoria: 'prazo',
  pergunta: 'Me confirma a data limite para reclamar do débito de cancelamento do DEMO-ANOM-003.',
  grade: {
    mode: 'assert',
    expect_ids: ['DEMO-ANOM-003'],
    expect_data_limite_of: 'DEMO-ANOM-003',
  },
}

describe('grader date + prazo normalization', () => {
  it('accepts dd/mm/yyyy and yyyy-mm-dd for the same day', () => {
    assert.equal(textContainsIsoDate('limite 2026-11-15', '2026-11-15'), true)
    assert.equal(textContainsIsoDate('limite 15/11/2026', '2026-11-15'), true)
    assert.equal(textContainsIsoDate('limite 16/11/2026', '2026-11-15'), false)
  })

  it('recognizes natural Portuguese open/expired flags', () => {
    assert.equal(indicatesPrazoAberto('o prazo ainda está aberto'), true)
    assert.equal(indicatesPrazoAberto('contestação em aberto'), true)
    assert.equal(indicatesPrazoAberto('ainda dentro do prazo'), true)
    assert.equal(indicatesPrazoExpirado('o prazo expirou em 2026-10-25'), true)
    assert.equal(indicatesPrazoExpirado('prazo expirado'), true)
    assert.equal(indicatesPrazoExpirado('o prazo venceu'), true)
    assert.equal(indicatesPrazoExpirado('prazo encerrado'), true)
  })

  it('PASS q12/q13-shaped answers with BR deadline 15/11/2026', () => {
    const data = fixtureData()
    const q12 = gradeAnswer({
      question: Q12,
      data,
      resposta:
        'Ainda pode contestar o pedido iFood DEMO-ANOM-003 (diferença R$ 80.00). Data limite 15/11/2026, prazo em aberto.',
      latency_ms: 1,
    })
    assert.equal(q12.status, 'PASS', q12.details.join('; '))

    // q13 only requires ID + date (BR format); no prazo-flag expectation.
    const q13 = gradeAnswer({
      question: Q13,
      data,
      resposta: 'A data limite para o pedido DEMO-ANOM-003 é 15/11/2026.',
      latency_ms: 1,
    })
    assert.equal(q13.status, 'PASS', q13.details.join('; '))
  })

  it('PASS q11-shaped answer with expirou + ISO date', () => {
    const data = fixtureData()
    const graded = gradeAnswer({
      question: Q11,
      data,
      resposta:
        'O prazo do DEMO-ANOM-004 expirou em 2026-10-25 (diferença R$ 95.00).',
      latency_ms: 1,
    })
    assert.equal(graded.status, 'PASS', graded.details.join('; '))
  })

  it('FAIL when the date is wrong even if the flag is right', () => {
    const data = fixtureData()
    const graded = gradeAnswer({
      question: Q12,
      data,
      resposta:
        'Ainda pode contestar DEMO-ANOM-003 (R$ 80.00). Data limite 16/11/2026, prazo em aberto.',
      latency_ms: 1,
    })
    assert.equal(graded.status, 'FAIL')
    assert.ok(graded.details.some((d) => d.includes('faltou data limite')))
  })

  it('FAIL when the prazo flag is wrong even if ID/amount/date are right', () => {
    const data = fixtureData()
    const graded = gradeAnswer({
      question: Q11,
      data,
      resposta:
        'DEMO-ANOM-004 ainda está aberto; data limite 2026-10-25; diferença R$ 95.00.',
      latency_ms: 1,
    })
    assert.equal(graded.status, 'FAIL')
    assert.ok(graded.details.some((d) => d.includes('prazo expirado')))
  })
})
