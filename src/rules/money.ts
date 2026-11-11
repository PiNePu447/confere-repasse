/** Integer-cent money helpers. Never use binary floats for R$ amounts. */

const REAIS_RE = /^(-?)(\d+)(?:\.(\d{1,2}))?$/

/** Parse a DB numeric / JS number / "12.50" into signed integer cents. */
export function reaisToCents(value: number | string): number {
  const raw =
    typeof value === 'number'
      ? value.toFixed(2)
      : String(value).trim().replace(',', '.')

  const match = REAIS_RE.exec(raw)
  if (!match) {
    throw new Error(`Invalid money value: ${String(value)}`)
  }

  const sign = match[1] === '-' ? -1 : 1
  const whole = Number(match[2])
  const frac = (match[3] ?? '').padEnd(2, '0').slice(0, 2)
  return sign * (whole * 100 + Number(frac))
}

/** Format signed cents as a two-decimal reais string ("16.50", "-1.99"). */
export function centsToReais(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${sign}${whole}.${frac}`
}

/** Percent of a positive reais amount in cents, half-up to the nearest cent. */
export function percentOfCents(baseCents: number, percent: number | string): number {
  const base = Math.abs(baseCents)
  const pctCents = reaisToCents(percent) // 12.00 → 1200 meaning 12.00%
  // base * percent / 100, with integer half-up:
  // (baseCents * pctCents) / 10000
  const numer = base * pctCents
  return Math.floor((numer + 5000) / 10000)
}
