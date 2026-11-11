/** Normalize Brazilian / international money spellings to signed integer cents. */

export function parseMoneyTokenToCents(raw: string): number | null {
  let s = raw.trim()
  if (!s) return null
  s = s.replace(/^R\$\s*/i, '').trim()

  const negative = s.startsWith('-')
  if (negative) s = s.slice(1).trim()

  // 1.234,56 or 80,00
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s) || /^\d+,\d{2}$/.test(s)) {
    const normalized = s.replace(/\./g, '').replace(',', '.')
    return toCentsFromDot(normalized, negative)
  }

  // 1,234.56
  if (/^\d{1,3}(,\d{3})*\.\d{2}$/.test(s)) {
    const normalized = s.replace(/,/g, '')
    return toCentsFromDot(normalized, negative)
  }

  // 1234.56 or 80.00 or 80
  if (/^\d+(\.\d{1,2})?$/.test(s)) {
    return toCentsFromDot(Number(s).toFixed(2), negative)
  }

  return null
}

function toCentsFromDot(dotValue: string, negative: boolean): number {
  const [whole, frac = '00'] = dotValue.split('.')
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2))
  return negative ? -cents : cents
}

export function centsToDot(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export function absCents(cents: number): number {
  return Math.abs(cents)
}

// Decimals first (1–2 places); bare integers only when not followed by a decimal point.
const MONEY_TOKEN =
  '-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}|-?\\d+,\\d{2}|-?\\d{1,3}(?:,\\d{3})*\\.\\d{1,2}|-?\\d+\\.\\d{1,2}|-?\\d+(?!\\.\\d)'

/**
 * Extract money amounts from prose.
 * Each R$ token is parsed once (no double-count of "R$ 207.50" as 207).
 * Bare decimals without R$ are included; bare integers without R$ are ignored.
 */
export function extractMoneyCentsFromText(text: string): number[] {
  const out: number[] = []
  const rsRe = new RegExp(`R\\$\\s*(${MONEY_TOKEN})`, 'gi')
  for (const match of text.matchAll(rsRe)) {
    const parsed = parseMoneyTokenToCents(match[1] ?? '')
    if (parsed != null) out.push(parsed)
  }

  const bareDecimalRe =
    /(?<![\w$])(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+\.\d{2})(?![\w%])/g
  for (const match of text.matchAll(bareDecimalRe)) {
    // Skip if this span was already part of an R$ match
    const idx = match.index ?? 0
    if (idx >= 2 && /R\$\s*$/i.test(text.slice(Math.max(0, idx - 4), idx))) continue
    const parsed = parseMoneyTokenToCents(match[1] ?? '')
    if (parsed != null) out.push(parsed)
  }

  return out
}

export function reaisStringToAbsCents(value: string | number): number {
  const parsed = parseMoneyTokenToCents(String(value))
  if (parsed == null) {
    throw new Error(`Cannot parse money: ${String(value)}`)
  }
  return absCents(parsed)
}

/** True if `text` contains this reais amount under any common formatting. */
export function textContainsReais(text: string, reais: string | number): boolean {
  const target = reaisStringToAbsCents(reais)
  const found = extractMoneyCentsFromText(text).map(absCents)
  if (found.includes(target)) return true

  const dot = centsToDot(target)
  const [w, f] = dot.split('.')
  const variants = [dot, `${w},${f}`, `R$ ${dot}`, `R$ ${w},${f}`, `R$${dot}`, `R$${w},${f}`]
  if (f === '00') {
    variants.push(`R$ ${w}`, `R$${w}`)
  }
  return variants.some((v) => text.includes(v))
}
