import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { selectQuestions } from './selectQuestions.ts'
import type { EvalQuestion } from './types.ts'

const ALL: EvalQuestion[] = Array.from({ length: 30 }, (_, i) => ({
  id: `q${String(i + 1).padStart(2, '0')}`,
  categoria: 't',
  pergunta: `p${i + 1}`,
  grade: { mode: 'nao_sei' },
}))

describe('EVAL_ONLY selection', () => {
  it('parses numeric ranges and id lists', () => {
    const a = selectQuestions(ALL, '19-30')
    assert.equal(a.partial, true)
    assert.equal(a.selected[0]!.id, 'q19')
    assert.equal(a.selected.at(-1)!.id, 'q30')
    assert.equal(a.selected.length, 12)

    const b = selectQuestions(ALL, 'q05,q12,q19-q22')
    assert.deepEqual(
      b.selected.map((q) => q.id),
      ['q05', 'q12', 'q19', 'q20', 'q21', 'q22'],
    )
  })

  it('returns the full set when unset', () => {
    const all = selectQuestions(ALL, undefined)
    assert.equal(all.partial, false)
    assert.equal(all.selected.length, 30)
  })
})
