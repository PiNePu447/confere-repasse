import type { LoadedRestaurantData } from '../src/agent/db.ts'
import { collectAllowedReaisCents, deriveExpected } from './deriveExpected.ts'
import {
  absCents,
  extractMoneyCentsFromText,
  textContainsReais,
} from './moneyFormat.ts'
import type { EvalQuestion, QuestionResult } from './types.ts'

const NAO_SEI_RE =
  /n[aã]o\s+sei|n[aã]o\s+h[aá]\s+(?:nos\s+)?dados|n[aã]o\s+(?:encontrei|encontrado|existe|tenho)|sem\s+(?:informa[cç][aã]o|dados)|n[aã]o\s+est[aá]\s+(?:nos\s+dados|dispon[ií]vel)/i

function includesIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function gradeNaoSei(
  resposta: string,
  allowed: Set<number>,
): { ok: boolean; details: string[] } {
  const details: string[] = []
  if (!NAO_SEI_RE.test(resposta)) {
    details.push('esperava recusa do tipo "não sei" / dado inexistente')
  }
  const amounts = extractMoneyCentsFromText(resposta).map(absCents)
  const invented = amounts.filter((c) => !allowed.has(c) && c !== 0)
  if (invented.length > 0) {
    details.push(`valores inventados (centavos): ${invented.join(',')}`)
  }
  // Prefer no money at all for não-sei, but allow only if already in tool/engine surface
  // and the decline phrase is present.
  return { ok: details.length === 0, details }
}

function gradeAssert(
  resposta: string,
  expected: ReturnType<typeof deriveExpected>,
  allowed: Set<number>,
  idsCitados: string[] | undefined,
  knownIds: Set<string>,
): { valueOk: boolean; idOk: boolean; details: string[] } {
  const details: string[] = []

  for (const reais of expected.reais) {
    if (!textContainsReais(resposta, reais)) {
      details.push(`faltou valor R$ ${reais}`)
    }
  }

  const mentioned = extractMoneyCentsFromText(resposta).map(absCents)
  for (const cents of mentioned) {
    if (!allowed.has(cents)) {
      details.push(`valor não autorizado nos dados/ferramentas: ${cents} centavos`)
    }
  }

  const valueOk = !details.some((d) => d.startsWith('faltou valor') || d.startsWith('valor não'))

  // expected.ids are iFood order IDs (pedido_id_ifood) and/or lançamento IDs — never internal pedido UUIDs.
  let idOk = true
  for (const id of expected.ids) {
    const present = resposta.includes(id) || (idsCitados ?? []).includes(id)
    if (!present) {
      idOk = false
      details.push(`faltou ID iFood/lançamento ${id}`)
    }
  }

  // Wrong IDs = invented iFood-style identifiers that are not in the live restaurant data.
  const demoIds = [...resposta.matchAll(/\b(?:DEMO|PEDIDO)-[A-Z0-9-]+\b/g)].map((m) => m[0])
  for (const id of demoIds) {
    if (!knownIds.has(id)) {
      idOk = false
      details.push(`ID inventado (fora dos dados): ${id}`)
    }
  }

  for (const t of expected.texts) {
    if (!includesIgnoreCase(resposta, t)) {
      details.push(`faltou texto "${t}"`)
    }
  }
  for (const group of expected.textGroups) {
    if (!group.some((t) => includesIgnoreCase(resposta, t))) {
      details.push(`faltou um dos textos: ${group.join(' | ')}`)
    }
  }

  if (expected.dataLimite) {
    if (!resposta.includes(expected.dataLimite)) {
      details.push(`faltou data limite ${expected.dataLimite}`)
    }
  }

  if (expected.prazoAberto === true) {
    if (
      !/(prazo\s+aberto:\s*sim|prazo\s+aberto\b|ainda\s+pode\s+contestar|ainda\s+d[aá]\s+tempo|ainda\s+dentro|dentro\s+do\s+prazo|contestar\s+at[eé])/i.test(
        resposta,
      )
    ) {
      details.push('esperava indicação de prazo ainda aberto')
    }
  }
  if (expected.prazoAberto === false) {
    if (
      !/(expirad|fora\s+do\s+prazo|prazo\s+.*(?:encerrou|passou)|prazo\s+aberto:\s*n[aã]o|n[aã]o\s+(?:d[aá]|est[aá])\s+mais)/i.test(
        resposta,
      )
    ) {
      details.push('esperava indicação de prazo expirado')
    }
  }

  if (expected.forbidDataLimite) {
    if (/data\s+limite\s+para\s+contesta[cç][aã]o\s*:\s*\d{4}-\d{2}-\d{2}/i.test(resposta)) {
      details.push('não deveria inventar data limite para este tipo')
    }
  }

  const textOk = !details.some(
    (d) =>
      d.startsWith('faltou texto') ||
      d.startsWith('faltou um dos') ||
      d.startsWith('faltou data') ||
      d.startsWith('esperava') ||
      d.startsWith('não deveria'),
  )

  return {
    valueOk: valueOk && textOk,
    idOk,
    details,
  }
}

/** Citeable IDs for grading: iFood order IDs + lançamento IDs (not internal pedido UUIDs). */
function knownRestaurantIds(data: LoadedRestaurantData): Set<string> {
  const ids = new Set<string>()
  for (const p of data.pedidos) {
    ids.add(p.pedido_id_ifood)
  }
  for (const l of data.lancamentos) {
    ids.add(l.id)
    if (l.pedido_id_ifood) ids.add(l.pedido_id_ifood)
  }
  for (const d of data.engine.divergencias) {
    ids.add(d.pedido_id_ifood)
    for (const id of d.lancamento_ids) ids.add(id)
  }
  return ids
}

export function gradeAnswer(options: {
  question: EvalQuestion
  data: LoadedRestaurantData
  resposta: string
  ids_citados?: string[]
  tool_calls?: Array<{ name: string; args: Record<string, unknown> }>
  latency_ms: number
  error?: string
}): QuestionResult {
  const { question, data, resposta, ids_citados, tool_calls, latency_ms, error } = options

  if (error) {
    return {
      id: question.id,
      categoria: question.categoria,
      pergunta: question.pergunta,
      status: 'ERROR',
      value_ok: null,
      id_ok: null,
      details: [error],
      error,
      latency_ms,
    }
  }

  const expected = deriveExpected(question, data)
  const allowed = collectAllowedReaisCents(data)
  const knownIds = knownRestaurantIds(data)

  if (expected.naoSei) {
    const { ok, details } = gradeNaoSei(resposta, allowed)
    return {
      id: question.id,
      categoria: question.categoria,
      pergunta: question.pergunta,
      status: ok ? 'PASS' : 'FAIL',
      value_ok: ok,
      id_ok: ok,
      details,
      resposta,
      tool_calls,
      expected,
      latency_ms,
    }
  }

  const { valueOk, idOk, details } = gradeAssert(
    resposta,
    expected,
    allowed,
    ids_citados,
    knownIds,
  )
  const status = valueOk && idOk ? 'PASS' : 'FAIL'

  return {
    id: question.id,
    categoria: question.categoria,
    pergunta: question.pergunta,
    status,
    value_ok: valueOk,
    id_ok: idOk,
    details,
    resposta,
    tool_calls,
    expected,
    latency_ms,
  }
}
