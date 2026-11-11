/**
 * Mock LLM for EVAL_MOCK=1: calls tools, then answers only from tool outputs.
 * Does not read the answer key / grade spec.
 */
import type { ChatMessage, LlmClient, LlmResult } from '../src/agent/types.ts'

function extractPedidoId(text: string): string | null {
  const match = text.match(/\b(DEMO-[A-Z0-9-]+|PEDIDO-[A-Z0-9-]+)\b/i)
  return match ? match[1]! : null
}

function extractSemana(text: string): string | null {
  const match = text.match(/\bREPASSE-W\d+\b/i)
  return match ? match[0]!.toUpperCase() : null
}

function planToolCalls(pergunta: string): Array<{ name: string; args: Record<string, unknown> }> {
  const q = pergunta.toLowerCase()
  const pedido = extractPedidoId(pergunta)
  const semana = extractSemana(pergunta)
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []

  const wantsContrato = /contrato|comiss[aã]o|taxa|marketplace|plano/.test(q)
  const wantsTotais = /total|perdi|perda|preju[ií]zo|tipo|semana|baixa|repass/.test(q)
  const wantsDiv = /diverg|anom|cancel|duplic|taxa online|comiss[aã]o a mais|contest/.test(q)
  const wantsDraft = /rascunho|texto de contesta|monta.*contesta|gera.*contesta/.test(q)
  const wantsPedido = /pedido|status|consulta|lookup|aconteceu/.test(q)
  const wantsLanc = /lan[cç]amento|porcentagem da comiss|d[eé]bito por cancel/.test(q)

  if (wantsContrato) calls.push({ name: 'obter_contrato', args: {} })
  if (wantsTotais || (!wantsContrato && !wantsDraft && !pedido)) {
    calls.push({ name: 'obter_totais', args: {} })
  }
  if (wantsDiv || wantsTotais || semana) {
    calls.push({
      name: 'obter_divergencias',
      args: pedido ? { pedido_id_ifood: pedido } : {},
    })
  }
  if (wantsPedido || pedido) {
    calls.push({
      name: 'obter_pedidos',
      args: pedido ? { pedido_id_ifood: pedido } : {},
    })
  }
  if (wantsLanc) {
    calls.push({
      name: 'listar_lancamentos',
      args: {
        ...(pedido ? { pedido_id_ifood: pedido } : {}),
        ...( /d[eé]bito por cancel/.test(q) ? { descricao: 'Débito por cancelamento' } : {}),
      },
    })
  }
  if (wantsDraft && pedido) {
    calls.push({ name: 'rascunhar_contestacao', args: { pedido_id_ifood: pedido } })
  }
  if (semana && !calls.some((c) => c.name === 'obter_totais')) {
    calls.push({ name: 'obter_totais', args: {} })
  }

  if (calls.length === 0) {
    calls.push({ name: 'obter_totais', args: {} })
    calls.push({ name: 'obter_divergencias', args: {} })
  }

  // Dedupe by name+args
  const seen = new Set<string>()
  return calls.filter((c) => {
    const key = `${c.name}:${JSON.stringify(c.args)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function synthesizeAnswer(pergunta: string, toolPayloads: unknown[]): string {
  const q = pergunta.toLowerCase()
  const blobs = toolPayloads.map((p) => JSON.stringify(p))
  const joined = blobs.join('\n')

  // Empty / missing lookups → não sei
  const pedido = extractPedidoId(pergunta)
  const semana = extractSemana(pergunta)

  for (const payload of toolPayloads) {
    const p = payload as Record<string, unknown>
    if (p && p.ok === false && typeof p.mensagem === 'string') {
      return `não sei: ${p.mensagem}`
    }
    if (p && typeof p.total === 'number' && p.total === 0 && (pedido || /restaurante central|inexistente|w9/i.test(pergunta))) {
      return `não sei: isso não está nos dados disponíveis do restaurante.`
    }
  }

  if (/restaurante central|outra loja|esquina/i.test(pergunta)) {
    return 'não sei: só tenho dados do restaurante autenticado; não há informações de outro restaurante.'
  }
  if (semana === 'REPASSE-W9' || /semana.*w9|ainda nem come[cç]ou/i.test(pergunta)) {
    const weeks = toolPayloads
      .flatMap((p) => {
        const o = p as { totais_por_semana?: Array<{ semana: string }> }
        return o.totais_por_semana ?? []
      })
      .map((w) => w.semana)
    if (!weeks.includes('REPASSE-W9')) {
      return 'não sei: a semana REPASSE-W9 não está nos dados.'
    }
  }
  if (pedido && /DEMO-ANOM-999|PEDIDO-INEXISTENTE/i.test(pedido)) {
    return `não sei: o pedido ${pedido} não existe nos dados.`
  }
  if (pedido && !joined.includes(pedido) && /pedido|valor do pedido|como est/.test(q)) {
    return `não sei: o pedido ${pedido} não está nos dados.`
  }

  // Prefer draft text when present
  for (const payload of toolPayloads) {
    const p = payload as { rascunho?: string; ok?: boolean }
    if (p?.ok && typeof p.rascunho === 'string') {
      return p.rascunho
    }
  }

  const parts: string[] = []

  for (const payload of toolPayloads) {
    const p = payload as Record<string, unknown>
    if (p.contrato) {
      const c = p.contrato as Record<string, unknown>
      parts.push(
        `Contrato ${String(c.plano)}: comissão ${String(c.comissao_percentual)}%, taxa online ${String(c.taxa_pagamento_online_percentual)}%, taxa de repasse semanal R$ ${String(c.taxa_repasse_semanal)}.`,
      )
    }
    if (p.perdido_total != null) {
      parts.push(`Perda total por divergências: R$ ${String(p.perdido_total)}.`)
      const porTipo = p.perdido_por_tipo as Record<string, string> | undefined
      if (porTipo) {
        parts.push(
          `Por tipo: comissão acima R$ ${porTipo.comissao_acima_contrato}, duplicada R$ ${porTipo.cobranca_duplicada}, cancelamento R$ ${porTipo.cancelamento_debitado}, taxa online em entrega R$ ${porTipo.taxa_online_em_pago_na_entrega}.`,
        )
      }
    }
    if (Array.isArray(p.totais_por_semana)) {
      for (const w of p.totais_por_semana as Array<Record<string, string>>) {
        if (!semana || w.semana === semana) {
          parts.push(
            `Semana ${w.semana}: repassado R$ ${w.repassado}, esperado R$ ${w.esperado}, diferença R$ ${w.diferenca}.`,
          )
        }
      }
    }
    if (Array.isArray(p.divergencias)) {
      for (const d of p.divergencias as Array<Record<string, unknown>>) {
        const id = String(d.pedido_id_ifood)
        if (pedido && id !== pedido) continue
        const lan = Array.isArray(d.lancamento_ids) ? (d.lancamento_ids as string[]).join(', ') : ''
        let line = `Divergência ${d.tipo} no pedido iFood ${id}: cobrado R$ ${d.valor_cobrado}, esperado R$ ${d.valor_esperado}, diferença R$ ${d.diferenca}. Lançamentos: ${lan}. Orientação: ${d.orientacao}.`
        if (d.data_limite) {
          line += ` Data limite: ${d.data_limite}. Prazo aberto: ${d.prazo_aberto ? 'sim' : 'não'}.`
        } else {
          line += ' Sem data limite documentada.'
        }
        parts.push(line)
      }
    }
    if (Array.isArray(p.pedidos)) {
      for (const ped of p.pedidos as Array<Record<string, unknown>>) {
        const valor =
          typeof ped.valor_total === 'number'
            ? ped.valor_total.toFixed(2)
            : String(ped.valor_total)
        parts.push(
          `Pedido iFood ${ped.pedido_id_ifood}: status ${ped.status}, valor R$ ${valor}, pagamento ${ped.metodo_pagamento}.`,
        )
      }
    }
    if (Array.isArray(p.lancamentos)) {
      for (const l of p.lancamentos as Array<Record<string, unknown>>) {
        parts.push(
          `Lançamento ${l.lancamento_id ?? l.id} (${l.descricao_lancamento}) do pedido iFood ${l.pedido_id_ifood}: valor R$ ${l.valor}, percentual ${l.percentual_taxa}.`,
        )
      }
    }
  }

  // Contestabilidade: only open cancellations
  if (/ainda posso contestar|quais cancelamentos/.test(q)) {
    const open = toolPayloads
      .flatMap((p) => {
        const o = p as { divergencias?: Array<Record<string, unknown>> }
        return o.divergencias ?? []
      })
      .filter((d) => d.tipo === 'cancelamento_debitado' && d.prazo_aberto === true)
    if (open.length > 0) {
      return open
        .map(
          (d) =>
            `Ainda pode contestar o pedido iFood ${d.pedido_id_ifood} (diferença R$ ${d.diferenca}) até ${d.data_limite}.`,
        )
        .join(' ')
    }
  }

  if (parts.length === 0) {
    return 'não sei: as ferramentas não retornaram dados para essa pergunta.'
  }
  return parts.join(' ')
}

export function createEvalMockLlm(): LlmClient {
  let phase: 'tools' | 'answer' = 'tools'
  let pergunta = ''
  const toolResults: unknown[] = []

  return {
    async complete(messages: ChatMessage[]): Promise<LlmResult> {
      const user = [...messages].reverse().find((m) => m.role === 'user')
      if (user?.content) pergunta = user.content

      if (phase === 'tools') {
        const planned = planToolCalls(pergunta)
        phase = 'answer'
        return {
          content: null,
          tool_calls: planned.map((c, i) => ({
            id: `mock_${i}`,
            type: 'function',
            function: {
              name: c.name,
              arguments: JSON.stringify(c.args),
            },
          })),
        }
      }

      // Collect tool messages from this turn
      for (const m of messages) {
        if (m.role === 'tool' && m.content) {
          try {
            toolResults.push(JSON.parse(m.content))
          } catch {
            toolResults.push({ raw: m.content })
          }
        }
      }

      const resposta = synthesizeAnswer(pergunta, toolResults)
      // reset for potential reuse
      phase = 'tools'
      toolResults.length = 0
      return { content: resposta, tool_calls: [] }
    },
  }
}
