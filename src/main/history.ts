import type { HistoryEntry } from '@shared/types'
import { JsonStore } from './store'

const MAX_ENTRIES = 5000

function normalizeHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .filter((item) => typeof item.url === 'string' && /^https?:/i.test(item.url))
    .slice(0, MAX_ENTRIES)
    .map((item) => ({
      url: item.url as string,
      title: typeof item.title === 'string' ? item.title.slice(0, 500) : (item.url as string),
      visitedAt: typeof item.visitedAt === 'number' ? item.visitedAt : 0,
      visits: typeof item.visits === 'number' && item.visits > 0 ? Math.floor(item.visits) : 1
    }))
}

// Historique chiffré au repos (safeStorage / DPAPI).
const store = new JsonStore<HistoryEntry[]>('history.json', [], {
  encrypted: true,
  normalize: normalizeHistory
})

function persist(entries: HistoryEntry[]): void {
  store.set(entries.slice(0, MAX_ENTRIES))
}

export function listHistory(limit = 500): HistoryEntry[] {
  return store
    .get()
    .slice()
    .sort((a, b) => b.visitedAt - a.visitedAt)
    .slice(0, limit)
}

export function searchHistory(query: string, limit = 8): HistoryEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  return store
    .get()
    .filter(
      (entry) =>
        entry.url.toLowerCase().includes(needle) || entry.title.toLowerCase().includes(needle)
    )
    .sort((a, b) => b.visits - a.visits || b.visitedAt - a.visitedAt)
    .slice(0, limit)
}

export function recordVisit(url: string, title: string): void {
  if (!/^https?:/i.test(url)) return
  const entries = store.get()
  const index = entries.findIndex((entry) => entry.url === url)
  if (index >= 0) {
    const current = entries[index]
    entries[index] = {
      ...current,
      title: title || current.title,
      visitedAt: Date.now(),
      visits: current.visits + 1
    }
  } else {
    entries.unshift({
      url,
      title: title || url,
      visitedAt: Date.now(),
      visits: 1
    })
  }
  persist(entries)
}

/** Met à jour le titre d'une entrée existante sans compter de nouvelle visite. */
export function updateTitle(url: string, title: string): void {
  if (!title) return
  const entries = store.get()
  const index = entries.findIndex((entry) => entry.url === url)
  if (index < 0 || entries[index].title === title) return
  entries[index] = { ...entries[index], title: title.slice(0, 500) }
  persist(entries)
}

export function removeHistory(url: string): HistoryEntry[] {
  persist(store.get().filter((entry) => entry.url !== url))
  return listHistory()
}

export function clearHistory(): HistoryEntry[] {
  persist([])
  return []
}

export function topSites(limit = 8): HistoryEntry[] {
  const entries = store.get()
  return [...entries].sort((a, b) => b.visits - a.visits || b.visitedAt - a.visitedAt).slice(0, limit)
}

export function flushHistory(): void {
  store.flushNow()
}

/** Historique d'une sauvegarde, fusionné : à URL égale, la visite la plus récente gagne. */
export function importHistory(items: { url: string; title: string; time: number }[]): number {
  const byUrl = new Map(store.get().map((entry) => [entry.url, entry]))
  let added = 0
  for (const item of items) {
    if (!/^https?:\/\//i.test(item.url)) continue
    const known = byUrl.get(item.url)
    if (!known) {
      byUrl.set(item.url, { url: item.url, title: item.title || item.url, visitedAt: item.time, visits: 1 })
      added++
    } else if (item.time > known.visitedAt) {
      byUrl.set(item.url, { ...known, title: item.title || known.title, visitedAt: item.time })
    }
  }
  persist([...byUrl.values()].sort((a, b) => b.visitedAt - a.visitedAt))
  return added
}
