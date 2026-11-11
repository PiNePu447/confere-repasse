/**
 * Relatório de Conciliação CSV header (T8).
 *
 * Separator: `;` (Excel BR) or `,` (auto-detected from the header line).
 * Numbers: Brazilian (`-12,00` / `1.234,56`) or plain (`-12.00`).
 * Dates: `YYYY-MM-DD`.
 *
 * Order columns may be empty on weekly fee rows (Taxa de repasse semanal).
 * When `pedido_id_ifood` is set, order fields are required so the engine can
 * create/upsert the pedido.
 */
export const CSV_REQUIRED_HEADERS = [
  'pedido_id_ifood',
  'metodo_pagamento',
  'status_pedido',
  'valor_pedido',
  'data_criacao_pedido',
  'descricao_lancamento',
  'valor',
  'base_calculo',
  'percentual_taxa',
  'data_apuracao_inicio',
  'data_apuracao_fim',
  'titulo',
  'impacto_no_repasse',
] as const

export type CsvHeader = (typeof CSV_REQUIRED_HEADERS)[number]

export const CSV_HEADER_LINE = CSV_REQUIRED_HEADERS.join(';')
