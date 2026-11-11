/**
 * Confere Repasse — agent Edge Function.
 * Auth: caller's Supabase JWT (RLS). LLM: OpenRouter.
 *
 * Shared loop: ../../../src/agent (same code as Node `npm run agent:ask`).
 */
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_LLM_MODEL, runAgentSession } from '../../../src/agent/index.ts'
import { todayInSaoPaulo } from '../../../src/agent/dates.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ erro: 'Método não permitido' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ erro: 'JWT ausente. Envie Authorization: Bearer <token>.' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse(
      { erro: 'SUPABASE_URL / SUPABASE_ANON_KEY não configurados na função.' },
      500,
    )
  }

  let pergunta = ''
  try {
    const body = (await req.json()) as { pergunta?: unknown; message?: unknown }
    pergunta = String(body.pergunta ?? body.message ?? '').trim()
  } catch {
    return jsonResponse({ erro: 'JSON inválido. Envie { "pergunta": "..." }.' }, 400)
  }

  if (!pergunta) {
    return jsonResponse({ erro: 'Campo "pergunta" é obrigatório.' }, 400)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return jsonResponse({ erro: 'JWT inválido ou expirado.' }, 401)
  }

  const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY') ?? ''
  const llmModel = Deno.env.get('LLM_MODEL') ?? DEFAULT_LLM_MODEL
  const llmFallbackModels = Deno.env.get('LLM_FALLBACK_MODELS')
  const today = todayInSaoPaulo()

  try {
    const result = await runAgentSession({
      supabase,
      pergunta,
      today,
      openRouterApiKey,
      llmModel,
      llmFallbackModels,
    })
    return jsonResponse(result)
  } catch (err) {
    console.error('[agente] unhandled error', err)
    return jsonResponse(
      {
        resposta: 'Falha ao consultar o modelo de linguagem. Tente novamente em instantes.',
        tool_calls: [],
        ids_citados: [],
      },
      500,
    )
  }
})
