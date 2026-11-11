import { centsToReais, reaisToCents, type Divergence } from '../rules/index.ts'
import type { LoadedRestaurantData } from './db.ts'

/** One-line field docs reused in tool parameter schemas (what the model must cite). */
const FIELD = {
  pedido_id_ifood:
    'ID iFood do pedido (ex.: DEMO-ANOM-003). Cite este ID na resposta; NÃO é UUID interno nem nome da divergência.',
  semana: 'Título da semana no relatório, ex.: REPASSE-W0',
  descricao: 'Trecho da descrição do lançamento (case-insensitive)',
  status: 'Filtro opcional de status do pedido (ex.: CONCLUIDO, CANCELADO)',
  tipo: 'Tipo de divergência (ex.: cancelamento_debitado, comissao_acima_contrato)',
} as const

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'listar_lancamentos',
      description:
        'Lista lançamentos do relatório de conciliação, com filtros opcionais por semana (titulo), pedido_id_ifood e descrição. Retorno: lancamentos[].lancamento_id (ID do lançamento a citar), pedido_id_ifood (ID iFood do pedido a citar), descricao_lancamento, valor, percentual_taxa, titulo/semana. UUIDs internos de pedido NÃO são expostos.',
      parameters: {
        type: 'object',
        properties: {
          semana: {
            type: 'string',
            description: FIELD.semana,
          },
          pedido_id_ifood: {
            type: 'string',
            description: FIELD.pedido_id_ifood,
          },
          descricao: {
            type: 'string',
            description: FIELD.descricao,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'obter_pedidos',
      description:
        'Obtém um ou mais pedidos. Sem filtro, retorna todos os pedidos do restaurante. Retorno: pedidos[].pedido_id_ifood (ID iFood a citar), status, valor_total, metodo_pagamento, data_criacao. UUID interno do pedido NÃO é exposto.',
      parameters: {
        type: 'object',
        properties: {
          pedido_id_ifood: {
            type: 'string',
            description: FIELD.pedido_id_ifood,
          },
          status: { type: 'string', description: FIELD.status },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'obter_contrato',
      description:
        'Retorna o contrato ativo (comissões e taxas). Retorno: plano, comissao_percentual, taxa_pagamento_online_percentual, taxa_repasse_semanal.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'obter_divergencias',
      description:
        'Lista divergências detectadas pelo motor de regras. Retorno: divergencias[].tipo, pedido_id_ifood (ID iFood do pedido a citar — NÃO é nome da divergência), lancamento_ids (IDs de lançamento a citar), valores, semana, orientacao, data_limite/prazo_aberto quando houver. UUIDs internos de pedido NÃO são expostos.',
      parameters: {
        type: 'object',
        properties: {
          pedido_id_ifood: {
            type: 'string',
            description: FIELD.pedido_id_ifood,
          },
          tipo: { type: 'string', description: FIELD.tipo },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'obter_totais',
      description:
        'Totais por semana (repassado vs esperado) e total perdido por tipo de divergência. Retorno: perdido_por_tipo (totais R$), perdido_por_tipo_casos (por tipo: pedido_id_ifood, diferenca, lancamento_ids a citar), perdido_total, totais_por_semana, totais_gerais.',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rascunhar_contestacao',
      description:
        'Gera um rascunho de contestação local a partir dos dados do motor. Não envia nada a ninguém. Use pedido_id_ifood (ID iFood). O rascunho cita pedido_id_ifood e lancamento_ids.',
      parameters: {
        type: 'object',
        properties: {
          pedido_id_ifood: {
            type: 'string',
            description: FIELD.pedido_id_ifood,
          },
        },
        required: ['pedido_id_ifood'],
        additionalProperties: false,
      },
    },
  },
] as const

function asRecord(args: Record<string, unknown>): Record<string, unknown> {
  return args ?? {}
}

/** Tool-facing divergence: hide internal pedido UUIDs; keep iFood + lançamento IDs. */
function formatDivergence(d: Divergence) {
  return {
    tipo: d.tipo,
    pedido_id_ifood: d.pedido_id_ifood,
    lancamento_ids: d.lancamento_ids,
    valor_cobrado: d.valor_cobrado,
    valor_esperado: d.valor_esperado,
    diferenca: d.diferenca,
    semana: d.semana,
    orientacao: d.orientacao,
    data_limite: d.data_limite,
    prazo_aberto: d.prazo_aberto,
  }
}

export function draftContestacao(
  data: LoadedRestaurantData,
  pedidoIdIfood: string,
): Record<string, unknown> {
  const divergencias = data.engine.divergencias.filter(
    (d) => d.pedido_id_ifood === pedidoIdIfood,
  )
  if (divergencias.length === 0) {
    return {
      ok: false,
      mensagem: `não sei: não há divergência nos dados para o pedido ${pedidoIdIfood}`,
    }
  }

  const pedido = data.pedidos.find((p) => p.pedido_id_ifood === pedidoIdIfood)
  const linhas: string[] = []
  linhas.push(`Rascunho de contestação — pedido iFood ${pedidoIdIfood}`)
  if (pedido) {
    linhas.push(`Status do pedido: ${pedido.status}`)
    linhas.push(`Método de pagamento: ${pedido.metodo_pagamento}`)
    linhas.push(`Valor do pedido: R$ ${centsToReais(reaisToCents(pedido.valor_total))}`)
    linhas.push(`Data do pedido: ${pedido.data_criacao}`)
  }

  for (const d of divergencias) {
    linhas.push('')
    linhas.push(`Tipo: ${d.tipo}`)
    linhas.push(`Valor cobrado: R$ ${d.valor_cobrado}`)
    linhas.push(`Valor esperado: R$ ${d.valor_esperado}`)
    linhas.push(`Diferença: R$ ${d.diferenca}`)
    linhas.push(`IDs dos lançamentos: ${d.lancamento_ids.join(', ')}`)
    linhas.push(`Semana: ${d.semana}`)
    if (d.tipo === 'cancelamento_debitado' && d.data_limite) {
      linhas.push(`Data limite para contestação: ${d.data_limite}`)
      linhas.push(
        `Prazo aberto: ${d.prazo_aberto ? 'sim' : 'não'}`,
      )
      linhas.push(`Orientação: ${d.orientacao}`)
    } else {
      linhas.push('Data limite: não se aplica')
      linhas.push('Orientação: abrir chamado no suporte, sem prazo documentado')
    }
  }

  linhas.push('')
  linhas.push(
    'Este texto é apenas um rascunho local. Nada foi enviado a suporte ou a qualquer canal externo.',
  )

  return {
    ok: true,
    pedido_id_ifood: pedidoIdIfood,
    divergencias: divergencias.map(formatDivergence),
    rascunho: linhas.join('\n'),
  }
}

export function executeTool(
  data: LoadedRestaurantData,
  name: string,
  rawArgs: Record<string, unknown>,
): unknown {
  const args = asRecord(rawArgs)

  switch (name) {
    case 'listar_lancamentos': {
      let rows = data.lancamentos
      if (typeof args.semana === 'string' && args.semana.trim()) {
        const semana = args.semana.trim()
        rows = rows.filter((l) => (l.titulo ?? l.data_apuracao_inicio) === semana)
      }
      if (typeof args.pedido_id_ifood === 'string' && args.pedido_id_ifood.trim()) {
        const pid = args.pedido_id_ifood.trim()
        rows = rows.filter((l) => l.pedido_id_ifood === pid)
      }
      if (typeof args.descricao === 'string' && args.descricao.trim()) {
        const needle = args.descricao.trim().toLowerCase()
        rows = rows.filter((l) => l.descricao_lancamento.toLowerCase().includes(needle))
      }
      return {
        total: rows.length,
        lancamentos: rows.map((l) => ({
          lancamento_id: l.id,
          pedido_id_ifood: l.pedido_id_ifood,
          descricao_lancamento: l.descricao_lancamento,
          valor: l.valor,
          percentual_taxa: l.percentual_taxa,
          data_apuracao_inicio: l.data_apuracao_inicio,
          data_apuracao_fim: l.data_apuracao_fim,
          titulo: l.titulo,
          impacto_no_repasse: l.impacto_no_repasse,
        })),
      }
    }
    case 'obter_pedidos': {
      let rows = data.pedidos
      if (typeof args.pedido_id_ifood === 'string' && args.pedido_id_ifood.trim()) {
        const pid = args.pedido_id_ifood.trim()
        rows = rows.filter((p) => p.pedido_id_ifood === pid)
      }
      if (typeof args.status === 'string' && args.status.trim()) {
        const status = args.status.trim().toUpperCase()
        rows = rows.filter((p) => p.status.toUpperCase() === status)
      }
      return {
        total: rows.length,
        pedidos: rows.map((p) => ({
          pedido_id_ifood: p.pedido_id_ifood,
          metodo_pagamento: p.metodo_pagamento,
          status: p.status,
          valor_total: p.valor_total,
          data_criacao: p.data_criacao,
          motivo_cancelamento: p.motivo_cancelamento ?? null,
        })),
      }
    }
    case 'obter_contrato': {
      return {
        restaurante: data.restaurante.nome,
        contrato: {
          plano: data.contrato.plano,
          comissao_percentual: data.contrato.comissao_percentual,
          taxa_pagamento_online_percentual: data.contrato.taxa_pagamento_online_percentual,
          taxa_repasse_semanal: data.contrato.taxa_repasse_semanal,
          ativo: data.contrato.ativo,
        },
      }
    }
    case 'obter_divergencias': {
      let rows = data.engine.divergencias
      if (typeof args.pedido_id_ifood === 'string' && args.pedido_id_ifood.trim()) {
        const pid = args.pedido_id_ifood.trim()
        rows = rows.filter((d) => d.pedido_id_ifood === pid)
      }
      if (typeof args.tipo === 'string' && args.tipo.trim()) {
        const tipo = args.tipo.trim()
        rows = rows.filter((d) => d.tipo === tipo)
      }
      return {
        total: rows.length,
        divergencias: rows.map(formatDivergence),
      }
    }
    case 'obter_totais': {
      const perdido_por_tipo_casos = {
        comissao_acima_contrato: [] as Array<{
          pedido_id_ifood: string
          diferenca: string
          lancamento_ids: string[]
        }>,
        cobranca_duplicada: [] as Array<{
          pedido_id_ifood: string
          diferenca: string
          lancamento_ids: string[]
        }>,
        cancelamento_debitado: [] as Array<{
          pedido_id_ifood: string
          diferenca: string
          lancamento_ids: string[]
        }>,
        taxa_online_em_pago_na_entrega: [] as Array<{
          pedido_id_ifood: string
          diferenca: string
          lancamento_ids: string[]
        }>,
      }
      for (const d of data.engine.divergencias) {
        perdido_por_tipo_casos[d.tipo].push({
          pedido_id_ifood: d.pedido_id_ifood,
          diferenca: d.diferenca,
          lancamento_ids: d.lancamento_ids,
        })
      }
      return {
        totais_por_semana: data.engine.totais_por_semana,
        totais_gerais: data.engine.totais_gerais,
        perdido_por_tipo: data.engine.perdido_por_tipo,
        perdido_por_tipo_casos,
        perdido_total: data.engine.perdido_total,
      }
    }
    case 'rascunhar_contestacao': {
      const pedidoId = String(args.pedido_id_ifood ?? '').trim()
      if (!pedidoId) {
        return { ok: false, mensagem: 'pedido_id_ifood é obrigatório' }
      }
      return draftContestacao(data, pedidoId)
    }
    default:
      return { erro: `Ferramenta desconhecida: ${name}` }
  }
}

export function createToolExecutor(data: LoadedRestaurantData) {
  return async (name: string, args: Record<string, unknown>) => executeTool(data, name, args)
}
