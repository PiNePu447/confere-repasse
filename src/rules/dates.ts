/** Calendar-day helpers on YYYY-MM-DD strings. No Date.now() / new Date() clock reads. */

const DAY_MS = 24 * 60 * 60 * 1000

/** Parse YYYY-MM-DD as a UTC noon timestamp (stable across timezones). */
function parseUtcDay(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) {
    throw new Error(`Invalid ISO date: ${isoDate}`)
  }
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  return Date.UTC(y, m - 1, d, 12, 0, 0)
}

function formatUtcDay(ms: number): string {
  const dt = new Date(ms)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(isoDate: string, days: number): string {
  return formatUtcDay(parseUtcDay(isoDate) + days * DAY_MS)
}

/** Inclusive: today <= dataLimite ⇒ still open. */
export function isOnOrBefore(isoDate: string, other: string): boolean {
  return parseUtcDay(isoDate) <= parseUtcDay(other)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseUtcDay(to) - parseUtcDay(from)) / DAY_MS)
}
