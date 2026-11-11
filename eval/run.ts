/**
 * Eval harness: 30 fixed questions through the T4 agent loop.
 * Usage:
 *   EVAL_MOCK=1 npm run eval
 *   OPENROUTER_API_KEY=... npm run eval
 *   EVAL_ONLY=19-30 OPENROUTER_API_KEY=... npm run eval   # partial run, merges into latest.json
 *   EVAL_ONLY=q05,q12,q19-q22 EVAL_MOCK=1 npm run eval
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
import { selectQuestions } from './selectQuestions.ts'
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

type EvalSummaryFile = {
  generated_at: string
  today: string
  model: string
  mock: boolean
  eval_only?: string | null
  run_dates?: string[]
  llm_calls?: { total: number; average_per_question: number }
  totals: {
    questions: number
    pass: number
    fail: number
    error: number
    answered: number
  }
  accuracy: {
    value_answered: number
    id_answered: number
    value_all_30: number
    id_all_30: number
    pass_count: number
  }
  results: QuestionResult[]
}

function summarizeResults(
  results: QuestionResult[],
  meta: {
    today: string
    model: string
    mock: boolean
    eval_only: string | null
    run_dates: string[]
    generated_at: string
  },
): EvalSummaryFile {
  const answered = results.filter((r) => r.status !== 'ERROR')
  const passes = results.filter((r) => r.status === 'PASS')
  const fails = results.filter((r) => r.status === 'FAIL')
  const errors = results.filter((r) => r.status === 'ERROR')

  const valueAnswered = answered.filter((r) => r.value_ok != null)
  const idAnswered = answered.filter((r) => r.id_ok != null)
  const valueHits = valueAnswered.filter((r) => r.value_ok).length
  const idHits = idAnswered.filter((r) => r.id_ok).length

  const valueAccAnswered = valueAnswered.length ? valueHits / valueAnswered.length : 0
  const idAccAnswered = idAnswered.length ? idHits / idAnswered.length : 0
  const valueAccAll = valueHits / results.length
  const idAccAll = idHits / results.length

  const llmTotal = results.reduce((sum, r) => sum + (r.llm_calls ?? 0), 0)
  const withLlm = results.filter((r) => r.llm_calls != null && r.llm_calls > 0)
  const llmAvg = withLlm.length ? llmTotal / withLlm.length : 0

  return {
    generated_at: meta.generated_at,
    today: meta.today,
    model: meta.model,
    mock: meta.mock,
    eval_only: meta.eval_only,
    run_dates: meta.run_dates,
    llm_calls: {
      total: llmTotal,
      average_per_question: Number(llmAvg.toFixed(3)),
    },
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
}

function mergeResults(
  allQuestions: EvalQuestion[],
  previous: QuestionResult[] | undefined,
  fresh: QuestionResult[],
): QuestionResult[] {
  const byId = new Map<string, QuestionResult>()
  for (const q of allQuestions) {
    const prior = previous?.find((r) => r.id === q.id)
    if (prior) byId.set(q.id, prior)
  }
  for (const r of fresh) byId.set(r.id, r)
  return allQuestions.map((q) => {
    const existing = byId.get(q.id)
    if (existing) return existing
    return {
      id: q.id,
      categoria: q.categoria,
      pergunta: q.pergunta,
      status: 'ERROR' as const,
      value_ok: null,
      id_ok: null,
      details: ['ainda não executada (aguardando merge de EVAL_ONLY)'],
      error: 'not_run',
      latency_ms: 0,
    }
  })
}

async function main(): Promise<void> {
  const mock = process.env.EVAL_MOCK === '1' || process.env.EVAL_MOCK === 'true'
  const delayMs = Number(process.env.EVAL_DELAY_MS ?? (mock ? '0' : '4000'))
  const model = process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL
  const fallbackModels = process.env.LLM_FALLBACK_MODELS
  const apiKey = process.env.OPENROUTER_API_KEY ?? ''
  const evalOnly = process.env.EVAL_ONLY

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

  const { selected, partial, selector } = selectQuestions(questions, evalOnly)
  console.log(
    partial
      ? `EVAL_ONLY=${selector} → ${selected.length} question(s); will merge into latest.json`
      : `Running full set of ${selected.length} questions`,
  )

  const supabase = await signInDemo()
  const today = todayInSaoPaulo()
  const data = await loadRestaurantData(supabase, today)
  const runAt = isoDate()

  const fresh: QuestionResult[] = []
  let index = 0

  for (const question of selected) {
    index += 1
    const started = Date.now()
    process.stdout.write(`[${index}/${selected.length}] ${question.id}… `)

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
    graded.llm_calls = response?.llm_calls
    graded.graded_at = runAt
    fresh.push(graded)
    console.log(
      `${graded.status}${graded.details.length ? ` (${graded.details[0]})` : ''}` +
        (graded.llm_calls != null ? ` [llm_calls=${graded.llm_calls}]` : ''),
    )

    if (index < selected.length && delayMs > 0) {
      await sleep(delayMs)
    }
  }

  const outDir = resolve(__dirname, 'results')
  mkdirSync(outDir, { recursive: true })
  const outPath = resolve(outDir, 'latest.json')

  let previous: EvalSummaryFile | undefined
  if (partial && existsSync(outPath)) {
    try {
      previous = JSON.parse(readFileSync(outPath, 'utf8')) as EvalSummaryFile
    } catch {
      previous = undefined
    }
  }

  const merged = mergeResults(questions, previous?.results, fresh)
  const runDates = [
    ...new Set([...(previous?.run_dates ?? []), ...(previous?.generated_at ? [previous.generated_at] : []), runAt]),
  ].sort()

  const summary = summarizeResults(merged, {
    today,
    model: mock ? 'mock-tool-answerer' : model,
    mock,
    eval_only: selector,
    run_dates: runDates,
    generated_at: runAt,
  })

  writeFileSync(outPath, JSON.stringify(summary, null, 2) + '\n')

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`
  const complete = merged.every((r) => r.error !== 'not_run')
  const readmeBody = [
    '## Eval (T5)',
    '',
    `| | |`,
    `| --- | --- |`,
    `| Model | \`${summary.model}\` |`,
    `| Date (UTC) | ${summary.generated_at} |`,
    `| Run dates (merged) | ${runDates.join(', ')} |`,
    `| Pass count | **${summary.totals.pass}/30** |`,
    `| Value accuracy (answered) | ${pct(summary.accuracy.value_answered)} |`,
    `| ID accuracy (answered) | ${pct(summary.accuracy.id_answered)} |`,
    `| Value accuracy (all 30) | ${pct(summary.accuracy.value_all_30)} |`,
    `| ID accuracy (all 30) | ${pct(summary.accuracy.id_all_30)} |`,
    `| FAIL / ERROR | ${summary.totals.fail} / ${summary.totals.error} |`,
    `| Avg LLM calls / question | ${summary.llm_calls?.average_per_question ?? '—'} |`,
    '',
    complete
      ? partial
        ? `_Summary from merged per-question results (this run: \`EVAL_ONLY=${selector}\`)._`
        : mock
          ? '_Run with `EVAL_MOCK=1` (tool-based mock LLM). Re-run with `OPENROUTER_API_KEY` for the live model. Partial: `EVAL_ONLY=19-30`._'
          : '_Live OpenRouter run (full 30). Partial slices: `EVAL_ONLY=19-30` merges into `latest.json`._'
      : `_Incomplete merge (${merged.filter((r) => r.error === 'not_run').length} questions not yet run). Use EVAL_ONLY to fill gaps._`,
  ].join('\n')

  updateReadme(readmeBody)

  console.log('\n=== Eval summary ===')
  console.log(JSON.stringify({ ...summary.accuracy, llm_calls: summary.llm_calls }, null, 2))
  console.log(`Wrote ${outPath}`)
  console.log('Updated README.md EVAL section')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
