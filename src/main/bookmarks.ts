import { randomUUID } from 'node:crypto'
import type { Bookmark } from '@shared/types'
import { JsonStore } from './store'
import { hostOf } from './search'

function normalizeBookmarks(raw: unknown): Bookmark[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Bookmark => !!item && typeof item.url === 'string')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : randomUUID(),
      title: typeof item.title === 'string' && item.title ? item.title : hostOf(item.url),
      url: item.url,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now()
    }))
}

// Favoris chiffrés au repos (safeStorage / DPAPI).
const store = new JsonStore<Bookmark[]>('bookmarks.json', [], {
  encrypted: true,
  normalize: normalizeBookmarks
})

export function listBookmarks(): Bookmark[] {
  return [...store.get()].sort((a, b) => b.createdAt - a.createdAt)
}

export function hasBookmark(url: string): boolean {
  return store.get().some((item) => item.url === url)
}

export function addBookmark(title: string, url: string): Bookmark[] {
  if (!url || url.startsWith('zuri://')) return listBookmarks()
  const existing = store.get()
  const known = existing.find((item) => item.url === url)
  const next = known
    ? existing.map((item) =>
        item.url === url ? { ...item, title: title || item.title, createdAt: Date.now() } : item
      )
    : [
        ...existing,
        {
          id: randomUUID(),
          title: (title || hostOf(url)).slice(0, 200),
          url,
          createdAt: Date.now()
        }
      ]
  store.set(next)
  return listBookmarks()
}

export function removeBookmark(id: string): Bookmark[] {
  store.set(store.get().filter((item) => item.id !== id))
  return listBookmarks()
}

export function removeBookmarkByUrl(url: string): Bookmark[] {
  store.set(store.get().filter((item) => item.url !== url))
  return listBookmarks()
}

export function flushBookmarks(): void {
  store.flushNow()
}

/** Favoris d'une sauvegarde : ajoutés s'ils sont absents, rien n'est supprimé. Renvoie le nombre ajouté. */
export function importBookmarks(items: { url: string; title: string; time: number }[]): number {
  const existing = store.get()
  const known = new Set(existing.map((item) => item.url))
  const added: Bookmark[] = []
  for (const item of items) {
    if (!/^https?:\/\//i.test(item.url) || known.has(item.url)) continue
    known.add(item.url)
    added.push({
      id: randomUUID(),
      title: (item.title || hostOf(item.url)).slice(0, 200),
      url: item.url,
      createdAt: item.time > 0 ? item.time : Date.now()
    })
  }
  if (added.length) store.set([...existing, ...added])
  return added.length
}
