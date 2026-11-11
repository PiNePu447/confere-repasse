import { centsToReais, percentOfCents, reaisToCents } from './money.ts'
import type { ContratoInput, PedidoInput } from './types.ts'

export type ExpectedOrderCharges = {
  pedido_id_ifood: string
  valor_pedido: string
  valor_pedido_centavos: number
  comissao_esperada: string
  comissao_esperada_centavos: number
  taxa_online_esperada: string
  taxa_online_esperada_centavos: number
}

/** Contract-based expected fees for one order (positive R$ magnitudes). */
export function expectedChargesForOrder(
  pedido: PedidoInput,
  contrato: ContratoInput,
): ExpectedOrderCharges {
  const valor_pedido_centavos = reaisToCents(pedido.valor_total)
  const comissao_esperada_centavos = percentOfCents(
    valor_pedido_centavos,
    contrato.comissao_percentual,
  )
  const taxa_online_esperada_centavos =
    pedido.metodo_pagamento === 'ONLINE'
      ? percentOfCents(valor_pedido_centavos, contrato.taxa_pagamento_online_percentual)
      : 0

  return {
    pedido_id_ifood: pedido.pedido_id_ifood,
    valor_pedido: centsToReais(valor_pedido_centavos),
    valor_pedido_centavos,
    comissao_esperada: centsToReais(comissao_esperada_centavos),
    comissao_esperada_centavos,
    taxa_online_esperada: centsToReais(taxa_online_esperada_centavos),
    taxa_online_esperada_centavos,
  }
}
