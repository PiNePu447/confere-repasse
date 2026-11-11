import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runAgent } from './loop.ts'
import { buildSystemPrompt } from './prompt.ts'
import { TOOL_DEFINITIONS, executeTool } from './tools.ts'
import { buildSeedFixture } from '../rules/fixtures/seedFixture.ts'
import { analyzeRepasse } from '../rules/index.ts'
import type { LoadedRestaurantData } from './db.ts'
import type { ChatMessage, LlmClient, LlmResult } from './types.ts'

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

describe('agent loop (mocked LLM)', () => {
  it('dispatches tools and returns the expected response shape', async () => {
    const data = fixtureData()
    let step = 0

    const llm: LlmClient = {
      async complete(messages: ChatMessage[]): Promise<LlmResult> {
        step += 1
        if (step === 1) {
          assert.equal(messages[0]!.role, 'system')
          assert.match(messages[0]!.content ?? '', /America\/Sao_Paulo/)
          return {
            content: null,
            tool_calls: [
              {
                id: 'call_totais',
                type: 'function',
                function: { name: 'obter_totais', arguments: '{}' },
              },
              {
                id: 'call_div',
                type: 'function',
                function: {
                  name: 'obter_divergencias',
                  arguments: JSON.stringify({ pedido_id_ifood: 'DEMO-ANOM-003' }),
                },
              },
            ],
          }
        }
        if (step === 2) {
          const toolMsgs = messages.filter((m) => m.role === 'tool')
          assert.equal(toolMsgs.length, 2)
          return {
            content:
              'Há uma divergência no pedido DEMO-ANOM-003 de R$ 80.00 (cancelamento debitado). Consulte o lançamento citado nas ferramentas.',
            tool_calls: [],
          }
        }
        throw new Error(`unexpected LLM step ${step}`)
      },
    }

    const result = await runAgent({
      pergunta: 'Quanto perdi no cancelamento recente?',
      today: TODAY,
      llm,
      executeTool: async (name, args) => executeTool(data, name, args),
      toolDefinitions: TOOL_DEFINITIONS as unknown[],
      systemPrompt: buildSystemPrompt(TODAY),
    })

    assert.equal(typeof result.resposta, 'string')
    assert.match(result.resposta, /DEMO-ANOM-003/)
    assert.match(result.resposta, /80\.00/)
    assert.deepEqual(
      result.tool_calls.map((t) => t.name),
      ['obter_totais', 'obter_divergencias'],
    )
    assert.ok(result.ids_citados?.includes('DEMO-ANOM-003'))
    assert.equal(step, 2)
  })

  it('supports rascunhar_contestacao in the loop', async () => {
    const data = fixtureData()
    let step = 0
    const llm: LlmClient = {
      async complete(): Promise<LlmResult> {
        step += 1
        if (step === 1) {
          return {
            content: null,
            tool_calls: [
              {
                id: 'call_draft',
                type: 'function',
                function: {
                  name: 'rascunhar_contestacao',
                  arguments: JSON.stringify({ pedido_id_ifood: 'DEMO-ANOM-003' }),
                },
              },
            ],
          }
        }
        return {
          content:
            'Segue o rascunho local para DEMO-ANOM-003 com diferença R$ 80.00. Nada foi enviado.',
          tool_calls: [],
        }
      },
    }

    const result = await runAgent({
      pergunta: 'Monte um rascunho de contestação do cancelamento recente',
      today: TODAY,
      llm,
      executeTool: async (name, args) => executeTool(data, name, args),
      toolDefinitions: TOOL_DEFINITIONS as unknown[],
      systemPrompt: buildSystemPrompt(TODAY),
    })

    assert.equal(result.tool_calls[0]!.name, 'rascunhar_contestacao')
    assert.match(result.resposta, /80\.00/)
  })
})
