import { useState } from 'react'

type Props = {
  text: string
}

export function DraftBlock({ text }: Props) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--brand)]/20 bg-[#fff8f6]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--brand)]/15 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-dark)]">
          Rascunho de contestação
        </p>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-dark)]"
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap px-3 py-3 font-sans text-sm leading-relaxed text-[var(--ink)]">
        {text}
      </pre>
      <p className="border-t border-[var(--brand)]/15 px-3 py-2 text-xs text-[var(--muted)]">
        Nada foi enviado. Copie e cole no suporte do iFood.
      </p>
    </div>
  )
}
