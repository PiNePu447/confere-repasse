/** Display helper: engine R$ strings use `.` decimals; UI shows Brazilian `R$ 1.234,56`. */

export function formatReaisBr(engineReais: string): string {
  const negative = engineReais.trim().startsWith('-')
  const raw = negative ? engineReais.trim().slice(1) : engineReais.trim()
  const [intPart = '0', fracPart = '00'] = raw.split('.')
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const formatted = `R$ ${withThousands},${fracPart.padEnd(2, '0').slice(0, 2)}`
  return negative ? `−${formatted}` : formatted
}
