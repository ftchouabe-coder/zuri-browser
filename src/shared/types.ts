export type ThemeMode = 'light' | 'dark' | 'system'
export type Language = 'fr' | 'en'

export type SearchEngineId =
  | 'duckduckgo'
  | 'google'
  | 'bing'
  | 'brave'
  | 'qwant'
  | 'ecosia'
  | 'startpage'
  | 'mojeek'

export interface SearchEngine {
  id: SearchEngineId
  name: string
  searchUrl: string
  suggestUrl?: string
}

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: 'duckduckgo', name: 'DuckDuckGo', searchUrl: 'https://duckduckgo.com/?q=%s' },
  { id: 'google', name: 'Google', searchUrl: 'https://www.google.com/search?q=%s' },
  { id: 'bing', name: 'Bing', searchUrl: 'https://www.bing.com/search?q=%s' },
  { id: 'brave', name: 'Brave Search', searchUrl: 'https://search.brave.com/search?q=%s' },
  { id: 'qwant', name: 'Qwant', searchUrl: 'https://www.qwant.com/?q=%s' },
  { id: 'ecosia', name: 'Ecosia', searchUrl: 'https://www.ecosia.org/search?q=%s' },
  { id: 'startpage', name: 'Startpage', searchUrl: 'https://www.startpage.com/sp/search?query=%s' },
  { id: 'mojeek', name: 'Mojeek', searchUrl: 'https://www.mojeek.com/search?q=%s' }
]

export type DnsProviderId = 'off' | 'cloudflare' | 'quad9' | 'mullvad' | 'google'

export interface DnsProvider {
  id: DnsProviderId
  name: string
  servers: string[]
}

export const DNS_PROVIDERS: DnsProvider[] = [
  { id: 'off', name: 'DNS du système', servers: [] },
  { id: 'cloudflare', name: 'Cloudflare (1.1.1.1)', servers: ['https://cloudflare-dns.com/dns-query'] },
  { id: 'quad9', name: 'Quad9 (9.9.9.9)', servers: ['https://dns.quad9.net/dns-query'] },
  { id: 'mullvad', name: 'Mullvad', servers: ['https://dns.mullvad.net/dns-query'] },
  { id: 'google', name: 'Google (8.8.8.8)', servers: ['https://dns.google/dns-query'] }
]

export interface Settings {
  theme: ThemeMode
  language: Language
  searchEngine: SearchEngineId
  adblock: boolean
  cosmeticFilters: boolean
  blockThirdPartyCookies: boolean
  httpsOnly: boolean
  dns: DnsProviderId
  stripReferrer: boolean
  dataSaver: boolean
  autoplay: boolean
  clearOnExit: boolean
  showBookmarksBar: boolean
  restoreSession: boolean
  homepage: string
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  language: 'fr',
  searchEngine: 'duckduckgo',
  adblock: true,
  cosmeticFilters: true,
  blockThirdPartyCookies: true,
  httpsOnly: true,
  dns: 'cloudflare',
  stripReferrer: true,
  dataSaver: false,
  autoplay: false,
  clearOnExit: false,
  showBookmarksBar: true,
  restoreSession: true,
  homepage: ''
}

export type TabId = string

export interface TabState {
  id: TabId
  url: string
  title: string
  favicon: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  isPrivate: boolean
  isNewTab: boolean
  blocked: number
  audible: boolean
  muted: boolean
  zoom: number
  crashed: boolean
}

export interface TabsSnapshot {
  tabs: TabState[]
  activeId: TabId | null
  maximized: boolean
  chromeHeight: number
  settings: Settings
}

export interface Bookmark {
  id: string
  title: string
  url: string
  createdAt: number
}

export interface HistoryEntry {
  url: string
  title: string
  visitedAt: number
  visits: number
}

export type DownloadState = 'progressing' | 'completed' | 'cancelled' | 'interrupted'

export interface DownloadItem {
  id: string
  filename: string
  url: string
  state: DownloadState
  received: number
  total: number
  savePath: string
  startedAt: number
  paused: boolean
  isPrivate: boolean
}

export interface FindResult {
  matches: number
  activeMatch: number
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  platform: string
}

export interface NavHistoryEntry {
  canGoBack: boolean
  canGoForward: boolean
  url: string
}

export interface BlockedInfo {
  tabId: TabId
  count: number
  total: number
}

/** Canaux IPC main -> renderer */
export const EVENTS = {
  tabs: 'zuri:tabs',
  downloads: 'zuri:downloads',
  settings: 'zuri:settings',
  blocked: 'zuri:blocked',
  findResult: 'zuri:find-result',
  ui: 'zuri:ui',
  bookmarks: 'zuri:bookmarks',
  history: 'zuri:history',
  downloadsUpdated: 'zuri:downloads-updated',
  maximize: 'zuri:maximize',
  toast: 'zuri:toast'
} as const

export type UiAction =
  | { type: 'focus-omnibox' }
  | { type: 'open-find' }
  | { type: 'open-panel'; panel: 'settings' | 'bookmarks' | 'history' | 'downloads' | 'about' }
  | { type: 'close-panel' }
  | { type: 'new-tab'; url?: string; private?: boolean }
  | { type: 'toggle-bookmarks-bar' }

export interface ZuriApi {
  tabs: {
    snapshot(): Promise<TabsSnapshot>
    create(url?: string, isPrivate?: boolean): Promise<void>
    setFindBar(open: boolean): Promise<void>
    close(id: TabId): Promise<void>
    select(id: TabId): Promise<void>
    navigate(id: TabId, input: string): Promise<void>
    back(id: TabId): Promise<void>
    forward(id: TabId): Promise<void>
    reload(id: TabId, ignoreCache?: boolean): Promise<void>
    stop(id: TabId): Promise<void>
    mute(id: TabId, muted: boolean): Promise<void>
    duplicate(id: TabId): Promise<void>
    zoom(id: TabId, delta: number): Promise<void>
    resetZoom(id: TabId): Promise<void>
    find(id: TabId, text: string, forward: boolean, findNext: boolean): Promise<void>
    stopFind(id: TabId): Promise<void>
    print(id: TabId): Promise<void>
    setActiveViewVisible(visible: boolean): Promise<void>
    openDevTools(id: TabId): Promise<void>
    clearBrowsingData(scope: 'all' | 'history' | 'cookies'): Promise<void>
  }
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    state(): Promise<boolean>
  }
  data: {
    bookmarks(): Promise<Bookmark[]>
    addBookmark(title: string, url: string): Promise<Bookmark[]>
    removeBookmark(id: string): Promise<Bookmark[]>
    history(): Promise<HistoryEntry[]>
    removeHistory(url: string): Promise<HistoryEntry[]>
    clearHistory(): Promise<HistoryEntry[]>
    downloads(): Promise<DownloadItem[]>
    pauseDownload(id: string): Promise<void>
    resumeDownload(id: string): Promise<void>
    cancelDownload(id: string): Promise<void>
    openDownload(id: string): Promise<void>
    showDownload(id: string): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
  }
  app: {
    info(): Promise<AppInfo>
    openExternal(url: string): Promise<void>
    searchUrl(query: string): Promise<string>
    openMenu(x: number, y: number): void
  }
  privacy: {
    state(): Promise<{ totalBlocked: number; ready: boolean; lastUpdate: number }>
  }
  on<T = unknown>(event: string, listener: (payload: T) => void): () => void
  platform: string
}

export interface PinnedSuggestion {
  url: string
  title: string
  kind: 'history' | 'bookmark' | 'search'
}
