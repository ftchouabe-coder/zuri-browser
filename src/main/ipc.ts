import { BrowserWindow, app, ipcMain, shell } from 'electron'
import type { AppInfo, Settings, TabsSnapshot, UiAction } from '@shared/types'
import { EVENTS } from '@shared/types'
import { addBookmark, listBookmarks, removeBookmark } from './bookmarks'
import {
  cancelDownload,
  listDownloads,
  openDownload,
  pauseDownload,
  resumeDownload,
  setDownloadNotifier,
  showDownload
} from './downloads'
import { clearHistory, listHistory, removeHistory } from './history'
import { popupAppMenu } from './menu'
import { applyDnsSetting, privacyShield } from './privacy'
import { resolveInput } from './search'
import { getSettings, updateSettings } from './settings'
import type { TabManager } from './tabs'

export interface AppContext {
  window: BrowserWindow
  tabs: TabManager
  clearData: (scope: 'all' | 'history' | 'cookies') => Promise<void>
}

let ctx: AppContext | null = null

function context(): AppContext {
  if (!ctx) throw new Error('Contexte applicatif non initialisé')
  return ctx
}

function broadcast(channel: string, payload: unknown): void {
  const { window } = context()
  if (!window.isDestroyed()) window.webContents.send(channel, payload)
}

export function setAppContext(next: AppContext): void {
  ctx = next
  setDownloadNotifier((items) => broadcast(EVENTS.downloads, items))
}

export function sendUi(action: UiAction): void {
  broadcast(EVENTS.ui, action)
}

export function registerIpc(): void {
  // --- Onglets -------------------------------------------------------------
  ipcMain.handle('zuri:tabs:snapshot', (): TabsSnapshot => context().tabs.snapshot())
  ipcMain.handle('zuri:tabs:create', (_event, url?: string, isPrivate?: boolean) => {
    context().tabs.create(url, Boolean(isPrivate))
  })
  ipcMain.handle('zuri:tabs:close', (_event, id: string) => context().tabs.close(id))
  ipcMain.handle('zuri:tabs:select', (_event, id: string) => context().tabs.selectTab(id))
  ipcMain.handle('zuri:tabs:navigate', (_event, id: string, input: string) =>
    context().tabs.navigate(id, input)
  )
  ipcMain.handle('zuri:tabs:back', (_event, id: string) => context().tabs.back(id))
  ipcMain.handle('zuri:tabs:forward', (_event, id: string) => context().tabs.forward(id))
  ipcMain.handle('zuri:tabs:reload', (_event, id: string, ignoreCache?: boolean) =>
    context().tabs.reload(id, Boolean(ignoreCache))
  )
  ipcMain.handle('zuri:tabs:stop', (_event, id: string) => context().tabs.stop(id))
  ipcMain.handle('zuri:tabs:mute', (_event, id: string, muted: boolean) =>
    context().tabs.mute(id, muted)
  )
  ipcMain.handle('zuri:tabs:duplicate', (_event, id: string) => context().tabs.duplicate(id))
  ipcMain.handle('zuri:tabs:zoom', (_event, id: string, delta: number) =>
    context().tabs.zoomBy(id, delta)
  )
  ipcMain.handle('zuri:tabs:reset-zoom', (_event, id: string) => context().tabs.resetZoom(id))
  ipcMain.handle(
    'zuri:tabs:find',
    (_event, id: string, text: string, forward: boolean, findNext: boolean) =>
      context().tabs.find(id, text, forward, findNext)
  )
  ipcMain.handle('zuri:tabs:stop-find', (_event, id: string) => context().tabs.stopFind(id))
  ipcMain.handle('zuri:tabs:print', (_event, id: string) => context().tabs.print(id))
  ipcMain.handle('zuri:tabs:devtools', (_event, id: string) => context().tabs.openDevTools(id))
  ipcMain.handle('zuri:tabs:visible', (_event, visible: boolean) => {
    context().tabs.setPanelOpen(!visible)
    if (visible) context().tabs.focusActive()
  })
  ipcMain.handle('zuri:tabs:find-bar', (_event, open: boolean) => {
    context().tabs.setFindBar(Boolean(open))
  })

  // --- Fenêtre -------------------------------------------------------------
  ipcMain.on('zuri:window:minimize', () => context().window.minimize())
  ipcMain.on('zuri:window:toggle-maximize', () => {
    const win = context().window
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('zuri:window:close', () => context().window.close())
  ipcMain.handle('zuri:window:state', () => context().window.isMaximized())
  ipcMain.on('zuri:menu:open', (_event, x: number, y: number) => {
    const { window, tabs } = context()
    popupAppMenu(
      {
        window,
        tabs,
        sendUi,
        clearBrowsingData: () => sendUi({ type: 'open-panel', panel: 'settings' })
      },
      x,
      y
    )
  })

  // --- Favoris -------------------------------------------------------------
  ipcMain.handle('zuri:bookmarks:list', () => listBookmarks())
  ipcMain.handle('zuri:bookmarks:add', (_event, title: string, url: string) => {
    const bookmarks = addBookmark(title, url)
    broadcast(EVENTS.bookmarks, bookmarks)
    return bookmarks
  })
  ipcMain.handle('zuri:bookmarks:remove', (_event, id: string) => {
    const bookmarks = removeBookmark(id)
    broadcast(EVENTS.bookmarks, bookmarks)
    return bookmarks
  })

  // --- Historique ----------------------------------------------------------
  ipcMain.handle('zuri:history:list', () => listHistory())
  ipcMain.handle('zuri:history:remove', (_event, url: string) => {
    const entries = removeHistory(url)
    broadcast(EVENTS.history, entries)
    return entries
  })
  ipcMain.handle('zuri:history:clear', () => {
    const entries = clearHistory()
    broadcast(EVENTS.history, entries)
    return entries
  })

  // --- Téléchargements -----------------------------------------------------
  ipcMain.handle('zuri:downloads:list', () => listDownloads())
  ipcMain.handle('zuri:downloads:pause', (_event, id: string) => pauseDownload(id))
  ipcMain.handle('zuri:downloads:resume', (_event, id: string) => resumeDownload(id))
  ipcMain.handle('zuri:downloads:cancel', (_event, id: string) => cancelDownload(id))
  ipcMain.handle('zuri:downloads:open', (_event, id: string) => openDownload(id))
  ipcMain.handle('zuri:downloads:show', (_event, id: string) => showDownload(id))

  // --- Paramètres ----------------------------------------------------------
  ipcMain.handle('zuri:settings:get', (): Settings => getSettings())
  ipcMain.handle('zuri:settings:update', (_event, patch: Partial<Settings>): Settings => {
    const previous = getSettings()
    const next = updateSettings(patch ?? {})
    if (next.dns !== previous.dns) applyDnsSetting(next)
    broadcast(EVENTS.settings, next)
    const { tabs } = context()
    if (next.showBookmarksBar !== previous.showBookmarksBar) {
      tabs.layout()
      tabs.scheduleEmit()
    }
    return next
  })

  // --- Application ---------------------------------------------------------
  ipcMain.handle('zuri:app:info', (): AppInfo => {
    return {
      name: 'Zuri',
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      platform: process.platform
    }
  })
  ipcMain.handle('zuri:app:open-external', async (_event, url: string) => {
    if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) await shell.openExternal(url)
  })
  ipcMain.handle('zuri:app:search-url', (_event, query: string) =>
    resolveInput(query, getSettings())
  )
  ipcMain.handle(
    'zuri:app:clear-data',
    (_event, scope: 'all' | 'history' | 'cookies') => context().clearData(scope)
  )
  ipcMain.handle('zuri:privacy:state', () => ({
    totalBlocked: privacyShield.totalBlocked,
    ready: privacyShield.ready,
    lastUpdate: privacyShield.lastUpdate
  }))
}
