/**
 * Node CLI: same agent loop as the Edge Function, against the live project.
 * Usage: npm run agent:ask -- "sua pergunta"
 * Exits non-zero on LLM failure.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_LLM_MODEL,
  isLlmFailureResposta,
  runAgentSession,
} from '../src/agent/index.ts'
import { todayInSaoPaulo } from '../src/agent/dates.ts'

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
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

loadEnvFile(resolve(process.cwd(), '.env'))
loadEnvFile(resolve(process.cwd(), '.env.example'))

const pergunta = process.argv.slice(2).join(' ').trim()
if (!pergunta) {
  console.error('Uso: npm run agent:ask -- "sua pergunta"')
  process.exit(1)
}

const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
const email = process.env.DEMO_EMAIL ?? 'demo@confererepasse.app'
const password = process.env.DEMO_PASSWORD ?? 'demo-repasse-2026'
const openRouterApiKey = process.env.OPENROUTER_API_KEY ?? ''
const llmModel = process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL
const llmFallbackModels = process.env.LLM_FALLBACK_MODELS

if (!url || !anon) {
  console.error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  process.exit(1)
}

if (!openRouterApiKey) {
  console.error('Defina OPENROUTER_API_KEY.')
  process.exit(1)
}

const authClient = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: signIn, error: signInError } = await authClient.auth.signInWithPassword({
  email,
  password,
})

if (signInError || !signIn.session) {
  console.error('Falha no login demo:', signInError?.message ?? 'sem sessão')
  process.exit(1)
}

const supabase = createClient(url, anon, {
  global: { headers: { Authorization: `Bearer ${signIn.session.access_token}` } },
  auth: { persistSession: false, autoRefreshToken: false },
})

const result = await runAgentSession({
  supabase,
  pergunta,
  today: todayInSaoPaulo(),
  openRouterApiKey,
  llmModel,
  llmFallbackModels,
})

console.log(JSON.stringify(result, null, 2))

if (isLlmFailureResposta(result.resposta)) {
  process.exit(1)
}
