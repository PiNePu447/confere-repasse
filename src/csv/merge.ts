import type { AnalyzeInput, LancamentoInput, PedidoInput } from '../rules/index.ts'
import type { ValidateCsvSuccess } from './validate.ts'

/**
 * Apply a validated CSV onto an existing restaurant snapshot.
 * Replaces ALL lançamentos whose `titulo` is in the file's weeks,
 * upserts pedidos referenced by the file, and leaves other weeks untouched.
 */
export function mergeCsvIntoSnapshot(
  current: Pick<AnalyzeInput, 'contrato' | 'pedidos' | 'lancamentos' | 'today'>,
  csv: ValidateCsvSuccess,
): AnalyzeInput {
  const weekSet = new Set(csv.weeks)
  const keptLancamentos = current.lancamentos.filter((l) => !weekSet.has(l.titulo ?? ''))
  const mergedLancamentos: LancamentoInput[] = [...keptLancamentos, ...csv.lancamentos]

  const pedidoMap = new Map<string, PedidoInput>()
  for (const p of current.pedidos) {
    pedidoMap.set(p.pedido_id_ifood, p)
  }
  for (const p of csv.pedidos) {
    pedidoMap.set(p.pedido_id_ifood, p)
  }

  return {
    contrato: current.contrato,
    pedidos: [...pedidoMap.values()],
    lancamentos: mergedLancamentos,
    today: current.today,
  }
}
