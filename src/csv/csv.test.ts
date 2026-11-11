import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { analyzeRepasse } from '../rules/engine.ts'
import { buildSeedFixture } from '../rules/fixtures/seedFixture.ts'
import { CSV_HEADER_LINE } from './headers.ts'
import { mergeCsvIntoSnapshot } from './merge.ts'
import { parseBrazilianNumber } from './numbers.ts'
import { parseAndValidateRelatorioCsv } from './pipeline.ts'

const TODAY = '2026-11-11'

describe('CSV relatório parse/validate', () => {
  it('parses Brazilian numbers and semicolon separators', () => {
    assert.equal(parseBrazilianNumber('-12,00'), -12)
    assert.equal(parseBrazilianNumber('1.234,56'), 1234.56)
    assert.equal(parseBrazilianNumber('-3.20'), -3.2)

    const text = `${CSV_HEADER_LINE}
;;;;;Taxa de repasse semanal;-1,99;;;2026-10-29;2026-11-04;REPASSE-W1;true
`
    const result = parseAndValidateRelatorioCsv(text)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.lancamentos.length, 1)
    assert.equal(result.lancamentos[0]!.valor, '-1.99')
    assert.deepEqual(result.weeks, ['REPASSE-W1'])
  })

  it('rejects a bad header without accepting rows', () => {
    const result = parseAndValidateRelatorioCsv('foo;bar\n1;2\n')
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.match(result.errors[0]!, /Cabeçalho inválido/)
  })

  it('rejects bad values and unknown descriptions (all-or-nothing)', () => {
    const badValue = `${CSV_HEADER_LINE}
DEMO-X;ONLINE;ENTREGUE;100,00;2026-10-30;Comissão do iFood;abc;100,00;12,00;2026-10-29;2026-11-04;REPASSE-W1;true
`
    const badDesc = `${CSV_HEADER_LINE}
DEMO-X;ONLINE;ENTREGUE;100,00;2026-10-30;Taxa inventada;-12,00;100,00;12,00;2026-10-29;2026-11-04;REPASSE-W1;true
`
    const badDate = `${CSV_HEADER_LINE}
DEMO-X;ONLINE;ENTREGUE;100,00;30/10/2026;Comissão do iFood;-12,00;100,00;12,00;2026-10-29;2026-11-04;REPASSE-W1;true
`

    for (const text of [badValue, badDesc, badDate]) {
      const result = parseAndValidateRelatorioCsv(text)
      assert.equal(result.ok, false)
      if (!result.ok) assert.ok(result.errors.length >= 1)
    }
  })

  it('sample anomaly CSV adds cobranca_duplicada on DEMO-CSV-DUP', () => {
    const sample = readFileSync(
      resolve(process.cwd(), 'samples/relatorio-com-anomalia.csv'),
      'utf8',
    )
    const validated = parseAndValidateRelatorioCsv(sample)
    assert.equal(validated.ok, true)
    if (!validated.ok) return

    assert.ok(validated.weeks.includes('REPASSE-W1'))
    assert.ok(validated.pedidos.some((p) => p.pedido_id_ifood === 'DEMO-CSV-DUP'))

    const fixture = buildSeedFixture(TODAY)
    const before = analyzeRepasse(fixture)
    assert.equal(before.divergencias.length, 5)
    assert.equal(before.perdido_total, '207.50')

    const merged = mergeCsvIntoSnapshot(fixture, validated)
    const after = analyzeRepasse(merged)
    assert.equal(after.divergencias.length, 6)
    assert.equal(after.perdido_total, '219.50')

    const neu = after.divergencias.find((d) => d.pedido_id_ifood === 'DEMO-CSV-DUP')
    assert.ok(neu)
    assert.equal(neu!.tipo, 'cobranca_duplicada')
    assert.equal(neu!.diferenca, '12.00')
  })
})
