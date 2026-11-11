type Props = {
  ids: string[]
}

export function IdChips({ ids }: Props) {
  if (ids.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="IDs citados">
      {ids.map((id) => (
        <span
          key={id}
          className="rounded-md bg-black/5 px-2 py-0.5 font-mono text-[11px] text-[var(--muted)]"
        >
          {id}
        </span>
      ))}
    </div>
  )
}
