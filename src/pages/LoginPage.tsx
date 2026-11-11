import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { DEMO_CREDENTIALS } from '../lib/demoCredentials'

export function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-[var(--muted)]">
        Carregando…
      </div>
    )
  }

  if (session) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const result = await signIn(email.trim(), password)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    }
  }

  async function handleDemoLogin() {
    setEmail(DEMO_CREDENTIALS.email)
    setPassword(DEMO_CREDENTIALS.password)
    setError(null)
    setSubmitting(true)
    const result = await signIn(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
    }
  }

  function fillDemoCredentials() {
    setEmail(DEMO_CREDENTIALS.email)
    setPassword(DEMO_CREDENTIALS.password)
    setError(null)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgba(234,29,44,0.18),transparent_45%),radial-gradient(ellipse_at_85%_80%,rgba(255,184,0,0.14),transparent_40%),linear-gradient(160deg,#fff8f4_0%,#f3f0ea_50%,#efe8df_100%)]"
      />

      <main className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl font-bold tracking-tight text-[var(--brand)]">
            Confere Repasse
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Conferência de repasse para parceiros iFood — demo com dados fictícios.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-black/5 bg-white/80 p-6 shadow-[0_20px_50px_-30px_rgba(80,20,20,0.45)] backdrop-blur"
        >
          <h1 className="font-display text-xl font-semibold text-[var(--ink)]">Entrar</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Use a conta demo abaixo ou suas próprias credenciais.
          </p>

          <div className="mt-5 space-y-4">
            <label className="block text-sm font-medium text-[var(--ink)]">
              E-mail
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[var(--ink)] outline-none ring-[var(--brand)] transition focus:ring-2"
              />
            </label>

            <label className="block text-sm font-medium text-[var(--ink)]">
              Senha
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[var(--ink)] outline-none ring-[var(--brand)] transition focus:ring-2"
              />
            </label>
          </div>

          {error ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleDemoLogin()}
            className="mt-3 w-full rounded-xl border border-[var(--brand)]/30 bg-[var(--brand)]/5 px-4 py-2.5 text-sm font-semibold text-[var(--brand-dark)] transition hover:bg-[var(--brand)]/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Entrar como demo
          </button>
        </form>

        <aside className="mt-4 rounded-2xl border border-dashed border-[var(--brand)]/35 bg-white/60 p-4 text-sm text-[var(--ink)]">
          <p className="font-semibold text-[var(--brand-dark)]">Credenciais demo</p>
          <dl className="mt-2 space-y-1 font-mono text-xs sm:text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-[var(--muted)]">e-mail:</dt>
              <dd>{DEMO_CREDENTIALS.email}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-[var(--muted)]">senha:</dt>
              <dd>{DEMO_CREDENTIALS.password}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={fillDemoCredentials}
            className="mt-3 text-sm font-medium text-[var(--brand)] underline-offset-2 hover:underline"
          >
            Preencher formulário
          </button>
        </aside>
      </main>
    </div>
  )
}
