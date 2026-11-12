import type { LoadedRestaurantData } from '../src/agent/db.ts'
import { centsToReais, reaisToCents } from '../src/rules/money.ts'
import type { EvalQuestion, ReaisSelector, ResolvedExpected } from './types.ts'

function resolveReais(data: LoadedRestaurantData, sel: ReaisSelector): string {
  if ('engine' in sel) {
    if (sel.engine === 'perdido_total') return data.engine.perdido_total
    if (sel.engine === 'perdido_por_tipo') {
      const value = data.engine.perdido_por_tipo[sel.key as keyof typeof data.engine.perdido_por_tipo]
      if (value == null) throw new Error(`perdido_por_tipo missing key ${sel.key}`)
      return value
    }
    if (sel.engine === 'semana') {
      const week = data.engine.totais_por_semana.find((w) => w.semana === sel.semana)
      if (!week) throw new Error(`semana not found: ${sel.semana}`)
      return week[sel.field]
    }
  }
  if ('divergencia' in sel) {
    const d = data.engine.divergencias.find((x) => x.pedido_id_ifood === sel.divergencia)
    if (!d) throw new Error(`divergencia not found: ${sel.divergencia}`)
    return d[sel.field]
  }
  if ('pedido' in sel) {
    const p = data.pedidos.find((x) => x.pedido_id_ifood === sel.pedido)
    if (!p) throw new Error(`pedido not found: ${sel.pedido}`)
    return centsToReais(reaisToCents(p.valor_total))
  }
  if ('contrato' in sel) {
    return centsToReais(reaisToCents(data.contrato.taxa_repasse_semanal))
  }
  throw new Error(`Unknown reais selector: ${JSON.stringify(sel)}`)
}

/** Derive the answer key for one question from live engine + DB data (never hand-typed). */
export function deriveExpected(
  question: EvalQuestion,
  data: LoadedRestaurantData,
): ResolvedExpected {
  if (question.grade.mode === 'nao_sei') {
    return {
      naoSei: true,
      reais: [],
      ids: [],
      texts: [],
      textGroups: [],
      dataLimite: null,
      prazoAberto: null,
      forbidDataLimite: false,
    }
  }

  const grade = question.grade
  const reais = (grade.expect_reais ?? []).map((sel) => resolveReais(data, sel))
  // expect_ids are iFood order IDs (pedido_id_ifood), never internal pedido UUIDs.
  const ids = [...(grade.expect_ids ?? [])]

  if (grade.expect_lancamento_ids_of) {
    const d = data.engine.divergencias.find(
      (x) => x.pedido_id_ifood === grade.expect_lancamento_ids_of,
    )
    if (!d) throw new Error(`divergencia not found for lancamento ids: ${grade.expect_lancamento_ids_of}`)
    for (const id of d.lancamento_ids) {
      if (!ids.includes(id)) ids.push(id)
    }
  }

  let dataLimite: string | null = null
  let prazoAberto: boolean | null = null
  if (grade.expect_data_limite_of) {
    const d = data.engine.divergencias.find(
      (x) => x.pedido_id_ifood === grade.expect_data_limite_of,
    )
    if (!d?.data_limite) {
      throw new Error(`data_limite missing for ${grade.expect_data_limite_of}`)
    }
    dataLimite = d.data_limite
    // Do not imply a prazo-open/expired phrase check unless expect_prazo_aberto is set.
  }

  if (grade.expect_prazo_aberto != null) {
    prazoAberto = grade.expect_prazo_aberto
  }

  return {
    naoSei: false,
    reais,
    ids,
    texts: [...(grade.expect_texts ?? [])],
    textGroups: [...(grade.expect_text_groups ?? [])],
    dataLimite,
    prazoAberto,
    forbidDataLimite: Boolean(grade.forbid_data_limite),
  }
}

/** All R$ magnitudes the model may legally mention (engine + DB tool surface). */
export function collectAllowedReaisCents(data: LoadedRestaurantData): Set<number> {
  const allowed = new Set<number>()
  const add = (value: string | number) => {
    allowed.add(Math.abs(reaisToCents(value)))
  }

  add(data.engine.perdido_total)
  for (const v of Object.values(data.engine.perdido_por_tipo)) add(v)
  for (const w of data.engine.totais_por_semana) {
    add(w.repassado)
    add(w.esperado)
    add(w.diferenca)
    add(w.vendas_brutas)
    add(w.liquido_repassado)
    add(w.liquido_esperado)
  }
  add(data.engine.totais_gerais.vendas_brutas)
  add(data.engine.totais_gerais.repassado)
  add(data.engine.totais_gerais.esperado)
  add(data.engine.totais_gerais.diferenca)
  add(data.engine.totais_gerais.liquido_repassado)
  add(data.engine.totais_gerais.liquido_esperado)
  for (const d of data.engine.divergencias) {
    add(d.valor_cobrado)
    add(d.valor_esperado)
    add(d.diferenca)
  }
  for (const p of data.pedidos) add(p.valor_total)
  for (const l of data.lancamentos) add(l.valor)
  add(data.contrato.taxa_repasse_semanal)

  return allowed
}
