import { useRef, useState, type FormEvent } from 'react'
import { askAgent } from '../../lib/askAgent'
import { isContestDraft, type AgentUiResponse } from '../../lib/agentTypes'
import { DraftBlock } from './DraftBlock'
import { IdChips } from './IdChips'
import { SuggestedChips } from './SuggestedChips'

type ChatItem =
  | { role: 'user'; text: string }
  | {
      role: 'assistant'
      response: AgentUiResponse
      kind: 'ok' | 'error'
    }

function looksLikeError(resposta: string): boolean {
  return /^(Falha ao consultar|não sei: a chave|JWT|erro)/i.test(resposta.trim())
}

export function AgentChat() {
  const [input, setInput] = useState('')
  const [items, setItems] = useState<ChatItem[]>([])
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function send(pergunta: string) {
    const text = pergunta.trim()
    if (!text || loading) return

    setInput('')
    setItems((prev) => [...prev, { role: 'user', text }])
    setLoading(true)
    try {
      const response = await askAgent(text)
      const kind: 'ok' | 'error' = looksLikeError(response.resposta) ? 'error' : 'ok'
      setItems((prev) => [...prev, { role: 'assistant', response, kind }])
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Falha ao consultar o agente. Tente novamente em instantes.'
      setItems((prev) => [
        ...prev,
        {
          role: 'assistant',
          kind: 'error',
          response: { resposta: message, tool_calls: [], ids_citados: [] },
        },
      ])
    } finally {
      setLoading(false)
      window.requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void send(input)
  }

  return (
    <section className="flex min-h-[28rem] flex-1 flex-col rounded-2xl border border-black/8 bg-white/85 shadow-[0_18px_40px_-28px_rgba(80,20,20,0.35)] backdrop-blur">
      <header className="border-b border-black/8 px-4 py-3 sm:px-5">
        <h2 className="font-display text-lg font-semibold text-[var(--ink)]">Assistente</h2>
        <p className="text-xs text-[var(--muted)]">
          Pergunte sobre o repasse. Os valores vêm só da função do agente.
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 sm:px-5">
        {items.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">Sugestões:</p>
            <SuggestedChips disabled={loading} onPick={(q) => void send(q)} />
          </div>
        ) : null}

        {items.map((item, index) => {
          if (item.role === 'user') {
            return (
              <div key={`u-${index}`} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--brand)] px-3.5 py-2 text-sm text-white">
                  {item.text}
                </div>
              </div>
            )
          }

          const { response, kind } = item
          const draft = kind === 'ok' && isContestDraft(response)

          return (
            <div key={`a-${index}`} className="flex justify-start">
              <div className="max-w-[95%] space-y-2 sm:max-w-[90%]">
                {kind === 'error' ? (
                  <div
                    role="alert"
                    className="rounded-2xl rounded-bl-md border border-red-200 bg-red-50 px-3.5 py-2 text-sm text-red-800"
                  >
                    {response.resposta}
                  </div>
                ) : draft ? (
                  <DraftBlock text={response.resposta} />
                ) : (
                  <div className="rounded-2xl rounded-bl-md border border-black/8 bg-[#faf7f4] px-3.5 py-2 text-sm leading-relaxed text-[var(--ink)] whitespace-pre-wrap">
                    {response.resposta}
                  </div>
                )}
                {kind === 'ok' ? <IdChips ids={response.ids_citados ?? []} /> : null}
              </div>
            </div>
          )
        })}

        {loading ? (
          <div className="flex justify-start" aria-live="polite">
            <div className="rounded-2xl rounded-bl-md border border-black/8 bg-[#faf7f4] px-3.5 py-2 text-sm text-[var(--muted)]">
              Consultando o agente…
            </div>
          </div>
        ) : null}

        {items.length > 0 && !loading ? (
          <div className="pt-1">
            <SuggestedChips disabled={loading} onPick={(q) => void send(q)} />
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t border-black/8 px-4 py-3 sm:px-5"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder="Pergunte sobre o seu repasse…"
          className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none ring-[var(--brand)] transition focus:ring-2 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Enviar
        </button>
      </form>
    </section>
  )
}
