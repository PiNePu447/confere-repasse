/**
 * HARD RULE C7: agent / rules / edge function must not reference eval/,
 * question texts, or answer-key material.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const FORBIDDEN_ROOTS = [
  resolve(ROOT, 'src/agent'),
  resolve(ROOT, 'src/rules'),
  resolve(ROOT, 'supabase/functions'),
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    // Isolation check itself must not be scanned as production code — tests under
    // src/**/*.test.ts are allowed to mention eval only if they are the checker.
    // We still scan them: production imports would show up in non-test files first.
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) walk(path, out)
    else if (/\.(ts|tsx|js|mjs|json|md)$/.test(name)) out.push(path)
  }
  return out
}

function main(): void {
  const questions = JSON.parse(
    readFileSync(resolve(__dirname, 'questions.json'), 'utf8'),
  ) as Array<{ pergunta: string; id: string }>

  const questionTexts = questions.map((q) => q.pergunta)
  const failures: string[] = []

  for (const root of FORBIDDEN_ROOTS) {
    for (const file of walk(root)) {
      const rel = relative(ROOT, file)
      // Allow documentation-free production code only — skip nothing under these roots
      // except the live tool test shouldn't embed full eval questions (it doesn't).
      const text = readFileSync(file, 'utf8')

      if (/(?:^|[^\w])eval\//.test(text) || /from ['"].*eval\//.test(text) || /import\(.*eval\//.test(text)) {
        // src/agent importing eval is forbidden; mentioning the word "eval" in comments about C7 is also bad if path-like
        if (/eval\/questions|eval\/results|eval\/run|from ['"]\.\.\/eval|from ['"]\.\.\/\.\.\/eval/.test(text)) {
          failures.push(`${rel}: references eval/ path`)
        }
      }

      for (const pergunta of questionTexts) {
        if (pergunta.length >= 24 && text.includes(pergunta)) {
          failures.push(`${rel}: embeds eval question text (${pergunta.slice(0, 40)}…)`)
        }
      }

      // Answer-key smell: hand-coded SEED divergence map inside agent/rules/functions
      if (
        /DEMO-ANOM-001['"]\s*:\s*['"]16[,.]50/.test(text) ||
        /perdido_total['"]\s*:\s*['"]207[,.]50/.test(text)
      ) {
        failures.push(`${rel}: looks like a hard-coded eval answer key`)
      }
    }
  }

  if (failures.length > 0) {
    console.error('C7 isolation check FAILED:')
    for (const f of failures) console.error(` - ${f}`)
    process.exit(1)
  }
  console.log('C7 isolation check OK (no eval/ leakage into agent, rules, or functions).')
}

main()
