import { useAuth } from '../auth/useAuth'
import { AgentChat } from '../components/chat/AgentChat'

export function AppShell() {
  const { user, signOut } = useAuth()

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <header className="flex items-center justify-between gap-4 border-b border-black/8 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold text-[var(--ink)]">
            Restaurante Demo
          </p>
          <p className="truncate text-xs text-[var(--muted)]">{user?.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="shrink-0 rounded-xl border border-black/10 px-3 py-2 text-sm font-medium text-[var(--ink)] transition hover:bg-black/5"
        >
          Sair
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] lg:items-stretch lg:gap-6">
        {/* T7 dashboard slot — intentionally empty for now */}
        <section
          aria-label="Painel de repasse"
          className="flex min-h-[12rem] flex-col justify-center rounded-2xl border border-dashed border-black/15 bg-white/40 px-5 py-8 text-center lg:min-h-0"
        >
          <p className="font-display text-xl font-semibold text-[var(--ink)]">
            Painel de repasse
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
            Espaço reservado para o dashboard (totais por semana e perdas por tipo) no próximo
            ticket.
          </p>
        </section>

        <AgentChat />
      </main>
    </div>
  )
}
