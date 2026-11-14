import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type {
  AppInfo,
  Bookmark,
  DownloadItem,
  HistoryEntry,
  Settings,
  TabsSnapshot,
  UiAction
} from '@shared/types'
import { DEFAULT_SETTINGS, EVENTS } from '@shared/types'
import { BookmarksBar } from './components/BookmarksBar'
import { FindBar } from './components/FindBar'
import { StartPage } from './components/StartPage'
import { TabStrip } from './components/TabStrip'
import { Toolbar } from './components/Toolbar'
import { AboutPanel } from './panels/AboutPanel'
import { BookmarksPanel } from './panels/BookmarksPanel'
import { DownloadsPanel } from './panels/DownloadsPanel'
import { HistoryPanel } from './panels/HistoryPanel'
import { SettingsPanel } from './panels/SettingsPanel'
import { translator } from './i18n'

type Panel = 'settings' | 'bookmarks' | 'history' | 'downloads' | 'about'

interface PrivacyState {
  totalBlocked: number
  ready: boolean
  lastUpdate: number
}

interface FindState {
  open: boolean
  matches: number
  active: number
}

export default function App(): JSX.Element {
  const [snapshot, setSnapshot] = useState<TabsSnapshot | null>(null)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [panel, setPanel] = useState<Panel | null>(null)
  const [find, setFind] = useState<FindState>({ open: false, matches: 0, active: 0 })
  const [privacy, setPrivacy] = useState<PrivacyState>({
    totalBlocked: 0,
    ready: false,
    lastUpdate: 0
  })
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [omniFocusSignal, setOmniFocusSignal] = useState(0)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  const panelRef = useRef<Panel | null>(null)
  const previousActiveRef = useRef<string | null>(null)
  panelRef.current = panel

  const t = useMemo(() => translator(settings.language), [settings.language])

  // Langue du document : lecteurs d'écran, césure et correcteur suivent le réglage.
  useEffect(() => {
    document.documentElement.lang = settings.language
  }, [settings.language])

  const activeTab = snapshot?.tabs.find((tab) => tab.id === snapshot.activeId) ?? null

  // --- Amorçage ------------------------------------------------------------
  useEffect(() => {
    void (async () => {
      const [snap, storedSettings, storedBookmarks, storedDownloads, appInfo, priv, past] =
        await Promise.all([
          window.zuri.tabs.snapshot(),
          window.zuri.settings.get(),
          window.zuri.data.bookmarks(),
          window.zuri.data.downloads(),
          window.zuri.app.info(),
          window.zuri.privacy.state(),
          window.zuri.data.history()
        ])
      setSnapshot(snap)
      setSettings(storedSettings)
      setBookmarks(storedBookmarks)
      setDownloads(storedDownloads)
      setInfo(appInfo)
      setPrivacy(priv)
      setHistory(past)
    })()
  }, [])

  // --- Abonnements --------------------------------------------------------
  useEffect(() => {
    const offs = [
      window.zuri.on<TabsSnapshot>(EVENTS.tabs, setSnapshot),
      window.zuri.on<Settings>(EVENTS.settings, setSettings),
      window.zuri.on<Bookmark[]>(EVENTS.bookmarks, setBookmarks),
      window.zuri.on<HistoryEntry[]>(EVENTS.history, setHistory),
      window.zuri.on<DownloadItem[]>(EVENTS.downloads, setDownloads),
      window.zuri.on<{ matches: number; activeMatch: number }>(EVENTS.findResult, (result) =>
        setFind((current) => ({ ...current, matches: result.matches, active: result.activeMatch }))
      ),
      window.zuri.on<{ tabId: string; count: number; total: number }>(
        EVENTS.blocked,
        (info) => {
          setPrivacy((current) => ({ ...current, totalBlocked: info.total }))
          setSnapshot((current) =>
            current
              ? {
                  ...current,
                  tabs: current.tabs.map((tab) =>
                    tab.id === info.tabId ? { ...tab, blocked: info.count } : tab
                  )
                }
              : current
          )
        }
      )
    ]
    return () => offs.forEach((off) => off())
  }, [])

  // --- Actions venues du menu natif --------------------------------------
  useEffect(() => {
    return window.zuri.on<UiAction>(EVENTS.ui, (action) => {
      switch (action.type) {
        case 'focus-omnibox':
          setPanel(null)
          setOmniFocusSignal((value) => value + 1)
          break
        case 'open-find':
          if (panelRef.current) setPanel(null)
          setFind({ open: true, matches: 0, active: 0 })
          break
        case 'open-panel':
          setPanel(action.panel)
          setFind({ open: false, matches: 0, active: 0 })
          break
        case 'close-panel':
          setPanel(null)
          break
        case 'new-tab':
          void window.zuri.tabs.create(action.url, action.private)
          setPanel(null)
          break
        case 'toggle-bookmarks-bar':
          void window.zuri.settings
            .update({ showBookmarksBar: !settings.showBookmarksBar })
            .then(setSettings)
          break
      }
    })
  }, [settings.showBookmarksBar])

  // --- Thème --------------------------------------------------------------
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])

  const resolvedTheme =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  // --- Visibilité du contenu web -----------------------------------------
  useEffect(() => {
    void window.zuri.tabs.setActiveViewVisible(panel === null)
    if (panel) setFind({ open: false, matches: 0, active: 0 })
  }, [panel])

  useEffect(() => {
    void window.zuri.tabs.setFindBar(find.open)
  }, [find.open])

  // --- Fermer un panneau quand on change d'onglet -------------------------
  useEffect(() => {
    const previous = previousActiveRef.current
    previousActiveRef.current = snapshot?.activeId ?? null
    if (previous && snapshot?.activeId !== previous) setPanel(null)
  }, [snapshot?.activeId])

  // --- Statistiques de confidentialité ------------------------------------
  useEffect(() => {
    const timer = setInterval(() => {
      void window.zuri.privacy.state().then(setPrivacy)
    }, 8000)
    return () => clearInterval(timer)
  }, [])

  // --- Historique frais (suggestions + page d'accueil) -------------------
  useEffect(() => {
    const timer = setTimeout(() => {
      void window.zuri.data.history().then(setHistory)
    }, 600)
    return () => clearTimeout(timer)
  }, [snapshot?.tabs.find((tab) => tab.id === snapshot.activeId)?.url])

  // --- Échap --------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (find.open) {
        setFind({ open: false, matches: 0, active: 0 })
        return
      }
      if (panelRef.current) setPanel(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [find.open])

  // --- Handlers -----------------------------------------------------------
  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = await window.zuri.settings.update(patch)
    setSettings(next)
  }, [])

  const refreshHistory = useCallback(() => {
    void window.zuri.data.history().then(setHistory)
  }, [])

  const handleBookmark = useCallback(
    async (tabUrl: string, tabTitle: string) => {
      const existing = bookmarks.find((item) => item.url === tabUrl)
      if (existing) {
        setBookmarks(await window.zuri.data.removeBookmark(existing.id))
      } else {
        setBookmarks(await window.zuri.data.addBookmark(tabTitle, tabUrl))
      }
    },
    [bookmarks]
  )

  const clearData = useCallback(
    async (scope: 'all' | 'history' | 'cookies') => {
      await window.zuri.tabs.clearBrowsingData(scope)
      if (scope !== 'cookies') refreshHistory()
    },
    [refreshHistory]
  )

  const openUrl = useCallback(
    (url: string) => {
      if (!/^https?:/i.test(url)) {
        void window.zuri.app.openExternal(url)
        return
      }
      setPanel(null)
      if (activeTab) void window.zuri.tabs.navigate(activeTab.id, url)
      else void window.zuri.tabs.create(url)
    },
    [activeTab]
  )

  const closeFind = useCallback(() => {
    setFind({ open: false, matches: 0, active: 0 })
    void window.zuri.tabs.setActiveViewVisible(true)
  }, [])

  if (!snapshot) {
    return (
      <div className="app boot">
        <div className="boot-mark">Z</div>
      </div>
    )
  }

  return (
    <div className="app">
      <TabStrip
        snapshot={snapshot}
        t={t}
        onSelect={(id) => void window.zuri.tabs.select(id)}
        onClose={(id) => void window.zuri.tabs.close(id)}
        onNew={() => void window.zuri.tabs.create()}
        onMute={(id, muted) => void window.zuri.tabs.mute(id, muted)}
        onMinimize={() => window.zuri.window.minimize()}
        onToggleMaximize={() => window.zuri.window.toggleMaximize()}
        onCloseWindow={() => window.zuri.window.close()}
      />

      <Toolbar
        tab={activeTab}
        settings={settings}
        bookmarks={bookmarks}
        history={history}
        t={t}
        focusSignal={omniFocusSignal}
        onNavigate={(input) => {
          if (!activeTab) return
          void window.zuri.tabs.navigate(activeTab.id, input)
        }}
        onBack={() => activeTab && void window.zuri.tabs.back(activeTab.id)}
        onForward={() => activeTab && void window.zuri.tabs.forward(activeTab.id)}
        onReload={() => activeTab && void window.zuri.tabs.reload(activeTab.id)}
        onStop={() => activeTab && void window.zuri.tabs.stop(activeTab.id)}
        onHome={() => {
          if (activeTab) void window.zuri.tabs.navigate(activeTab.id, '')
          else void window.zuri.tabs.create()
        }}
        onToggleBookmark={() =>
          activeTab && handleBookmark(activeTab.url, activeTab.title)
        }
        onOpenPanel={setPanel}
        onOpenMenu={(x, y) => window.zuri.app.openMenu(x, y)}
        onOpenDownloads={() => setPanel('downloads')}
        activeDownloads={downloads.filter((item) => item.state === 'progressing').length}
      />

      {settings.showBookmarksBar && (
        <BookmarksBar bookmarks={bookmarks} t={t} onOpen={openUrl} onOpenAll={setPanel} />
      )}

      <main className="content">
        {activeTab?.isNewTab && !panel && (
          <StartPage
            t={t}
            bookmarks={bookmarks}
            history={history}
            privacy={privacy}
            settings={settings}
            onNavigate={(input) => {
              if (activeTab) void window.zuri.tabs.navigate(activeTab.id, input)
            }}
            onOpen={openUrl}
            onOpenPanel={setPanel}
          />
        )}

        {panel === 'settings' && (
          <SettingsPanel
            settings={settings}
            info={info}
            privacy={privacy}
            t={t}
            onChange={updateSettings}
            onClear={clearData}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'history' && (
          <HistoryPanel
            entries={history}
            t={t}
            onOpen={openUrl}
            onRemove={async (url) => setHistory(await window.zuri.data.removeHistory(url))}
            onClear={async () => setHistory(await window.zuri.data.clearHistory())}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'bookmarks' && (
          <BookmarksPanel
            bookmarks={bookmarks}
            t={t}
            onOpen={openUrl}
            onRemove={async (id) => setBookmarks(await window.zuri.data.removeBookmark(id))}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'downloads' && (
          <DownloadsPanel
            downloads={downloads}
            t={t}
            onPause={(id) => void window.zuri.data.pauseDownload(id)}
            onResume={(id) => void window.zuri.data.resumeDownload(id)}
            onCancel={(id) => void window.zuri.data.cancelDownload(id)}
            onOpen={(id) => void window.zuri.data.openDownload(id)}
            onShow={(id) => void window.zuri.data.showDownload(id)}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'about' && (
          <AboutPanel info={info} privacy={privacy} settings={settings} t={t} onClose={() => setPanel(null)} />
        )}

        {find.open && (
          <FindBar
            t={t}
            matches={find.matches}
            active={find.active}
            onFind={(text, findNext) => {
              if (!activeTab) return
              void window.zuri.tabs.find(activeTab.id, text, true, findNext)
            }}
            onClose={closeFind}
          />
        )}
      </main>
    </div>
  )
}
