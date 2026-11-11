import { SUGGESTED_QUESTIONS } from './suggestedQuestions'

type Props = {
  disabled?: boolean
  onPick: (question: string) => void
}

export function SuggestedChips({ disabled, onPick }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUGGESTED_QUESTIONS.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onPick(q)}
          className="rounded-full border border-[var(--brand)]/25 bg-[var(--brand)]/5 px-3 py-1.5 text-left text-xs font-medium text-[var(--brand-dark)] transition hover:bg-[var(--brand)]/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {q}
        </button>
      ))}
    </div>
  )
}
