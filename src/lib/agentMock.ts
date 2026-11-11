/**
 * DEV-only mock of the Edge Function response.
 * Never imported from production paths without an `import.meta.env.DEV` guard.
 */
import type { AgentUiResponse } from './agentTypes.ts'

export type MockScenario = 'answer' | 'draft' | 'error'

export function resolveMockScenario(pergunta: string): MockScenario {
  if (typeof window !== 'undefined') {
    const forced = new URLSearchParams(window.location.search).get('agentMock')
    if (forced === 'answer' || forced === 'draft' || forced === 'error') {
      return forced
    }
  }
  const q = pergunta.toLowerCase()
  if (/erro|falha|rate.?limit|429/.test(q)) return 'error'
  if (/rascunh|contesta/.test(q)) return 'draft'
  return 'answer'
}

export function getMockAgentResponse(pergunta: string): AgentUiResponse {
  const scenario = resolveMockScenario(pergunta)

  if (scenario === 'error') {
    return {
      resposta:
        'Falha ao consultar o modelo de linguagem. Tente novamente em instantes.',
      tool_calls: [],
      ids_citados: [],
    }
  }

  if (scenario === 'draft') {
    const draft = [
      'Rascunho de contestação — pedido DEMO-ANOM-003',
      'Status do pedido: CANCELADO',
      'Valor do pedido: R$ 80.00',
      '',
      'Tipo: cancelamento_debitado',
      'Valor cobrado: R$ 80.00',
      'Valor esperado: R$ 0.00',
      'Diferença: R$ 80.00',
      'IDs dos lançamentos: 966f1736-1c42-44d1-8ce2-6f4bb10f97cf',
      'Semana: REPASSE-W0',
      'Data limite para contestação: 2026-11-15',
      'Prazo aberto: sim',
      'Orientação: contestar cancelamento até 2026-11-15 (prazo de 7 dias a partir da data do pedido)',
      '',
      'Este texto é apenas um rascunho local. Nada foi enviado a suporte ou a qualquer canal externo.',
    ].join('\n')

    return {
      resposta: draft,
      tool_calls: [
        {
          name: 'rascunhar_contestacao',
          args: { pedido_id_ifood: 'DEMO-ANOM-003' },
        },
      ],
      ids_citados: ['DEMO-ANOM-003', '966f1736-1c42-44d1-8ce2-6f4bb10f97cf'],
    }
  }

  return {
    resposta:
      'Na semana REPASSE-W2 a diferença foi R$ 28.50. Isso vem da comissão acima do contrato no pedido DEMO-ANOM-001 (R$ 16.50, lançamento e7558abe-78dd-42a3-8e49-7c9c9b0ab024) e da cobrança duplicada no pedido DEMO-ANOM-002 (R$ 12.00).',
    tool_calls: [
      { name: 'obter_totais', args: {} },
      { name: 'obter_divergencias', args: {} },
    ],
    ids_citados: [
      'DEMO-ANOM-001',
      'DEMO-ANOM-002',
      'e7558abe-78dd-42a3-8e49-7c9c9b0ab024',
      'REPASSE-W2',
    ],
  }
}
