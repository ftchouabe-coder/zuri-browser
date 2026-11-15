import {
  BrowserWindow,
  app,
  ipcMain,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
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
import { isHttpUrl, resolveInput } from './search'
import { getSettings, updateSettings } from './settings'
import type { TabManager } from './tabs'
import { savingsThisMonth } from './savings'

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

// --- Contrôle de l'appelant ---------------------------------------------------

/**
 * Seul le cadre principal de la fenêtre d'interface peut appeler l'API.
 * Les onglets n'ont pas de preload, mais ce garde protège aussi contre une XSS
 * dans l'interface chargée dans un sous-cadre, ou une future régression.
 */
function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  if (!ctx || ctx.window.isDestroyed()) return false
  const ui = ctx.window.webContents
  if (event.sender !== ui) return false
  const frame = event.senderFrame
  return Boolean(frame) && frame === ui.mainFrame
}

class IpcValidationError extends Error {}

function rejectUntrusted(channel: string, event: IpcMainEvent | IpcMainInvokeEvent): void {
  console.warn(`[ipc] appel refusé sur ${channel} depuis ${event.senderFrame?.url ?? 'inconnu'}`)
}

function handle<A extends unknown[]>(
  channel: string,
  listener: (...args: A) => unknown,
  parse: (args: unknown[]) => A
): void {
  ipcMain.handle(channel, (event, ...raw) => {
    if (!isTrustedSender(event)) {
      rejectUntrusted(channel, event)
      throw new Error('Appel IPC non autorisé')
    }
    return listener(...parse(raw))
  })
}

function on<A extends unknown[]>(
  channel: string,
  listener: (...args: A) => void,
  parse: (args: unknown[]) => A
): void {
  ipcMain.on(channel, (event, ...raw) => {
    if (!isTrustedSender(event)) {
      rejectUntrusted(channel, event)
      return
    }
    try {
      listener(...parse(raw))
    } catch (error) {
      console.warn(`[ipc] ${channel} :`, error instanceof Error ? error.message : error)
    }
  })
}

// --- Validation des arguments -------------------------------------------------

function str(value: unknown, max: number, name: string): string {
  if (typeof value !== 'string' || value.length > max) {
    throw new IpcValidationError(`Argument ${name} invalide`)
  }
  return value
}

function optStr(value: unknown, max: number, name: string): string | undefined {
  return value === undefined || value === null ? undefined : str(value, max, name)
}

function bool(value: unknown): boolean {
  return value === true
}

function num(value: unknown, min: number, max: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new IpcValidationError(`Argument ${name} invalide`)
  }
  return Math.min(max, Math.max(min, value))
}

function httpUrl(value: unknown, name: string): string {
  const url = str(value, MAX_URL, name)
  if (!isHttpUrl(url)) throw new IpcValidationError(`Argument ${name} : URL http(s) attendue`)
  return url
}

function plainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new IpcValidationError('Objet attendu')
  }
  return value as Record<string, unknown>
}

const MAX_ID = 64
const MAX_URL = 8192
const MAX_TEXT = 2048
const CLEAR_SCOPES = new Set(['all', 'history', 'cookies'])

/** Construit un tuple typé (les littéraux de tableau seraient inférés en tableaux). */
const tuple = <T extends unknown[]>(...items: T): T => items
const none = (): [] => []
const id = (args: unknown[]): [string] => [str(args[0], MAX_ID, 'id')]

export function registerIpc(): void {
  // --- Onglets -------------------------------------------------------------
  handle('zuri:tabs:snapshot', (): TabsSnapshot => context().tabs.snapshot(), none)
  handle(
    'zuri:tabs:create',
    (url: string | undefined, isPrivate: boolean) => {
      context().tabs.create(url, isPrivate, { source: 'user' })
    },
    (args) => tuple(optStr(args[0], MAX_URL, 'url'), bool(args[1]))
  )
  handle('zuri:tabs:close', (tabId: string) => context().tabs.close(tabId), id)
  handle('zuri:tabs:select', (tabId: string) => context().tabs.selectTab(tabId), id)
  handle(
    'zuri:tabs:navigate',
    (tabId: string, input: string) => context().tabs.navigate(tabId, input, 'user'),
    (args) => tuple(str(args[0], MAX_ID, 'id'), str(args[1], MAX_URL, 'input'))
  )
  handle('zuri:tabs:back', (tabId: string) => context().tabs.back(tabId), id)
  handle('zuri:tabs:forward', (tabId: string) => context().tabs.forward(tabId), id)
  handle(
    'zuri:tabs:reload',
    (tabId: string, ignoreCache: boolean) => context().tabs.reload(tabId, ignoreCache),
    (args) => tuple(str(args[0], MAX_ID, 'id'), bool(args[1]))
  )
  handle('zuri:tabs:stop', (tabId: string) => context().tabs.stop(tabId), id)
  handle(
    'zuri:tabs:mute',
    (tabId: string, muted: boolean) => context().tabs.mute(tabId, muted),
    (args) => tuple(str(args[0], MAX_ID, 'id'), bool(args[1]))
  )
  handle('zuri:tabs:duplicate', (tabId: string) => context().tabs.duplicate(tabId), id)
  handle(
    'zuri:tabs:zoom',
    (tabId: string, delta: number) => context().tabs.zoomBy(tabId, delta),
    (args) => tuple(str(args[0], MAX_ID, 'id'), num(args[1], -2, 2, 'delta'))
  )
  handle('zuri:tabs:reset-zoom', (tabId: string) => context().tabs.resetZoom(tabId), id)
  handle(
    'zuri:tabs:find',
    (tabId: string, text: string, forward: boolean, findNext: boolean) =>
      context().tabs.find(tabId, text, forward, findNext),
    (args) => tuple(str(args[0], MAX_ID, 'id'), str(args[1], MAX_TEXT, 'text'), bool(args[2]), bool(args[3]))
  )
  handle('zuri:tabs:stop-find', (tabId: string) => context().tabs.stopFind(tabId), id)
  handle('zuri:tabs:print', (tabId: string) => context().tabs.print(tabId), id)
  handle('zuri:tabs:devtools', (tabId: string) => context().tabs.openDevTools(tabId), id)
  handle(
    'zuri:tabs:visible',
    (visible: boolean) => {
      context().tabs.setPanelOpen(!visible)
      if (visible) context().tabs.focusActive()
    },
    (args) => tuple(bool(args[0]))
  )
  handle(
    'zuri:tabs:find-bar',
    (open: boolean) => context().tabs.setFindBar(open),
    (args) => tuple(bool(args[0]))
  )

  // --- Fenêtre -------------------------------------------------------------
  on('zuri:window:minimize', () => context().window.minimize(), none)
  on(
    'zuri:window:toggle-maximize',
    () => {
      const win = context().window
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    },
    none
  )
  on('zuri:window:close', () => context().window.close(), none)
  handle('zuri:window:state', () => context().window.isMaximized(), none)
  on(
    'zuri:menu:open',
    (x: number, y: number) => {
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
    },
    (args) => tuple(num(args[0], 0, 100_000, 'x'), num(args[1], 0, 100_000, 'y'))
  )

  // --- Favoris -------------------------------------------------------------
  handle('zuri:bookmarks:list', () => listBookmarks(), none)
  handle(
    'zuri:bookmarks:add',
    (title: string, url: string) => {
      const bookmarks = addBookmark(title, url)
      broadcast(EVENTS.bookmarks, bookmarks)
      return bookmarks
    },
    (args) => tuple(str(args[0] ?? '', MAX_TEXT, 'title').slice(0, 200), httpUrl(args[1], 'url'))
  )
  handle(
    'zuri:bookmarks:remove',
    (bookmarkId: string) => {
      const bookmarks = removeBookmark(bookmarkId)
      broadcast(EVENTS.bookmarks, bookmarks)
      return bookmarks
    },
    id
  )

  // --- Historique ----------------------------------------------------------
  handle('zuri:history:list', () => listHistory(), none)
  handle(
    'zuri:history:remove',
    (url: string) => {
      const entries = removeHistory(url)
      broadcast(EVENTS.history, entries)
      return entries
    },
    (args) => tuple(str(args[0], MAX_URL, 'url'))
  )
  handle(
    'zuri:history:clear',
    () => {
      const entries = clearHistory()
      broadcast(EVENTS.history, entries)
      return entries
    },
    none
  )

  // --- Téléchargements -----------------------------------------------------
  handle('zuri:downloads:list', () => listDownloads(), none)
  handle('zuri:downloads:pause', (downloadId: string) => pauseDownload(downloadId), id)
  handle('zuri:downloads:resume', (downloadId: string) => resumeDownload(downloadId), id)
  handle('zuri:downloads:cancel', (downloadId: string) => cancelDownload(downloadId), id)
  handle('zuri:downloads:open', (downloadId: string) => openDownload(downloadId), id)
  handle('zuri:downloads:show', (downloadId: string) => showDownload(downloadId), id)

  // --- Paramètres ----------------------------------------------------------
  handle('zuri:settings:get', (): Settings => getSettings(), none)
  handle(
    'zuri:settings:update',
    (patch: Partial<Settings>): Settings => {
      const previous = getSettings()
      const next = updateSettings(patch)
      if (next.dns !== previous.dns) applyDnsSetting(next)
      broadcast(EVENTS.settings, next)
      const { tabs } = context()
      if (next.showBookmarksBar !== previous.showBookmarksBar) {
        tabs.layout()
        tabs.scheduleEmit()
      }
      return next
    },
    // Les champs sont ensuite filtrés un par un par `sanitizeSettings`.
    (args) => tuple(plainObject(args[0] ?? {}) as Partial<Settings>)
  )

  // --- Application ---------------------------------------------------------
  handle(
    'zuri:app:info',
    (): AppInfo => ({
      name: 'Zuri',
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      platform: process.platform
    }),
    none
  )
  handle(
    'zuri:app:open-external',
    async (url: string) => {
      if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) await shell.openExternal(url)
    },
    (args) => tuple(str(args[0], MAX_URL, 'url'))
  )
  handle(
    'zuri:app:search-url',
    (query: string) => resolveInput(query, getSettings()),
    (args) => tuple(str(args[0], MAX_URL, 'query'))
  )
  handle(
    'zuri:app:clear-data',
    (scope: 'all' | 'history' | 'cookies') => context().clearData(scope),
    (args) => {
      if (typeof args[0] !== 'string' || !CLEAR_SCOPES.has(args[0])) {
        throw new IpcValidationError('Portée d’effacement invalide')
      }
      return tuple(args[0] as 'all' | 'history' | 'cookies')
    }
  )
  handle(
    'zuri:privacy:state',
    () => ({
      totalBlocked: privacyShield.totalBlocked,
      savedThisMonth: savingsThisMonth(),
      ready: privacyShield.ready,
      securityReady: privacyShield.securityReady,
      lastUpdate: privacyShield.lastUpdate
    }),
    none
  )
}
