/**
 * Eval harness: 30 fixed questions through the T4 agent loop.
 * Usage:
 *   EVAL_MOCK=1 npm run eval
 *   OPENROUTER_API_KEY=... npm run eval
 */
import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRestaurantData } from '../src/agent/db.ts'
import { todayInSaoPaulo } from '../src/agent/dates.ts'
import {
  DEFAULT_LLM_MODEL,
  createOpenRouterClient,
  isLlmFailureResposta,
} from '../src/agent/openrouter.ts'
import { runAgentSession } from '../src/agent/run.ts'
import type { AgentResponse, LlmClient } from '../src/agent/types.ts'
import { gradeAnswer } from './grade.ts'
import { createEvalMockLlm } from './mockLlm.ts'
import type { EvalQuestion, QuestionResult } from './types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile(resolve(ROOT, '.env'))
loadEnvFile(resolve(ROOT, '.env.example'))

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function isoDate(): string {
  return new Date().toISOString()
}

function updateReadme(sectionBody: string): void {
  const readmePath = resolve(ROOT, 'README.md')
  const readme = readFileSync(readmePath, 'utf8')
  const start = '<!-- EVAL:START -->'
  const end = '<!-- EVAL:END -->'
  if (!readme.includes(start) || !readme.includes(end)) {
    throw new Error('README.md missing <!-- EVAL:START --> / <!-- EVAL:END --> markers')
  }
  const next = readme.replace(
    /<!-- EVAL:START -->[\s\S]*?<!-- EVAL:END -->/,
    `${start}\n${sectionBody.trim()}\n${end}`,
  )
  writeFileSync(readmePath, next)
}

async function signInDemo() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  const email = process.env.DEMO_EMAIL ?? 'demo@confererepasse.app'
  const password = process.env.DEMO_PASSWORD ?? 'demo-repasse-2026'
  if (!url || !anon) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')

  const auth = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await auth.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(error?.message ?? 'demo sign-in failed')

  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return supabase
}

async function main(): Promise<void> {
  const mock = process.env.EVAL_MOCK === '1' || process.env.EVAL_MOCK === 'true'
  const delayMs = Number(process.env.EVAL_DELAY_MS ?? (mock ? '0' : '4000'))
  const model = process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL
  const fallbackModels = process.env.LLM_FALLBACK_MODELS
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''

  if (!mock && !apiKey) {
    console.error('OPENROUTER_API_KEY is required unless EVAL_MOCK=1')
    process.exit(1)
  }

  const questions = JSON.parse(
    readFileSync(resolve(__dirname, 'questions.json'), 'utf8'),
  ) as EvalQuestion[]

  if (questions.length !== 30) {
    throw new Error(`Expected 30 questions, found ${questions.length}`)
  }

  const supabase = await signInDemo()
  const today = todayInSaoPaulo()
  const data = await loadRestaurantData(supabase, today)

  const results: QuestionResult[] = []
  let index = 0

  for (const question of questions) {
    index += 1
    const started = Date.now()
    process.stdout.write(`[${index}/30] ${question.id}… `)

    const llm: LlmClient = mock
      ? createEvalMockLlm()
      : createOpenRouterClient({
          apiKey,
          model,
          fallbackModels,
          sleep,
        })

    let response: AgentResponse | null = null
    let error: string | undefined

    try {
      response = await runAgentSession({
        supabase,
        pergunta: question.pergunta,
        today,
        llm,
        openRouterApiKey: mock ? 'mock' : apiKey,
        llmModel: mock ? 'mock-tool-answerer' : model,
        llmFallbackModels: fallbackModels,
      })
      // Soft-fail LLM errors (clean PT message) → ERROR, not FAIL
      if (!mock && isLlmFailureResposta(response.resposta)) {
        error = response.resposta
        response = null
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    }

    const graded = gradeAnswer({
      question,
      data,
      resposta: response?.resposta ?? '',
      ids_citados: response?.ids_citados,
      tool_calls: response?.tool_calls,
      latency_ms: Date.now() - started,
      error,
    })
    results.push(graded)
    console.log(`${graded.status}${graded.details.length ? ` (${graded.details[0]})` : ''}`)

    if (index < questions.length && delayMs > 0) {
      await sleep(delayMs)
    }
  }

  const answered = results.filter((r) => r.status !== 'ERROR')
  const passes = results.filter((r) => r.status === 'PASS')
  const fails = results.filter((r) => r.status === 'FAIL')
  const errors = results.filter((r) => r.status === 'ERROR')

  const valueAnswered = answered.filter((r) => r.value_ok != null)
  const idAnswered = answered.filter((r) => r.id_ok != null)
  const valueHits = valueAnswered.filter((r) => r.value_ok).length
  const idHits = idAnswered.filter((r) => r.id_ok).length

  const valueAccAnswered = valueAnswered.length
    ? valueHits / valueAnswered.length
    : 0
  const idAccAnswered = idAnswered.length ? idHits / idAnswered.length : 0
  const valueAccAll = valueHits / results.length
  const idAccAll = idHits / results.length

  const summary = {
    generated_at: isoDate(),
    today,
    model: mock ? 'mock-tool-answerer' : model,
    mock,
    totals: {
      questions: results.length,
      pass: passes.length,
      fail: fails.length,
      error: errors.length,
      answered: answered.length,
    },
    accuracy: {
      value_answered: Number(valueAccAnswered.toFixed(4)),
      id_answered: Number(idAccAnswered.toFixed(4)),
      value_all_30: Number(valueAccAll.toFixed(4)),
      id_all_30: Number(idAccAll.toFixed(4)),
      pass_count: passes.length,
    },
    results,
  }

  const outDir = resolve(__dirname, 'results')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'latest.json')
  writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n')

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const readmeBody = [
    '## Eval (T5)',
    '',
    `| | |`,
    `| --- | --- |`,
    `| Model | \`${summary.model}\` |`,
    `| Date (UTC) | ${summary.generated_at} |`,
    `| Pass count | **${passes.length}/30** |`,
    `| Value accuracy (answered) | ${pct(valueAccAnswered)} |`,
    `| ID accuracy (answered) | ${pct(idAccAnswered)} |`,
    `| Value accuracy (all 30) | ${pct(valueAccAll)} |`,
    `| ID accuracy (all 30) | ${pct(idAccAll)} |`,
    `| FAIL / ERROR | ${fails.length} / ${errors.length} |`,
    '',
    mock
      ? '_Run with `EVAL_MOCK=1` (tool-based mock LLM). Re-run with `OPENROUTER_API_KEY` for the live model._'
      : '_Live OpenRouter run._',
  ].join('\n')

  updateReadme(readmeBody)

  console.log('\n=== Eval summary ===')
  console.log(JSON.stringify(summary.accuracy, null, 2))
  console.log(`Wrote ${outPath}`)
  console.log('Updated README.md EVAL section')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
