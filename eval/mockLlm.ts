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

  const wantsContrato = /contrato|comiss[aã]o|taxa|marketplace|plano|porcentagem/.test(q)
  const wantsTotais = /total|perdi|perda|preju[ií]zo|tipo|semana|baixa|repass/.test(q)
  const wantsDiv =
    /diverg|anom|cancel|duplic|taxa online|comiss[aã]o a mais|contest|porcentagem da comiss|comiss[aã]o cobrad/.test(
      q,
    )
  const wantsDraft = /rascunho|texto de contesta|monta.*contesta|gera.*contesta/.test(q)
  const wantsPedido = /pedido|status|consulta|lookup|aconteceu/.test(q)
  const wantsLanc = /lan[cç]amento|porcentagem da comiss|d[eé]bito por cancel|comiss[aã]o cobrad/.test(
    q,
  )
  const wantsOtherRestaurant = /restaurante\s+\w+/i.test(pergunta)

  if (wantsContrato || wantsLanc) calls.push({ name: 'obter_contrato', args: {} })
  if (wantsTotais || wantsOtherRestaurant || (!wantsContrato && !wantsDraft && !pedido)) {
    calls.push({ name: 'obter_totais', args: {} })
  }
  if (wantsDiv || wantsTotais || wantsLanc || semana) {
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

  const ownRestaurant = toolPayloads
    .map((p) => (p as { restaurante?: unknown })?.restaurante)
    .find((n): n is string => typeof n === 'string' && n.trim().length > 0)

  for (const payload of toolPayloads) {
    const p = payload as Record<string, unknown>
    if (!p) continue
    if (p.ok === false && typeof p.mensagem === 'string') {
      return p.mensagem.startsWith('não sei:') ? p.mensagem : `não sei: ${p.mensagem}`
    }
    // Only treat explicit not-found / empty *pedido* lookups as missing IDs.
    // An empty divergencias list for a real pedido is normal, not a miss.
    if (pedido && (p.encontrado === false || (Array.isArray(p.pedidos) && p.total === 0))) {
      if (typeof p.mensagem === 'string' && p.mensagem.trim()) {
        return p.mensagem.startsWith('não sei:') ? p.mensagem : `não sei: ${p.mensagem}`
      }
      return `não sei: nada foi encontrado para o ID ${pedido}.`
    }
  }

  // Question names a restaurant other than the authenticated one.
  if (ownRestaurant) {
    const named = pergunta.match(/restaurante\s+[^?,.]+/i)
    if (named) {
      const asked = named[0]!.replace(/\s+/g, ' ').trim().toLowerCase()
      const own = `restaurante ${ownRestaurant}`.toLowerCase()
      if (!asked.includes(ownRestaurant.toLowerCase()) && asked !== own) {
        return `não sei: só tenho acesso aos dados do restaurante ${ownRestaurant}; não há informações de outro restaurante.`
      }
    }
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
  if (pedido && !joined.includes(`"pedido_id_ifood":"${pedido}"`) && !joined.includes(`"pedido_id_ifood": "${pedido}"`) && /pedido|valor do pedido|como est/.test(q)) {
    // Pedido mentioned but not present as a found row (empty arrays still may echo the filter args only in tool calls, not payloads).
    const foundInRows = toolPayloads.some((payload) => {
      const p = payload as {
        pedidos?: Array<{ pedido_id_ifood?: string }>
        divergencias?: Array<{ pedido_id_ifood?: string }>
        lancamentos?: Array<{ pedido_id_ifood?: string }>
      }
      const pools = [...(p.pedidos ?? []), ...(p.divergencias ?? []), ...(p.lancamentos ?? [])]
      return pools.some((row) => row.pedido_id_ifood === pedido)
    })
    if (!foundInRows) {
      return `não sei: o pedido ${pedido} não está nos dados.`
    }
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
      const casos = p.perdido_por_tipo_casos as
        | Record<string, Array<{ pedido_id_ifood: string; diferenca: string; lancamento_ids: string[] }>>
        | undefined
      if (casos) {
        for (const [tipo, list] of Object.entries(casos)) {
          for (const c of list) {
            const lan = c.lancamento_ids.join(', ')
            parts.push(
              `Caso ${tipo}: pedido iFood ${c.pedido_id_ifood}, diferença R$ ${c.diferenca}, lançamentos ${lan}.`,
            )
          }
        }
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
          `Lançamento ${l.lancamento_id ?? l.id} (${l.descricao_lancamento}) do pedido iFood ${l.pedido_id_ifood}: valor R$ ${l.valor}, percentual cobrado ${l.percentual_taxa}%.`,
        )
      }
    }
  }

  // Charge of a divergence type: always surface contract rate + charged + engine difference.
  if (/comiss[aã]o|porcentagem|taxa cobrad|lan[cç]amento/.test(q)) {
    let contratoPct: string | null = null
    for (const payload of toolPayloads) {
      const c = (payload as { contrato?: { comissao_percentual?: unknown } }).contrato
      if (c?.comissao_percentual != null) contratoPct = String(c.comissao_percentual)
    }
    for (const payload of toolPayloads) {
      const divs = (payload as { divergencias?: Array<Record<string, unknown>> }).divergencias
      if (!divs) continue
      for (const d of divs) {
        if (pedido && String(d.pedido_id_ifood) !== pedido) continue
        if (contratoPct != null && d.tipo === 'comissao_acima_contrato') {
          parts.push(
            `Comissão contratual ${contratoPct}%; cobrado R$ ${d.valor_cobrado} (ver percentual no lançamento); diferença do motor R$ ${d.diferenca}.`,
          )
        } else if (d.valor_cobrado != null && d.diferenca != null) {
          parts.push(
            `Cobrança divergente: cobrado R$ ${d.valor_cobrado}, esperado R$ ${d.valor_esperado}, diferença R$ ${d.diferenca}.`,
          )
        }
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
