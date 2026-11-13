import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { analyzeRepasse } from '../rules/index.ts'
import { buildSeedFixture } from '../rules/fixtures/seedFixture.ts'
import type { LoadedRestaurantData } from './db.ts'
import { buildSystemPrompt } from './prompt.ts'
import { TOOL_DEFINITIONS, executeTool } from './tools.ts'
import { collectIdsFromUnknown } from './ids.ts'

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

describe('tool payloads hide internal pedido UUIDs', () => {
  it('schemas describe pedido_id_ifood as the iFood order ID to cite', () => {
    for (const tool of TOOL_DEFINITIONS) {
      const props = tool.function.parameters.properties as Record<
        string,
        { description?: string }
      >
      if ('pedido_id_ifood' in props) {
        assert.match(
          props.pedido_id_ifood.description ?? '',
          /ID iFood/,
          tool.function.name,
        )
        assert.match(
          props.pedido_id_ifood.description ?? '',
          /NÃO é UUID|não use UUID|Cite este/i,
          tool.function.name,
        )
      }
    }
    assert.match(buildSystemPrompt(TODAY), /pedido_id_ifood/)
    assert.match(buildSystemPrompt(TODAY), /lancamento_id/)
  })

  it('obter_divergencias exposes pedido_id_ifood + lancamento_ids, not pedido_ids', () => {
    const data = fixtureData()
    const result = executeTool(data, 'obter_divergencias', {}) as {
      divergencias: Array<Record<string, unknown>>
    }
    assert.ok(result.divergencias.length >= 1)
    for (const d of result.divergencias) {
      assert.equal(typeof d.pedido_id_ifood, 'string')
      assert.ok(Array.isArray(d.lancamento_ids))
      assert.equal('pedido_ids' in d, false)
      assert.equal('uuid_interno' in d, false)
      assert.match(String(d.pedido_id_ifood), /^DEMO-ANOM-/)
    }
  })

  it('obter_pedidos omits internal id and keeps pedido_id_ifood', () => {
    const data = fixtureData()
    const result = executeTool(data, 'obter_pedidos', {
      pedido_id_ifood: 'DEMO-ANOM-003',
    }) as { pedidos: Array<Record<string, unknown>> }
    assert.equal(result.pedidos.length, 1)
    const p = result.pedidos[0]!
    assert.equal(p.pedido_id_ifood, 'DEMO-ANOM-003')
    assert.equal('id' in p, false)
    assert.equal('uuid_interno' in p, false)
  })

  it('listar_lancamentos uses lancamento_id and pedido_id_ifood (no pedido_id UUID)', () => {
    const data = fixtureData()
    const result = executeTool(data, 'listar_lancamentos', {
      pedido_id_ifood: 'DEMO-ANOM-001',
    }) as { lancamentos: Array<Record<string, unknown>> }
    assert.ok(result.lancamentos.length >= 1)
    for (const l of result.lancamentos) {
      assert.equal(typeof l.lancamento_id, 'string')
      assert.equal(l.pedido_id_ifood, 'DEMO-ANOM-001')
      assert.equal('id' in l, false)
      assert.equal('pedido_id' in l, false)
    }
  })

  it('collectIdsFromUnknown skips pedido_ids / uuid_interno even if present', () => {
    const ids = collectIdsFromUnknown({
      pedido_id_ifood: 'DEMO-ANOM-003',
      pedido_ids: ['50a8bc0f-b1d8-4622-8a51-0c3f572208bc'],
      uuid_interno: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      lancamento_ids: ['966f1736-1c42-44d1-8ce2-6f4bb10f97cf'],
    })
    assert.ok(ids.has('DEMO-ANOM-003'))
    assert.ok(ids.has('966f1736-1c42-44d1-8ce2-6f4bb10f97cf'))
    assert.equal(ids.has('50a8bc0f-b1d8-4622-8a51-0c3f572208bc'), false)
    assert.equal(ids.has('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'), false)
  })

  it('obter_totais and obter_divergencias expose restaurante name', () => {
    const data = fixtureData()
    const totais = executeTool(data, 'obter_totais', {}) as { restaurante: string }
    const divs = executeTool(data, 'obter_divergencias', {}) as { restaurante: string }
    assert.equal(totais.restaurante, 'Restaurante Demo')
    assert.equal(divs.restaurante, 'Restaurante Demo')
  })

  it('filtered empty pedido lookup returns não sei mensagem', () => {
    const data = fixtureData()
    const result = executeTool(data, 'obter_pedidos', {
      pedido_id_ifood: 'PEDIDO-AUSENTE-1',
    }) as { total: number; encontrado: boolean; mensagem: string }
    assert.equal(result.total, 0)
    assert.equal(result.encontrado, false)
    assert.match(result.mensagem, /^não sei:/)
    assert.match(result.mensagem, /PEDIDO-AUSENTE-1/)
  })
})
