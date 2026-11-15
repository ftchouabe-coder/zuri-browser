import type { Bookmark, HistoryEntry, Settings } from '@shared/types'

/**
 * Contenu JSON d'une sauvegarde, commun au bureau et à Android :
 * `{ format: "zuri-sauvegarde", v: 1, created, bookmarks: [{u,t,d}], history: [{u,t,d}],
 *    offline: [...], settings: {...} }`.
 * Les réglages utilisent les noms Android ; seuls ceux qui existent des deux côtés sont échangés.
 */
export interface BackupItem {
  url: string
  title: string
  time: number
}

export interface ParsedBackup {
  bookmarks: BackupItem[]
  history: BackupItem[]
  offlineCount: number
  settings: Partial<Settings>
}

const MAX_ITEMS = 20_000

export function buildBackup(bookmarks: Bookmark[], history: HistoryEntry[], settings: Settings, now = Date.now()): object {
  return {
    format: 'zuri-sauvegarde',
    v: 1,
    created: now,
    bookmarks: bookmarks.map((b) => ({ u: b.url, t: b.title, d: b.createdAt })),
    history: history.map((h) => ({ u: h.url, t: h.title, d: h.visitedAt })),
    // Le bureau n'a pas de lecture hors ligne : liste vide, ce qui ne supprime rien à l'import.
    offline: [],
    settings: {
      searchEngine: settings.searchEngine,
      adblock: settings.adblock,
      safeBrowsing: settings.safeBrowsing,
      httpsOnly: settings.httpsOnly,
      blockThirdPartyCookies: settings.blockThirdPartyCookies,
      autoplay: settings.autoplay,
      restoreSession: settings.restoreSession,
      hideAdSlots: settings.cosmeticFilters,
      checkUpdates: settings.autoUpdate
    }
  }
}

function items(raw: unknown): BackupItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, MAX_ITEMS)
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .filter((x) => typeof x.u === 'string' && /^https?:\/\//i.test(x.u) && x.u.length <= 8192)
    .map((x) => ({
      url: x.u as string,
      title: typeof x.t === 'string' ? x.t.slice(0, 500) : '',
      time: typeof x.d === 'number' && Number.isFinite(x.d) ? x.d : 0
    }))
}

/** Lit une sauvegarde déchiffrée ; `null` si ce n'est pas un fichier Zuri. */
export function parseBackup(json: unknown): ParsedBackup | null {
  if (!json || typeof json !== 'object') return null
  const root = json as Record<string, unknown>
  if (root.format !== 'zuri-sauvegarde') return null
  const s = (root.settings && typeof root.settings === 'object' ? root.settings : {}) as Record<string, unknown>
  const settings: Partial<Settings> = {}
  const flag = (key: string, target: keyof Settings): void => {
    if (typeof s[key] === 'boolean') (settings as Record<string, unknown>)[target] = s[key]
  }
  if (typeof s.searchEngine === 'string') settings.searchEngine = s.searchEngine as Settings['searchEngine']
  flag('adblock', 'adblock')
  flag('safeBrowsing', 'safeBrowsing')
  flag('httpsOnly', 'httpsOnly')
  flag('blockThirdPartyCookies', 'blockThirdPartyCookies')
  flag('autoplay', 'autoplay')
  flag('restoreSession', 'restoreSession')
  flag('hideAdSlots', 'cosmeticFilters')
  flag('checkUpdates', 'autoUpdate')
  return {
    bookmarks: items(root.bookmarks),
    history: items(root.history),
    offlineCount: Array.isArray(root.offline) ? root.offline.length : 0,
    settings
  }
}
