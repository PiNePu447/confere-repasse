/**
 * Tool-layer tests against the LIVE Supabase project (demo JWT + RLS).
 * No OpenRouter key required.
 */
import assert from 'node:assert/strict'
import { describe, it, before } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadRestaurantData } from './db.ts'
import { draftContestacao, executeTool } from './tools.ts'
import type { LoadedRestaurantData } from './db.ts'
import { addDays } from '../rules/dates.ts'

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile(resolve(process.cwd(), '.env'))
loadEnvFile(resolve(process.cwd(), '.env.example'))

const URL = process.env.VITE_SUPABASE_URL!
const ANON = process.env.VITE_SUPABASE_ANON_KEY!
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@confererepasse.app'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-repasse-2026'

describe('live tool layer (Supabase RLS)', () => {
  let data: LoadedRestaurantData
  let today: string

  before(async () => {
    assert.ok(URL && ANON, 'missing Supabase URL/anon key')
    const auth = createClient(URL, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: signed, error } = await auth.auth.signInWithPassword({
      email: EMAIL,
      password: PASSWORD,
    })
    assert.equal(error, null, error?.message)
    assert.ok(signed.session)

    const supabase = createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${signed.session!.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Match America/Sao_Paulo calendar day used by the agent boundary.
    today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())

    data = await loadRestaurantData(supabase, today)
  })

  it('obter_contrato returns Marketplace 12% / 3.2% / 1.99', () => {
    const result = executeTool(data, 'obter_contrato', {}) as {
      contrato: {
        plano: string
        comissao_percentual: number | string
        taxa_pagamento_online_percentual: number | string
        taxa_repasse_semanal: number | string
      }
    }
    assert.equal(result.contrato.plano, 'Marketplace')
    assert.equal(Number(result.contrato.comissao_percentual), 12)
    assert.equal(Number(result.contrato.taxa_pagamento_online_percentual), 3.2)
    assert.equal(Number(result.contrato.taxa_repasse_semanal), 1.99)
  })

  it('obter_pedidos returns 25 pedidos including planted anomalies', () => {
    const result = executeTool(data, 'obter_pedidos', {}) as { total: number; pedidos: unknown[] }
    assert.equal(result.total, 25)
    const one = executeTool(data, 'obter_pedidos', {
      pedido_id_ifood: 'DEMO-ANOM-003',
    }) as {
      total: number
      pedidos: Array<{
        status: string
        valor_total: number | string
        pedido_id_ifood: string
        id?: string
      }>
    }
    assert.equal(one.total, 1)
    assert.equal(one.pedidos[0]!.status, 'CANCELADO')
    assert.equal(Number(one.pedidos[0]!.valor_total), 80)
    assert.equal(one.pedidos[0]!.pedido_id_ifood, 'DEMO-ANOM-003')
    assert.equal(one.pedidos[0]!.id, undefined)
  })

  it('listar_lancamentos filters by pedido and description', () => {
    const all = executeTool(data, 'listar_lancamentos', {}) as { total: number }
    assert.equal(all.total, 49)

    const byPedido = executeTool(data, 'listar_lancamentos', {
      pedido_id_ifood: 'DEMO-ANOM-001',
    }) as {
      total: number
      lancamentos: Array<{
        percentual_taxa: number | string
        descricao_lancamento: string
        lancamento_id: string
        pedido_id_ifood: string
        id?: string
        pedido_id?: string
      }>
    }
    assert.ok(byPedido.total >= 1)
    const comissao = byPedido.lancamentos.find((l) => l.descricao_lancamento === 'Comissão do iFood')
    assert.ok(comissao)
    assert.equal(Number(comissao!.percentual_taxa), 23)
    assert.equal(typeof comissao!.lancamento_id, 'string')
    assert.equal(comissao!.pedido_id_ifood, 'DEMO-ANOM-001')
    assert.equal(comissao!.id, undefined)
    assert.equal(comissao!.pedido_id, undefined)

    const byDesc = executeTool(data, 'listar_lancamentos', {
      descricao: 'Débito por cancelamento',
    }) as { total: number }
    assert.equal(byDesc.total, 2)
  })

  it('obter_divergencias returns the 5 seed anomalies with SEED.md amounts', () => {
    const result = executeTool(data, 'obter_divergencias', {}) as {
      total: number
      divergencias: Array<{
        pedido_id_ifood: string
        tipo: string
        diferenca: string
        data_limite: string | null
        prazo_aberto: boolean | null
        lancamento_ids: string[]
        pedido_ids?: string[]
      }>
    }
    assert.equal(result.total, 5)
    const byId = Object.fromEntries(result.divergencias.map((d) => [d.pedido_id_ifood, d]))
    assert.equal(byId['DEMO-ANOM-001']!.diferenca, '16.50')
    assert.equal(byId['DEMO-ANOM-002']!.diferenca, '12.00')
    assert.equal(byId['DEMO-ANOM-003']!.diferenca, '80.00')
    assert.equal(byId['DEMO-ANOM-004']!.diferenca, '95.00')
    assert.equal(byId['DEMO-ANOM-005']!.diferenca, '4.00')
    assert.equal(byId['DEMO-ANOM-003']!.prazo_aberto, true)
    assert.equal(byId['DEMO-ANOM-004']!.prazo_aberto, false)
    assert.equal(byId['DEMO-ANOM-001']!.data_limite, null)
    for (const d of result.divergencias) {
      assert.ok(Array.isArray(d.lancamento_ids) && d.lancamento_ids.length >= 1)
      assert.equal(d.pedido_ids, undefined)
    }
  })

  it('obter_totais exposes weeks and perdido_por_tipo', () => {
    const result = executeTool(data, 'obter_totais', {}) as {
      totais_por_semana: Array<{
        vendas_brutas: string
        liquido_repassado: string
        liquido_esperado: string
      }>
      totais_gerais: { diferenca: string; vendas_brutas: string }
      perdido_por_tipo: Record<string, string>
      perdido_total: string
    }
    assert.equal(result.totais_por_semana.length, 4)
    assert.equal(result.perdido_por_tipo.comissao_acima_contrato, '16.50')
    assert.equal(result.perdido_total, '207.50')
    assert.equal(result.totais_gerais.diferenca, '207.50')
    for (const w of result.totais_por_semana) {
      assert.ok(Number(w.vendas_brutas) > 0)
      assert.ok(w.liquido_repassado)
      assert.ok(w.liquido_esperado)
    }
  })

  it('rascunhar_contestacao for DEMO-ANOM-003 includes R$ 80.00 and data limite', () => {
    const pedido = data.pedidos.find((p) => p.pedido_id_ifood === 'DEMO-ANOM-003')
    assert.ok(pedido)
    const expectedLimite = addDays(pedido!.data_criacao, 7)
    const draft = draftContestacao(data, 'DEMO-ANOM-003') as {
      ok: boolean
      rascunho: string
      divergencias: Array<{ data_limite: string | null; prazo_aberto: boolean | null }>
    }
    assert.equal(draft.ok, true)
    assert.match(draft.rascunho, /R\$ 80\.00/)
    assert.match(draft.rascunho, new RegExp(`Data limite para contestação: ${expectedLimite}`))
    assert.equal(draft.divergencias[0]!.data_limite, expectedLimite)
    assert.equal(draft.divergencias[0]!.prazo_aberto, true)
    assert.doesNotMatch(draft.rascunho, /não se aplica/)
  })

  it('rascunhar_contestacao for non-cancellation shows no deadline', () => {
    const draft = draftContestacao(data, 'DEMO-ANOM-001') as {
      ok: boolean
      rascunho: string
    }
    assert.equal(draft.ok, true)
    assert.match(draft.rascunho, /Data limite: não se aplica/)
    assert.match(draft.rascunho, /abrir chamado no suporte, sem prazo documentado/)
    assert.doesNotMatch(draft.rascunho, /Data limite para contestação:/)
    assert.match(draft.rascunho, /R\$ 16\.50/)
  })
})
