import {
  DESCRICAO_COMISSAO,
  DESCRICAO_DEBITO_CANCELAMENTO,
  DESCRICAO_TAXA_ONLINE,
  DESCRICAO_TAXA_REPASSE,
} from '../rules/index.ts'
import type { ValidatedCsvRow } from '../csv/validate.ts'
import { parseAndValidateRelatorioCsv } from '../csv/index.ts'
import { supabase } from './supabase.ts'

function mapTipoLancamento(descricao: string): { fato: string; tipo: string } {
  switch (descricao) {
    case DESCRICAO_COMISSAO:
      return { fato: 'VENDA', tipo: 'COMISSAO' }
    case DESCRICAO_TAXA_ONLINE:
      return { fato: 'VENDA', tipo: 'TAXA_PAGAMENTO' }
    case DESCRICAO_DEBITO_CANCELAMENTO:
      return { fato: 'CANCELAMENTO', tipo: 'DEBITO_CANCELAMENTO' }
    case DESCRICAO_TAXA_REPASSE:
      return { fato: 'FECHAMENTO', tipo: 'TAXA_REPASSE' }
    default:
      return { fato: 'VENDA', tipo: 'OUTRO' }
  }
}

function competenciaFrom(isoDate: string): string {
  return isoDate.slice(0, 7)
}

function shortId(pedidoIdIfood: string): string {
  const cleaned = pedidoIdIfood.replace(/[^A-Za-z0-9]/g, '')
  return cleaned.slice(-4).padStart(4, '0') || '0000'
}

export type UploadResult =
  | { ok: true; weeks: string[]; pedidos: number; lancamentos: number }
  | { ok: false; errors: string[] }

/**
 * Validate CSV then replace lançamentos for the covered weeks via user RLS.
 * Invalid files change nothing.
 */
export async function uploadRelatorioCsv(text: string): Promise<UploadResult> {
  const validated = parseAndValidateRelatorioCsv(text)
  if (!validated.ok) return validated

  const { data: restaurante, error: restError } = await supabase
    .from('restaurantes')
    .select('id')
    .limit(1)
    .maybeSingle()

  if (restError) return { ok: false, errors: [restError.message] }
  if (!restaurante) {
    return { ok: false, errors: ['Nenhum restaurante encontrado para este usuário.'] }
  }

  const restauranteId = restaurante.id as string
  const weeks = validated.weeks

  // Atomic-enough sequence: delete week lançamentos, upsert pedidos, insert lançamentos.
  // If a later step fails, caller should restore demo. We delete only after validation.
  const { error: delError } = await supabase
    .from('lancamentos')
    .delete()
    .eq('restaurante_id', restauranteId)
    .in('titulo', weeks)

  if (delError) {
    return {
      ok: false,
      errors: [
        `Falha ao substituir lançamentos (RLS/migração?): ${delError.message}`,
      ],
    }
  }

  // Upsert pedidos referenced in the CSV
  const pedidoRows = validated.pedidos.map((p) => ({
    restaurante_id: restauranteId,
    pedido_id_ifood: p.pedido_id_ifood,
    pedido_id_curto: shortId(p.pedido_id_ifood),
    metodo_pagamento: p.metodo_pagamento,
    status: p.status,
    valor_total: p.valor_total,
    data_criacao: p.data_criacao,
    motivo_cancelamento: p.status === 'CANCELADO' ? 'Importado via CSV' : null,
  }))

  if (pedidoRows.length > 0) {
    const { error: pedidoError } = await supabase.from('pedidos').upsert(pedidoRows, {
      onConflict: 'restaurante_id,pedido_id_ifood',
    })
    if (pedidoError) {
      return {
        ok: false,
        errors: [
          `Falha ao gravar pedidos (RLS/migração?): ${pedidoError.message}`,
        ],
      }
    }
  }

  const { data: pedidosDb, error: fetchPedidosError } = await supabase
    .from('pedidos')
    .select('id, pedido_id_ifood')
    .eq('restaurante_id', restauranteId)

  if (fetchPedidosError) {
    return { ok: false, errors: [fetchPedidosError.message] }
  }

  const idByIfood = new Map<string, string>()
  for (const p of pedidosDb ?? []) {
    idByIfood.set(p.pedido_id_ifood as string, p.id as string)
  }

  const lancamentoRows = validated.rows.map((row: ValidatedCsvRow) => {
    const mapped = mapTipoLancamento(row.descricao_lancamento)
    const pedidoUuid = row.pedido_id_ifood ? idByIfood.get(row.pedido_id_ifood) ?? null : null
    return {
      restaurante_id: restauranteId,
      pedido_id: pedidoUuid,
      pedido_id_ifood: row.pedido_id_ifood,
      competencia: competenciaFrom(row.data_apuracao_inicio),
      fato_gerador: mapped.fato,
      tipo_lancamento: mapped.tipo,
      descricao_lancamento: row.descricao_lancamento,
      valor: row.valor,
      base_calculo: row.base_calculo,
      percentual_taxa: row.percentual_taxa,
      data_apuracao_inicio: row.data_apuracao_inicio,
      data_apuracao_fim: row.data_apuracao_fim,
      data_repasse_esperada: row.data_apuracao_fim,
      data_criacao_pedido: row.data_criacao_pedido,
      impacto_no_repasse: row.impacto_no_repasse,
      metodo_pagamento: row.metodo_pagamento,
      titulo: row.titulo,
    }
  })

  const { error: insertError } = await supabase.from('lancamentos').insert(lancamentoRows)
  if (insertError) {
    return {
      ok: false,
      errors: [
        `Falha ao inserir lançamentos (RLS/migração?): ${insertError.message}`,
      ],
    }
  }

  return {
    ok: true,
    weeks,
    pedidos: validated.pedidos.length,
    lancamentos: validated.lancamentos.length,
  }
}

export async function restoreDemoData(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('reseed_own_restaurant')
  if (error) {
    return {
      ok: false,
      error: `Falha ao restaurar dados demo (RPC/migração?): ${error.message}`,
    }
  }
  return { ok: true }
}
