/**
 * Mocked unit tests for agent refusal / charge-reporting rules.
 * Uses the eval mock LLM + real tools (no live OpenRouter).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { analyzeRepasse } from '../src/rules/index.ts'
import { buildSeedFixture } from '../src/rules/fixtures/seedFixture.ts'
import type { LoadedRestaurantData } from '../src/agent/db.ts'
import { runAgent } from '../src/agent/loop.ts'
import { buildSystemPrompt } from '../src/agent/prompt.ts'
import { TOOL_DEFINITIONS, createToolExecutor, executeTool } from '../src/agent/tools.ts'
import { createEvalMockLlm } from './mockLlm.ts'

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

async function ask(pergunta: string) {
  const data = fixtureData()
  return runAgent({
    pergunta,
    today: TODAY,
    systemPrompt: buildSystemPrompt(TODAY),
    toolDefinitions: TOOL_DEFINITIONS,
    executeTool: createToolExecutor(data),
    llm: createEvalMockLlm(),
    maxRounds: 4,
  })
}

describe('agent rules (mocked)', () => {
  it('empty ID lookup starts with "não sei:" and does not suggest foreign IDs', async () => {
    const missing = executeTool(fixtureData(), 'obter_pedidos', {
      pedido_id_ifood: 'DEMO-ANOM-999',
    }) as { total: number; encontrado?: boolean; mensagem?: string }
    assert.equal(missing.total, 0)
    assert.equal(missing.encontrado, false)
    assert.match(String(missing.mensagem), /^não sei:/)

    const result = await ask('Como está o pedido DEMO-ANOM-999 no meu repasse?')
    assert.match(result.resposta, /^não sei:/i)
    assert.doesNotMatch(result.resposta, /DEMO-ANOM-007|DEMO-ANOM-014/)
    assert.match(result.resposta, /DEMO-ANOM-999|não (foi )?encontr|nada foi encontrado|não está nos dados/i)
  })

  it('other restaurant name → "não sei:" and only the user restaurant', async () => {
    const totais = executeTool(fixtureData(), 'obter_totais', {}) as {
      restaurante: string
    }
    assert.equal(totais.restaurante, 'Restaurante Demo')

    const result = await ask('Quanto o Restaurante Central da esquina perdeu esse mês?')
    assert.match(result.resposta, /^não sei:/i)
    assert.match(result.resposta, /Restaurante Demo/)
    assert.doesNotMatch(result.resposta, /R\$\s*207/)
  })

  it('commission charge states contract rate, charged amount, and engine R$ difference', async () => {
    const data = fixtureData()
    const div = data.engine.divergencias.find((d) => d.pedido_id_ifood === 'DEMO-ANOM-001')
    assert.ok(div)
    assert.equal(div!.tipo, 'comissao_acima_contrato')

    const result = await ask(
      'Lista os lançamentos do pedido DEMO-ANOM-001 e diz a porcentagem da comissão cobrada.',
    )
    assert.match(result.resposta, /12/)
    assert.match(result.resposta, /23/)
    assert.ok(
      result.resposta.includes(div!.diferenca) ||
        result.resposta.includes(div!.diferenca.replace('.', ',')),
      `expected diferença ${div!.diferenca} in: ${result.resposta}`,
    )
    assert.ok(
      result.resposta.includes(div!.valor_cobrado) ||
        result.resposta.includes(String(div!.valor_cobrado).replace('.', ',')),
      `expected valor_cobrado ${div!.valor_cobrado} in: ${result.resposta}`,
    )
    for (const lanId of div!.lancamento_ids) {
      assert.ok(result.resposta.includes(lanId), `expected lancamento_id ${lanId}`)
    }
  })
})

describe('system prompt rules (C7-safe)', () => {
  it('requires não sei on empty lookup, restaurant isolation, and charge triple', () => {
    const prompt = buildSystemPrompt(TODAY)
    assert.match(prompt, /começar com "não sei:"/)
    assert.match(prompt, /[Nn]ão sugira nem invente outros IDs/)
    assert.match(prompt, /outro restaurante/)
    assert.match(prompt, /taxa contratual/)
    assert.match(prompt, /diferença em R\$/)
    assert.doesNotMatch(prompt, /DEMO-ANOM-999|Restaurante Central|PEDIDO-INEXISTENTE/)
  })
})
