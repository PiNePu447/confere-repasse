import { useRef, useState, type ChangeEvent } from 'react'
import { CSV_HEADER_LINE } from '../../csv/headers.ts'
import { restoreDemoData, uploadRelatorioCsv } from '../../lib/uploadRelatorio'

type Props = {
  onDataChanged: () => void
}

export function CsvUploadPanel({ onDataChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  async function handleFile(file: File) {
    setBusy(true)
    setMessage(null)
    setErrors([])
    try {
      const text = await file.text()
      const result = await uploadRelatorioCsv(text)
      if (!result.ok) {
        setErrors(result.errors)
        setMessage('Upload rejeitado — nenhum dado foi alterado.')
        return
      }
      setMessage(
        `Arquivo aplicado. Semanas substituídas: ${result.weeks.join(', ')} (${result.lancamentos} lançamentos, ${result.pedidos} pedidos). O painel e o agente usam os novos dados.`,
      )
      onDataChanged()
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Falha no upload.'])
      setMessage('Upload rejeitado — nenhum dado foi alterado.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) void handleFile(file)
  }

  async function onRestore() {
    setBusy(true)
    setMessage(null)
    setErrors([])
    try {
      const result = await restoreDemoData()
      if (!result.ok) {
        setErrors([result.error])
        setMessage('Não foi possível restaurar os dados demo.')
        return
      }
      setMessage('Dados demo restaurados (seed determinístico).')
      onDataChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-t border-black/8 pt-4">
      <h3 className="font-display text-base font-semibold text-[var(--ink)]">
        Enviar Relatório de Conciliação (CSV)
      </h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        O arquivo <span className="font-medium text-[var(--ink)]">substitui todos os lançamentos
        das semanas (<code className="text-[11px]">titulo</code>) presentes no CSV</span>. Pedidos
        citados são criados/atualizados com as colunas do arquivo. Aceita <code>;</code> e números
        no formato BR (<code>-12,00</code>). Arquivo inválido não altera nada.
      </p>
      <p className="mt-2 break-all rounded-lg bg-black/[0.03] px-2 py-1.5 font-mono text-[10px] leading-relaxed text-[var(--muted)]">
        Cabeçalho: {CSV_HEADER_LINE}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center rounded-xl bg-[var(--brand)] px-3 py-2 text-sm font-medium text-white transition hover:bg-[var(--brand-dark)]">
          {busy ? 'Processando…' : 'Escolher CSV'}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={busy}
            onChange={onPick}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRestore()}
          className="rounded-xl border border-black/10 px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:bg-black/5 disabled:opacity-50"
        >
          Restaurar dados demo
        </button>
      </div>

      {message ? (
        <p className="mt-3 text-sm text-[var(--ink)]" role="status">
          {message}
        </p>
      ) : null}
      {errors.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--brand-dark)]">
          {errors.map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
