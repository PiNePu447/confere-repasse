/** Calendar helpers at the agent boundary (clock OK here; rules engine still takes `today`). */

export function todayInSaoPaulo(now: Date = new Date()): string {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
