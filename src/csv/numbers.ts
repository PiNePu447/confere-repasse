/** Parse Brazilian or plain decimal strings into a finite number. */

export function parseBrazilianNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let normalized = trimmed.replace(/\s/g, '')
  const negative =
    normalized.startsWith('-') ||
    (normalized.startsWith('(') && normalized.endsWith(')'))
  normalized = normalized.replace(/^[-(]+|[)]+$/g, '')

  if (normalized.includes(',') && normalized.includes('.')) {
    // 1.234,56 → thousands `.`, decimal `,`
    normalized = normalized.replace(/\./g, '').replace(',', '.')
  } else if (normalized.includes(',')) {
    // 12,00 or 1234,56
    normalized = normalized.replace(',', '.')
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return negative ? -value : value
}

export function formatPlainReais(value: number): string {
  return value.toFixed(2)
}
