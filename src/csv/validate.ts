import {
  DESCRICAO_COMISSAO,
  DESCRICAO_DEBITO_CANCELAMENTO,
  DESCRICAO_TAXA_ONLINE,
  DESCRICAO_TAXA_REPASSE,
  type LancamentoInput,
  type MetodoPagamento,
  type PedidoInput,
} from '../rules/index.ts'
import { formatPlainReais, parseBrazilianNumber } from './numbers.ts'
import type { RawCsvRow } from './parse.ts'

export const ALLOWED_DESCRICOES = new Set([
  DESCRICAO_COMISSAO,
  DESCRICAO_TAXA_ONLINE,
  DESCRICAO_DEBITO_CANCELAMENTO,
  DESCRICAO_TAXA_REPASSE,
])

const ALLOWED_METODOS = new Set(['ONLINE', 'PAGO_NA_ENTREGA'])
const ALLOWED_STATUS = new Set(['ENTREGUE', 'CANCELADO', 'EM_PREPARO', 'SAIU_ENTREGA'])

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type ValidatedCsvRow = {
  line: number
  pedido_id_ifood: string | null
  metodo_pagamento: MetodoPagamento | null
  status_pedido: string | null
  valor_pedido: number | null
  data_criacao_pedido: string | null
  descricao_lancamento: string
  valor: number
  base_calculo: number | null
  percentual_taxa: number | null
  data_apuracao_inicio: string
  data_apuracao_fim: string
  titulo: string
  impacto_no_repasse: boolean
}

export type ValidateCsvSuccess = {
  ok: true
  rows: ValidatedCsvRow[]
  weeks: string[]
  pedidos: PedidoInput[]
  lancamentos: LancamentoInput[]
}

export type ValidateCsvFailure = {
  ok: false
  errors: string[]
}

function parseOptionalNumber(raw: string, label: string, line: number, errors: string[]): number | null {
  if (!raw.trim()) return null
  const value = parseBrazilianNumber(raw)
  if (value == null) {
    errors.push(`Linha ${line}: ${label} inválido ("${raw}"). Use formato como -12,00.`)
    return null
  }
  return value
}

function parseRequiredNumber(raw: string, label: string, line: number, errors: string[]): number | null {
  const value = parseBrazilianNumber(raw)
  if (value == null) {
    errors.push(`Linha ${line}: ${label} inválido ("${raw}"). Use formato como -12,00.`)
    return null
  }
  return value
}

function parseDate(raw: string, label: string, line: number, errors: string[]): string | null {
  const trimmed = raw.trim()
  if (!ISO_DATE_RE.test(trimmed)) {
    errors.push(`Linha ${line}: ${label} inválida ("${raw}"). Use YYYY-MM-DD.`)
    return null
  }
  return trimmed
}

function parseBool(raw: string, line: number, errors: string[]): boolean | null {
  const v = raw.trim().toLowerCase()
  if (v === 'true' || v === '1' || v === 'sim') return true
  if (v === 'false' || v === '0' || v === 'nao' || v === 'não') return false
  errors.push(`Linha ${line}: impacto_no_repasse inválido ("${raw}"). Use true/false.`)
  return null
}

/**
 * Validate every raw row. Any error ⇒ ok:false and callers must change no data.
 */
export function validateRelatorioRows(rawRows: RawCsvRow[]): ValidateCsvSuccess | ValidateCsvFailure {
  const errors: string[] = []
  const rows: ValidatedCsvRow[] = []

  for (const raw of rawRows) {
    const line = raw._line
    const descricao = raw.descricao_lancamento.trim()
    if (!descricao) {
      errors.push(`Linha ${line}: descricao_lancamento é obrigatória.`)
    } else if (!ALLOWED_DESCRICOES.has(descricao)) {
      errors.push(
        `Linha ${line}: descrição desconhecida ("${descricao}"). Use uma de: ${[...ALLOWED_DESCRICOES].join('; ')}.`,
      )
    }

    const valor = parseRequiredNumber(raw.valor, 'valor', line, errors)
    const inicio = parseDate(raw.data_apuracao_inicio, 'data_apuracao_inicio', line, errors)
    const fim = parseDate(raw.data_apuracao_fim, 'data_apuracao_fim', line, errors)
    const titulo = raw.titulo.trim()
    if (!titulo) errors.push(`Linha ${line}: titulo (semana) é obrigatório.`)
    const impacto = parseBool(raw.impacto_no_repasse, line, errors)
    const base = parseOptionalNumber(raw.base_calculo, 'base_calculo', line, errors)
    const pct = parseOptionalNumber(raw.percentual_taxa, 'percentual_taxa', line, errors)

    const pedidoId = raw.pedido_id_ifood.trim()
    const isFeeOnly = !pedidoId

    if (isFeeOnly && descricao !== DESCRICAO_TAXA_REPASSE) {
      errors.push(
        `Linha ${line}: pedido_id_ifood é obrigatório para "${descricao || 'esta descrição'}".`,
      )
    }

    let metodo: MetodoPagamento | null = null
    let status: string | null = null
    let valorPedido: number | null = null
    let dataPedido: string | null = null

    if (!isFeeOnly) {
      const metodoRaw = raw.metodo_pagamento.trim().toUpperCase()
      if (!ALLOWED_METODOS.has(metodoRaw)) {
        errors.push(
          `Linha ${line}: metodo_pagamento inválido ("${raw.metodo_pagamento}"). Use ONLINE ou PAGO_NA_ENTREGA.`,
        )
      } else {
        metodo = metodoRaw as MetodoPagamento
      }

      const statusRaw = raw.status_pedido.trim().toUpperCase()
      if (!ALLOWED_STATUS.has(statusRaw)) {
        errors.push(
          `Linha ${line}: status_pedido inválido ("${raw.status_pedido}").`,
        )
      } else {
        status = statusRaw
      }

      valorPedido = parseRequiredNumber(raw.valor_pedido, 'valor_pedido', line, errors)
      if (valorPedido != null && valorPedido < 0) {
        errors.push(`Linha ${line}: valor_pedido não pode ser negativo.`)
      }
      dataPedido = parseDate(raw.data_criacao_pedido, 'data_criacao_pedido', line, errors)
    }

    if (
      descricao &&
      valor != null &&
      inicio &&
      fim &&
      titulo &&
      impacto != null &&
      (isFeeOnly || (metodo && status && valorPedido != null && dataPedido))
    ) {
      rows.push({
        line,
        pedido_id_ifood: isFeeOnly ? null : pedidoId,
        metodo_pagamento: metodo,
        status_pedido: status,
        valor_pedido: valorPedido,
        data_criacao_pedido: dataPedido,
        descricao_lancamento: descricao,
        valor,
        base_calculo: base,
        percentual_taxa: pct,
        data_apuracao_inicio: inicio,
        data_apuracao_fim: fim,
        titulo,
        impacto_no_repasse: impacto,
      })
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  // Build unique pedidos (last non-conflicting wins; conflicts → error)
  const pedidoMap = new Map<string, PedidoInput>()
  for (const row of rows) {
    if (!row.pedido_id_ifood) continue
    const existing = pedidoMap.get(row.pedido_id_ifood)
    const next: PedidoInput = {
      id: `csv-${row.pedido_id_ifood}`,
      pedido_id_ifood: row.pedido_id_ifood,
      metodo_pagamento: row.metodo_pagamento!,
      status: row.status_pedido!,
      valor_total: formatPlainReais(row.valor_pedido!),
      data_criacao: row.data_criacao_pedido!,
    }
    if (existing) {
      if (
        existing.metodo_pagamento !== next.metodo_pagamento ||
        existing.status !== next.status ||
        existing.valor_total !== next.valor_total ||
        existing.data_criacao !== next.data_criacao
      ) {
        errors.push(
          `Linha ${row.line}: pedido ${row.pedido_id_ifood} com dados conflitantes em relação a outra linha.`,
        )
      }
    } else {
      pedidoMap.set(row.pedido_id_ifood, next)
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const lancamentos: LancamentoInput[] = rows.map((row, index) => ({
    id: `csv-lan-${index + 1}`,
    pedido_id: row.pedido_id_ifood ? `csv-${row.pedido_id_ifood}` : null,
    pedido_id_ifood: row.pedido_id_ifood,
    descricao_lancamento: row.descricao_lancamento,
    valor: formatPlainReais(row.valor),
    base_calculo: row.base_calculo == null ? null : formatPlainReais(row.base_calculo),
    percentual_taxa: row.percentual_taxa,
    data_apuracao_inicio: row.data_apuracao_inicio,
    data_apuracao_fim: row.data_apuracao_fim,
    titulo: row.titulo,
    impacto_no_repasse: row.impacto_no_repasse,
  }))

  const weeks = [...new Set(rows.map((r) => r.titulo))].sort()

  return {
    ok: true,
    rows,
    weeks,
    pedidos: [...pedidoMap.values()],
    lancamentos,
  }
}
