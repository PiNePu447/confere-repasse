import { supabase } from './supabase'
import type { AgentUiResponse } from './agentTypes.ts'
import { getMockAgentResponse } from './agentMock.ts'

function isDevMockEnabled(): boolean {
  if (!import.meta.env.DEV) return false
  if (import.meta.env.VITE_AGENT_MOCK === '1') return true
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('agentMock')
  )
}

/**
 * Calls the `agente` Edge Function with the signed-in JWT.
 * Mock path is compile-time gated by `import.meta.env.DEV` (stripped in production).
 */
export async function askAgent(pergunta: string): Promise<AgentUiResponse> {
  if (import.meta.env.DEV && isDevMockEnabled()) {
    await new Promise((r) => setTimeout(r, 400))
    return getMockAgentResponse(pergunta)
  }

  const { data, error } = await supabase.functions.invoke<AgentUiResponse>('agente', {
    body: { pergunta },
  })

  if (error) {
    const ctx = error as { context?: Response; message?: string }
    if (ctx.context) {
      try {
        const body = (await ctx.context.json()) as Partial<AgentUiResponse> & {
          erro?: string
        }
        if (typeof body.resposta === 'string' && body.resposta.trim()) {
          return {
            resposta: body.resposta,
            tool_calls: body.tool_calls ?? [],
            ids_citados: body.ids_citados ?? [],
          }
        }
        if (typeof body.erro === 'string' && body.erro.trim()) {
          return { resposta: body.erro, tool_calls: [], ids_citados: [] }
        }
      } catch {
        // fall through
      }
    }
    return {
      resposta:
        error.message ||
        'Falha ao consultar o agente. Tente novamente em instantes.',
      tool_calls: [],
      ids_citados: [],
    }
  }

  if (!data || typeof data.resposta !== 'string') {
    return {
      resposta: 'não sei: a função retornou uma resposta vazia.',
      tool_calls: [],
      ids_citados: [],
    }
  }

  return {
    resposta: data.resposta,
    tool_calls: Array.isArray(data.tool_calls) ? data.tool_calls : [],
    ids_citados: data.ids_citados,
  }
}
