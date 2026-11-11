import { useAuth } from '../auth/useAuth'
import { AgentChat } from '../components/chat/AgentChat'
import { RepasseDashboard } from '../components/dashboard/RepasseDashboard'

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

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,24rem)] lg:items-start lg:gap-6">
        <RepasseDashboard />
        <div className="lg:sticky lg:top-4 lg:self-start">
          <AgentChat />
        </div>
      </main>
    </div>
  )
}
