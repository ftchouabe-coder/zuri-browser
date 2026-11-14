import type { HistoryEntry } from '@shared/types'
import { JsonStore } from './store'

const MAX_ENTRIES = 5000

const store = new JsonStore<HistoryEntry[]>('history.json', [], (raw) => {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is HistoryEntry => !!item && typeof item.url === 'string')
    .slice(0, MAX_ENTRIES)
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
