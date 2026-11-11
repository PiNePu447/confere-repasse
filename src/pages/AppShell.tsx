import { useAuth } from '../auth/useAuth'

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

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
        <p className="font-display text-2xl font-semibold text-[var(--ink)]">Área autenticada</p>
        <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
          Placeholder para o painel de repasse e o chat do agente (tickets seguintes).
        </p>
      </main>
    </div>
  )
}
