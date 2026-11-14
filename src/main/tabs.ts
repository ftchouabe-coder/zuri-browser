import {
  BrowserWindow,
  Menu,
  WebContentsView,
  clipboard,
  dialog,
  shell,
  type MenuItemConstructorOptions,
  type WebContents
} from 'electron'
import { randomUUID } from 'node:crypto'
import type { BlockedInfo, DownloadItem, TabId, TabState, TabsSnapshot } from '@shared/types'
import { chromeHeightFor } from '@shared/layout'
import { addBookmark } from './bookmarks'
import { recordVisit } from './history'
import { privacyShield } from './privacy'
import { resolveInput } from './search'
import { getSettings } from './settings'
import { getPrivateSession, MAIN_PARTITION, PRIVATE_PARTITION } from './sessions'

interface ZuriTab {
  id: TabId
  view: WebContentsView
  title: string
  url: string
  favicon: string | null
  isPrivate: boolean
  isNewTab: boolean
  loading: boolean
  blocked: number
  muted: boolean
  audible: boolean
  zoom: number
  crashed: boolean
  errorUrl: string | null
}

export interface TabManagerDeps {
  window: BrowserWindow
  emit: (snapshot: TabsSnapshot) => void
  emitBlocked: (info: BlockedInfo) => void
  emitDownloads: (items: DownloadItem[]) => void
}

export class TabManager {
  private tabs = new Map<TabId, ZuriTab>()
  private activeId: TabId | null = null
  private panelOpen = false
  private findOpen = false
  private emitTimer: NodeJS.Timeout | null = null
  private readonly deps: TabManagerDeps
  private readonly wcToTab = new Map<number, TabId>()

  constructor(deps: TabManagerDeps) {
    this.deps = deps
    privacyShield.setBlockedListener((webContentsId, count) => {
      const tabId = this.wcToTab.get(webContentsId)
      if (!tabId) return
      const tab = this.tabs.get(tabId)
      if (!tab) return
      tab.blocked = count
      this.deps.emitBlocked({ tabId, count, total: privacyShield.totalBlocked })
      this.scheduleEmit()
    })
    deps.window.on('resize', () => this.layout())
    deps.window.on('maximize', () => this.scheduleEmit())
    deps.window.on('unmaximize', () => this.scheduleEmit())
    deps.window.on('enter-full-screen', () => this.scheduleEmit())
    deps.window.on('leave-full-screen', () => this.layout())
  }

  get activeTab(): ZuriTab | undefined {
    return this.activeId ? this.tabs.get(this.activeId) : undefined
  }

  get activeTabId(): TabId | null {
    return this.activeId
  }

  list(): ZuriTab[] {
    return [...this.tabs.values()]
  }

  tabByWebContents(id: number): ZuriTab | undefined {
    const tabId = this.wcToTab.get(id)
    return tabId ? this.tabs.get(tabId) : undefined
  }

  create(url?: string, isPrivate = false, options?: { background?: boolean }): ZuriTab {
    const settings = getSettings()
    const id = randomUUID()
    const view = new WebContentsView({
      webPreferences: {
        partition: isPrivate ? PRIVATE_PARTITION : MAIN_PARTITION,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: true,
        autoplayPolicy: settings.autoplay
          ? 'no-user-gesture-required'
          : 'document-user-activation-required'
      }
    })

    const tab: ZuriTab = {
      id,
      view,
      title: '',
      url: '',
      favicon: null,
      isPrivate,
      isNewTab: !url,
      loading: false,
      blocked: 0,
      muted: false,
      audible: false,
      zoom: 0,
      crashed: false,
      errorUrl: null
    }

    this.tabs.set(id, tab)
    this.wcToTab.set(view.webContents.id, id)
    this.deps.window.contentView.addChildView(view)
    view.setVisible(false)
    view.setBackgroundColor('#ffffff')

    this.wire(tab)
    if (url) {
      void this.navigate(id, url)
    }
    if (!options?.background || !this.activeId) this.select(id)
    else this.scheduleEmit()
    return tab
  }

  private wire(tab: ZuriTab): void {
    const contents = tab.view.webContents

    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) this.create(url, tab.isPrivate)
      else if (/^mailto:|^tel:/i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })

    contents.on('will-navigate', (event, url) => {
      if (url.startsWith('file:')) {
        event.preventDefault()
        return
      }
      if (url.startsWith('zuri://')) return
      if (!/^(https?|mailto|tel|about|data):/i.test(url)) event.preventDefault()
    })

    contents.on('page-title-updated', (_event, title) => {
      tab.title = title
      this.scheduleEmit()
      if (/^https?:/i.test(contents.getURL())) recordVisit(contents.getURL(), title)
    })

    contents.on('page-favicon-updated', (_event, favicons) => {
      tab.favicon = favicons[favicons.length - 1] ?? null
      this.scheduleEmit()
    })

    contents.on('did-start-loading', () => {
      tab.loading = true
      tab.crashed = false
      this.scheduleEmit()
    })

    contents.on('did-stop-loading', () => {
      tab.loading = false
      if (!tab.isNewTab) void privacyShield.applyCosmetics(contents, contents.getURL())
      this.scheduleEmit()
    })

    contents.on('did-start-navigation', (_event, url, _isInPlace, isMainFrame) => {
      if (!isMainFrame) return
      tab.url = url
      tab.errorUrl = null
      if (url && !url.startsWith('zuri://')) {
        tab.isNewTab = false
        this.refreshVisibility()
      }
      this.scheduleEmit()
    })

    contents.on('did-navigate', (_event, url) => {
      tab.url = url
      tab.favicon = null
      if (/^https?:/i.test(url)) recordVisit(url, tab.title || url)
      this.scheduleEmit()
    })

    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (!isMainFrame) return
      tab.url = url
      this.scheduleEmit()
    })

    contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      if (validatedURL.startsWith('zuri://')) return
      tab.loading = false
      if (tab.errorUrl === validatedURL) return
      tab.errorUrl = validatedURL
      setTimeout(() => this.showErrorPage(tab, validatedURL, errorCode, errorDescription), 30)
      this.scheduleEmit()
    })

    contents.on('render-process-gone', () => {
      tab.crashed = true
      tab.loading = false
      this.refreshVisibility()
      this.scheduleEmit()
    })

    contents.on('audio-state-changed', (event) => {
      tab.audible = Boolean(event.audible)
      this.scheduleEmit()
    })

    contents.on('found-in-page', (_event, result) => {
      this.deps.window.webContents.send('zuri:find-result', {
        matches: result.matches,
        activeMatch: result.activeMatchOrdinal
      })
    })

    contents.on('context-menu', (_event, params) => this.openContextMenu(tab, params))

    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const ctrl = input.control || input.meta
      if (ctrl && input.shift && input.key.toLowerCase() === 'tab') {
        event.preventDefault()
        this.cycle(-1)
      } else if (ctrl && input.key === 'Tab') {
        event.preventDefault()
        this.cycle(1)
      } else if (input.key === 'Escape' && contents.isCurrentlyAudible()) {
        /* laisser la page gérer Échap */
      }
    })
  }

  private showErrorPage(tab: ZuriTab, url: string, code: number, description: string): void {
    if (tab.view.webContents.isDestroyed()) return
    const params = new URLSearchParams({
      url,
      code: String(code),
      desc: description,
      lang: getSettings().language
    })
    void tab.view.webContents.loadURL(`zuri://error/?${params.toString()}`).catch(() => {})
  }

  private openContextMenu(
    tab: ZuriTab,
    params: Electron.ContextMenuParams
  ): void {
    const items: MenuItemConstructorOptions[] = []
    const contents = tab.view.webContents
    const settings = getSettings()

    if (params.linkURL) {
      items.push(
        {
          label: 'Ouvrir le lien dans un nouvel onglet',
          click: () => this.create(params.linkURL, tab.isPrivate)
        },
        {
          label: "Ouvrir dans une fenêtre privée",
          click: () => this.create(params.linkURL, true)
        },
        { type: 'separator' },
        {
          label: 'Copier l’adresse du lien',
          click: () => clipboard.writeText(params.linkURL)
        },
        {
          label: 'Enregistrer le lien sous…',
          click: () => contents.downloadURL(params.linkURL)
        },
        { type: 'separator' }
      )
    }

    if (params.srcURL && params.mediaType === 'image') {
      items.push(
        {
          label: "Ouvrir l'image dans un nouvel onglet",
          click: () => this.create(params.srcURL, tab.isPrivate)
        },
        {
          label: "Enregistrer l'image sous…",
          click: () => contents.downloadURL(params.srcURL)
        },
        {
          label: "Copier l'adresse de l'image",
          click: () => clipboard.writeText(params.srcURL)
        },
        { type: 'separator' }
      )
    }

    if (params.selectionText) {
      const query = params.selectionText.trim().slice(0, 120)
      items.push(
        { role: 'copy', label: 'Copier' },
        {
          label: `Rechercher « ${query.slice(0, 40)} »`,
          click: () => this.create(resolveInput(query, settings), tab.isPrivate)
        },
        { type: 'separator' }
      )
    }

    if (params.isEditable) {
      items.push(
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
        { type: 'separator' }
      )
    } else if (!params.selectionText) {
      items.push({ role: 'selectAll', label: 'Tout sélectionner' }, { type: 'separator' })
    }

    items.push(
      { label: 'Précédent', enabled: contents.canGoBack(), click: () => contents.navigationHistory.goBack() },
      { label: 'Suivant', enabled: contents.canGoForward(), click: () => contents.navigationHistory.goForward() },
      { label: 'Recharger', click: () => contents.reload() },
      { type: 'separator' },
      {
        label: 'Ajouter aux favoris',
        click: () => this.addCurrentBookmark(tab)
      },
      {
        label: 'Copier l’adresse de la page',
        click: () => clipboard.writeText(contents.getURL())
      },
      { type: 'separator' },
      { label: 'Inspecter', click: () => contents.openDevTools({ mode: 'detach' }) }
    )

    Menu.buildFromTemplate(items).popup({ window: this.deps.window })
  }

  addCurrentBookmark(tab: ZuriTab | undefined = this.activeTab): void {
    if (!tab || !tab.url || !/^https?:/i.test(tab.url)) return
    const bookmarks = addBookmark(tab.title || tab.url, tab.url)
    this.deps.window.webContents.send('zuri:bookmarks', bookmarks)
    this.deps.window.webContents.send('zuri:toast', 'Page ajoutée aux favoris')
  }

  private select(id: TabId): void {
    if (!this.tabs.has(id)) return
    this.activeId = id
    this.refreshVisibility()
    this.layout()
    this.scheduleEmit()
    const tab = this.tabs.get(id)
    if (tab && !tab.isNewTab) tab.view.webContents.focus()
  }

  selectTab(id: TabId): void {
    this.select(id)
  }

  close(id: TabId): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    const order = [...this.tabs.keys()]
    const index = order.indexOf(id)
    this.tabs.delete(id)
    this.wcToTab.delete(tab.view.webContents.id)
    privacyShield.resetFor(tab.view.webContents.id)
    try {
      this.deps.window.contentView.removeChildView(tab.view)
      tab.view.webContents.close()
    } catch {
      /* déjà détruite */
    }
    if (this.activeId === id) {
      const nextId = order[index + 1] ?? order[index - 1] ?? null
      this.activeId = nextId && this.tabs.has(nextId) ? nextId : null
      if (this.activeId) this.select(this.activeId)
    }
    if (!this.tabs.size) {
      this.create(undefined, false)
      return
    }
    if (!order.some((tabId) => this.tabs.get(tabId)?.isPrivate)) {
      void getPrivateSession().clearStorageData()
      privacyShield.clearCounters()
    }
    this.refreshVisibility()
    this.scheduleEmit()
  }

  closeActive(): void {
    if (this.activeId) this.close(this.activeId)
  }

  cycle(direction: 1 | -1): void {
    const ids = [...this.tabs.keys()]
    if (ids.length < 2 || !this.activeId) return
    const index = ids.indexOf(this.activeId)
    const next = ids[(index + direction + ids.length) % ids.length]
    this.select(next)
  }

  async navigate(id: TabId, input: string): Promise<void> {
    const tab = this.tabs.get(id)
    if (!tab) return
    const settings = getSettings()
    const trimmed = input.trim()
    const target = trimmed ? resolveInput(trimmed, settings) : settings.homepage.trim()
    if (!target) {
      tab.isNewTab = true
      tab.url = ''
      tab.title = ''
      tab.favicon = null
      this.refreshVisibility()
      this.scheduleEmit()
      this.deps.window.webContents.send('zuri:ui', { type: 'focus-omnibox' })
      return
    }
    tab.isNewTab = false
    tab.errorUrl = null
    tab.url = target
    this.refreshVisibility()
    this.scheduleEmit()
    try {
      await tab.view.webContents.loadURL(target)
    } catch {
      /* did-fail-load affiche la page d'erreur */
    }
  }

  reload(id: TabId, ignoreCache = false): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    if (tab.isNewTab) {
      this.navigate(id, '')
      return
    }
    if (ignoreCache) tab.view.webContents.reloadIgnoringCache()
    else tab.view.webContents.reload()
  }

  stop(id: TabId): void {
    this.tabs.get(id)?.view.webContents.stop()
  }

  back(id: TabId): void {
    const contents = this.tabs.get(id)?.view.webContents
    if (contents?.navigationHistory.canGoBack()) contents.navigationHistory.goBack()
  }

  forward(id: TabId): void {
    const contents = this.tabs.get(id)?.view.webContents
    if (contents?.navigationHistory.canGoForward()) contents.navigationHistory.goForward()
  }

  duplicate(id: TabId): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    this.create(tab.url || undefined, tab.isPrivate)
  }

  mute(id: TabId, muted: boolean): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.muted = muted
    tab.view.webContents.setAudioMuted(muted)
    this.scheduleEmit()
  }

  zoomBy(id: TabId, delta: number): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.zoom = Math.max(-4, Math.min(6, Number((tab.zoom + delta).toFixed(1))))
    tab.view.webContents.setZoomLevel(tab.zoom)
    this.scheduleEmit()
  }

  resetZoom(id: TabId): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.zoom = 0
    tab.view.webContents.setZoomLevel(0)
    this.scheduleEmit()
  }

  find(id: TabId, text: string, forward: boolean, findNext: boolean): void {
    const contents = this.tabs.get(id)?.view.webContents
    if (!contents) return
    if (!text) {
      contents.stopFindInPage('clearSelection')
      return
    }
    contents.findInPage(text, { forward, findNext })
  }

  stopFind(id: TabId): void {
    this.tabs.get(id)?.view.webContents.stopFindInPage('clearSelection')
  }

  print(id: TabId): void {
    this.tabs.get(id)?.view.webContents.print()
  }

  openDevTools(id: TabId): void {
    this.tabs.get(id)?.view.webContents.openDevTools({ mode: 'detach' })
  }

  setPanelOpen(open: boolean): void {
    this.panelOpen = open
    this.refreshVisibility()
    this.scheduleEmit()
  }

  setFindBar(open: boolean): void {
    this.findOpen = open
    this.layout()
  }

  private refreshVisibility(): void {
    const active = this.activeTab
    for (const tab of this.tabs.values()) {
      const visible = tab === active && !this.panelOpen && !tab.isNewTab && !tab.crashed
      tab.view.setVisible(visible)
    }
    if (active && !active.isNewTab) this.layout()
  }

  layout(): void {
    if (this.deps.window.isDestroyed()) return
    const [width, height] = this.deps.window.getContentSize()
    const settings = getSettings()
    const top = chromeHeightFor(settings.showBookmarksBar)
    const bounds = {
      x: 0,
      y: top,
      width: Math.max(0, width),
      height: Math.max(0, height - top - (this.findOpen ? 72 : 0))
    }
    for (const tab of this.tabs.values()) tab.view.setBounds(bounds)
  }

  focusActive(): void {
    const tab = this.activeTab
    if (tab && !tab.isNewTab) tab.view.webContents.focus()
  }

  serialize(): string[] {
    return [...this.tabs.values()]
      .filter((tab) => !tab.isPrivate && !tab.isNewTab && /^https?:/i.test(tab.url))
      .map((tab) => tab.url)
  }

  snapshot(): TabsSnapshot {
    const settings = getSettings()
    return {
      tabs: [...this.tabs.values()].map((tab) => this.toState(tab)),
      activeId: this.activeId,
      maximized: this.deps.window.isMaximized(),
      chromeHeight: chromeHeightFor(settings.showBookmarksBar),
      settings
    }
  }

  private toState(tab: ZuriTab): TabState {
    const contents = tab.view.webContents
    const url = tab.isNewTab ? '' : contents.getURL() || tab.url
    return {
      id: tab.id,
      url,
      title: tab.title || (url ? url : 'Nouvel onglet'),
      favicon: tab.favicon,
      loading: tab.loading,
      canGoBack: !tab.isNewTab && contents.navigationHistory.canGoBack(),
      canGoForward: !tab.isNewTab && contents.navigationHistory.canGoForward(),
      isPrivate: tab.isPrivate,
      isNewTab: tab.isNewTab,
      blocked: tab.blocked,
      audible: tab.audible,
      muted: tab.muted,
      zoom: tab.zoom,
      crashed: tab.crashed
    }
  }

  scheduleEmit(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      if (this.deps.window.isDestroyed()) return
      this.deps.emit(this.snapshot())
    }, 60)
  }

  async confirmQuitWithPrivateTabs(): Promise<boolean> {
    const hasPrivate = [...this.tabs.values()].some((tab) => tab.isPrivate)
    if (!hasPrivate) return true
    const result = await dialog.showMessageBox(this.deps.window, {
      type: 'question',
      buttons: ['Fermer', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
      title: 'Navigation privée',
      message: 'Fermer Zuri et effacer la session privée ?'
    })
    return result.response === 0
  }

  destroyAll(): void {
    for (const tab of this.tabs.values()) {
      try {
        tab.view.webContents.close()
      } catch {
        /* ignore */
      }
    }
    this.tabs.clear()
    this.wcToTab.clear()
  }

  contentsOf(id: TabId): WebContents | undefined {
    return this.tabs.get(id)?.view.webContents
  }
}
