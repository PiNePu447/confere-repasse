/** Collect pedido / lançamento IDs that appear in tool results or the final answer. */

const IFOOD_ID_RE = /\b(?:DEMO-[A-Z0-9-]+|ped-[A-Za-z0-9_-]+|lan-[A-Za-z0-9_-]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi

export function collectIdsFromUnknown(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (value == null) return into
  if (typeof value === 'string') {
    for (const match of value.matchAll(IFOOD_ID_RE)) {
      into.add(match[0])
    }
    return into
  }
  if (typeof value === 'number' || typeof value === 'boolean') return into
  if (Array.isArray(value)) {
    for (const item of value) collectIdsFromUnknown(item, into)
    return into
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (
        key === 'pedido_id_ifood' ||
        key === 'id' ||
        key === 'pedido_id' ||
        key === 'lancamento_id' ||
        key.endsWith('_id') ||
        key === 'lancamento_ids' ||
        key === 'pedido_ids'
      ) {
        collectIdsFromUnknown(nested, into)
      } else {
        collectIdsFromUnknown(nested, into)
      }
    }
  }
  return into
}

export function idsCitedInText(text: string, known: Iterable<string>): string[] {
  const knownSet = new Set(known)
  const cited: string[] = []
  for (const id of knownSet) {
    if (text.includes(id)) cited.push(id)
  }
  // Also pick raw matches in the answer that look like IDs
  for (const match of text.matchAll(IFOOD_ID_RE)) {
    if (!cited.includes(match[0])) cited.push(match[0])
  }
  return cited
}
