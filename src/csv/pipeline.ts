import { parseRelatorioCsv } from './parse.ts'
import { validateRelatorioRows, type ValidateCsvSuccess } from './validate.ts'

export type PipelineFailure = { ok: false; errors: string[] }

/**
 * Single entry: parse + validate. On any error, returns errors and no rows.
 */
export function parseAndValidateRelatorioCsv(
  text: string,
): ValidateCsvSuccess | PipelineFailure {
  const parsed = parseRelatorioCsv(text)
  if (!parsed.ok) return parsed
  return validateRelatorioRows(parsed.rows)
}
