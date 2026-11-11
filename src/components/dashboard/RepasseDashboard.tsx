import { useEffect, useState } from 'react'
import {
  ORIENTACAO_SEM_PRAZO,
  daysBetween,
  type Divergence,
  type WeekTotal,
} from '../../rules/index.ts'
import { formatReaisBr } from '../../lib/formatReais'
import {
  DIVERGENCE_TYPE_LABELS,
  loadDashboardData,
  type DashboardData,
} from '../../lib/loadDashboardData'
import { CsvUploadPanel } from './CsvUploadPanel'

function Money({ value, className = '' }: { value: string; className?: string }) {
  return <span className={`tabular-nums ${className}`}>{formatReaisBr(value)}</span>
}

function WeekRow({ week }: { week: WeekTotal }) {
  return (
    <div className="grid gap-2 border-t border-black/8 py-3 first:border-t-0 sm:grid-cols-[7.5rem_1fr]">
      <div>
        <p className="font-display text-sm font-semibold text-[var(--ink)]">{week.semana}</p>
        <p className="text-[11px] text-[var(--muted)]">
          {week.data_apuracao_inicio} → {week.data_apuracao_fim}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Vendas brutas</p>
          <p className="text-sm font-medium">
            <Money value={week.vendas_brutas} />
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
            Repassado líquido
          </p>
          <p className="text-sm font-medium">
            <Money value={week.liquido_repassado} />
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
            Esperado líquido
          </p>
          <p className="text-sm font-medium">
            <Money value={week.liquido_esperado} />
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Diferença</p>
          <p className="text-sm font-semibold text-[var(--brand-dark)]">
            <Money value={week.diferenca} />
          </p>
        </div>
      </div>
    </div>
  )
}

function ExpiringList({
  divergencias,
  today,
}: {
  divergencias: Divergence[]
  today: string
}) {
  const open = divergencias.filter(
    (d) => d.tipo === 'cancelamento_debitado' && d.prazo_aberto === true && d.data_limite,
  )

  return (
    <section>
      <h3 className="font-display text-base font-semibold text-[var(--ink)]">
        Prazos que vencem em até 7 dias
      </h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Só cancelamentos debitados com prazo aberto. Outros tipos: {ORIENTACAO_SEM_PRAZO}.
      </p>
      {open.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">Nenhum prazo aberto no momento.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {open.map((d) => {
            const dias = daysBetween(today, d.data_limite!)
            return (
              <li
                key={`${d.pedido_id_ifood}-${d.tipo}`}
                className="flex flex-wrap items-baseline justify-between gap-2 border-t border-black/8 pt-2 text-sm first:border-t-0 first:pt-0"
              >
                <div>
                  <span className="font-medium">{d.pedido_id_ifood}</span>
                  <span className="text-[var(--muted)]"> · cancelamento debitado</span>
                </div>
                <div className="text-[var(--muted)]">
                  limite {d.data_limite} ·{' '}
                  <span className="font-medium text-[var(--brand-dark)]">
                    {dias === 0 ? 'vence hoje' : `${dias} dia${dias === 1 ? '' : 's'} restantes`}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function RepasseDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    void loadDashboardData()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Falha ao carregar o painel.')
        setData(null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  if (loading) {
    return (
      <section
        aria-label="Painel de repasse"
        className="rounded-2xl border border-black/8 bg-white/85 px-5 py-8 text-sm text-[var(--muted)] shadow-[0_18px_40px_-28px_rgba(80,20,20,0.35)]"
      >
        Carregando painel de repasse…
      </section>
    )
  }

  if (error || !data) {
    return (
      <section
        aria-label="Painel de repasse"
        className="rounded-2xl border border-[var(--brand)]/30 bg-white/85 px-5 py-8 text-sm text-[var(--brand-dark)] shadow-[0_18px_40px_-28px_rgba(80,20,20,0.35)]"
      >
        {error ?? 'Não foi possível carregar o painel.'}
      </section>
    )
  }

  const { engine, today } = data
  const typeOrder = Object.keys(DIVERGENCE_TYPE_LABELS) as Array<
    keyof typeof DIVERGENCE_TYPE_LABELS
  >

  return (
    <section
      aria-label="Painel de repasse"
      className="flex min-h-0 flex-col gap-6 overflow-y-auto rounded-2xl border border-black/8 bg-white/85 p-4 shadow-[0_18px_40px_-28px_rgba(80,20,20,0.35)] backdrop-blur sm:p-5"
    >
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand)]">
          Confere Repasse
        </p>
        <h2 className="font-display text-xl font-semibold text-[var(--ink)] sm:text-2xl">
          Painel de repasse
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Valores do motor de regras sobre os dados do restaurante (RLS). Hoje: {today}.
        </p>
      </header>

      <CsvUploadPanel onDataChanged={() => setReloadToken((n) => n + 1)} />

      <div className="rounded-xl bg-[linear-gradient(135deg,#fff7f5,transparent_55%),radial-gradient(circle_at_top_right,rgba(234,29,44,0.12),transparent_45%)] p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Quanto você deixou de receber
        </p>
        <p className="mt-1 font-display text-3xl font-semibold text-[var(--brand-dark)] sm:text-4xl">
          <Money value={engine.perdido_total} />
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Soma das divergências · vendas brutas no período{' '}
          <Money value={engine.totais_gerais.vendas_brutas} className="font-medium text-[var(--ink)]" />
        </p>
      </div>

      <section>
        <h3 className="font-display text-base font-semibold text-[var(--ink)]">
          Repassado vs esperado por semana
        </h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Líquido = vendas brutas − deduções (reais ou esperadas). A diferença é o que faltou
          receber.
        </p>
        <div className="mt-2">
          {engine.totais_por_semana.map((week) => (
            <WeekRow key={week.semana} week={week} />
          ))}
          <div className="grid gap-2 border-t-2 border-[var(--ink)]/15 py-3 sm:grid-cols-[7.5rem_1fr]">
            <p className="font-display text-sm font-semibold">Total</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  Vendas brutas
                </p>
                <p className="text-sm font-semibold">
                  <Money value={engine.totais_gerais.vendas_brutas} />
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  Repassado líquido
                </p>
                <p className="text-sm font-semibold">
                  <Money value={engine.totais_gerais.liquido_repassado} />
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  Esperado líquido
                </p>
                <p className="text-sm font-semibold">
                  <Money value={engine.totais_gerais.liquido_esperado} />
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Diferença</p>
                <p className="text-sm font-semibold text-[var(--brand-dark)]">
                  <Money value={engine.totais_gerais.diferenca} />
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="font-display text-base font-semibold text-[var(--ink)]">
          Divergências por tipo
        </h3>
        <ul className="mt-3 space-y-2">
          {typeOrder.map((tipo) => (
            <li
              key={tipo}
              className="flex items-baseline justify-between gap-3 border-t border-black/8 pt-2 text-sm first:border-t-0 first:pt-0"
            >
              <span>{DIVERGENCE_TYPE_LABELS[tipo]}</span>
              <Money
                value={engine.perdido_por_tipo[tipo]}
                className="font-semibold text-[var(--ink)]"
              />
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-3 border-t-2 border-[var(--ink)]/15 pt-2 text-sm font-semibold">
            <span>Total</span>
            <Money value={engine.perdido_total} className="text-[var(--brand-dark)]" />
          </li>
        </ul>
      </section>

      <ExpiringList divergencias={engine.divergencias} today={today} />

      <section>
        <h3 className="font-display text-base font-semibold text-[var(--ink)]">
          Lista de divergências
        </h3>
        <ul className="mt-3 space-y-3">
          {engine.divergencias.map((d) => (
            <li
              key={`${d.pedido_id_ifood}-${d.tipo}`}
              className="border-t border-black/8 pt-3 text-sm first:border-t-0 first:pt-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p>
                  <span className="font-medium">{d.pedido_id_ifood}</span>
                  <span className="text-[var(--muted)]">
                    {' '}
                    · {DIVERGENCE_TYPE_LABELS[d.tipo]}
                  </span>
                </p>
                <Money value={d.diferenca} className="font-semibold text-[var(--brand-dark)]" />
              </div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {d.tipo === 'cancelamento_debitado'
                  ? d.orientacao
                  : ORIENTACAO_SEM_PRAZO}
                {d.tipo === 'cancelamento_debitado' && d.prazo_aberto === false
                  ? ' (prazo expirado)'
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}
