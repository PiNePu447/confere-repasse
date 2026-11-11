import type { EvalQuestion } from './types.ts'

/** Parse EVAL_ONLY: `19-30`, `q19-q30`, `q05,q12`, `5,12,19-22`. 1-based indices or qXX ids. */
export function selectQuestions(
  all: EvalQuestion[],
  onlyRaw: string | undefined,
): { selected: EvalQuestion[]; partial: boolean; selector: string | null } {
  const raw = onlyRaw?.trim()
  if (!raw) return { selected: all, partial: false, selector: null }

  const byId = new Map(all.map((q) => [q.id.toLowerCase(), q]))
  const byIndex = new Map(all.map((q, i) => [i + 1, q]))
  const picked = new Map<string, EvalQuestion>()

  const addId = (id: string) => {
    const q = byId.get(id.toLowerCase())
    if (!q) throw new Error(`EVAL_ONLY: unknown question id ${id}`)
    picked.set(q.id, q)
  }
  const addIndex = (n: number) => {
    const q = byIndex.get(n)
    if (!q) throw new Error(`EVAL_ONLY: index ${n} out of range 1..${all.length}`)
    picked.set(q.id, q)
  }

  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const idRange = /^q(\d{1,2})\s*-\s*q(\d{1,2})$/i.exec(part)
    const numRange = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(part)
    const singleId = /^q\d{1,2}$/i.exec(part)
    const singleNum = /^(\d{1,2})$/.exec(part)

    if (idRange) {
      const a = Number(idRange[1])
      const b = Number(idRange[2])
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      for (let n = lo; n <= hi; n++) addId(`q${String(n).padStart(2, '0')}`)
    } else if (numRange) {
      const a = Number(numRange[1])
      const b = Number(numRange[2])
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      for (let n = lo; n <= hi; n++) addIndex(n)
    } else if (singleId) {
      addId(part)
    } else if (singleNum) {
      addIndex(Number(singleNum[1]))
    } else {
      throw new Error(`EVAL_ONLY: cannot parse segment "${part}"`)
    }
  }

  const selected = all.filter((q) => picked.has(q.id))
  if (selected.length === 0) throw new Error('EVAL_ONLY selected zero questions')
  return { selected, partial: selected.length < all.length, selector: raw }
}
