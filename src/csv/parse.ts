import { CSV_REQUIRED_HEADERS, type CsvHeader } from './headers.ts'

export type RawCsvRow = Record<CsvHeader, string> & { _line: number }

export type ParseCsvSuccess = {
  ok: true
  separator: ';' | ','
  rows: RawCsvRow[]
}

export type ParseCsvFailure = {
  ok: false
  errors: string[]
}

function detectSeparator(headerLine: string): ';' | ',' {
  const semis = (headerLine.match(/;/g) ?? []).length
  const commas = (headerLine.match(/,/g) ?? []).length
  return semis >= commas ? ';' : ','
}

function splitCsvLine(line: string, separator: ';' | ','): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === separator && !inQuotes) {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  out.push(current)
  return out.map((c) => c.trim())
}

function normalizeHeader(value: string): string {
  return value.trim().replace(/^\ufeff/, '').toLowerCase()
}

/**
 * Parse a Relatório de Conciliação CSV into raw string rows.
 * Does not validate values — only structure / header.
 */
export function parseRelatorioCsv(text: string): ParseCsvSuccess | ParseCsvFailure {
  const normalized = text.replace(/^\ufeff/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    return { ok: false, errors: ['Arquivo vazio.'] }
  }

  const separator = detectSeparator(lines[0]!)
  const headerCells = splitCsvLine(lines[0]!, separator).map(normalizeHeader)
  const expected = CSV_REQUIRED_HEADERS.map((h) => h.toLowerCase())

  if (headerCells.length !== expected.length || expected.some((h, i) => headerCells[i] !== h)) {
    return {
      ok: false,
      errors: [
        `Cabeçalho inválido. Esperado (separador ; ou ,): ${CSV_REQUIRED_HEADERS.join(';')}`,
      ],
    }
  }

  if (lines.length < 2) {
    return { ok: false, errors: ['Arquivo sem linhas de dados.'] }
  }

  const rows: RawCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!, separator)
    if (cells.length !== expected.length) {
      return {
        ok: false,
        errors: [
          `Linha ${i + 1}: esperado ${expected.length} colunas, encontrado ${cells.length}.`,
        ],
      }
    }
    const row = { _line: i + 1 } as RawCsvRow
    for (let c = 0; c < expected.length; c++) {
      row[CSV_REQUIRED_HEADERS[c]!] = cells[c] ?? ''
    }
    rows.push(row)
  }

  return { ok: true, separator, rows }
}
