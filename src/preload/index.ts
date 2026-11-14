import { contextBridge, ipcRenderer } from 'electron'
import { EVENTS, type ZuriApi } from '@shared/types'

const ALLOWED_EVENTS = new Set<string>(Object.values(EVENTS))

const api: ZuriApi = {
  tabs: {
    snapshot: () => ipcRenderer.invoke('zuri:tabs:snapshot'),
    create: (url?: string, isPrivate?: boolean) =>
      ipcRenderer.invoke('zuri:tabs:create', url, isPrivate),
    setFindBar: (open: boolean) => ipcRenderer.invoke('zuri:tabs:find-bar', open),
    close: (id) => ipcRenderer.invoke('zuri:tabs:close', id),
    select: (id) => ipcRenderer.invoke('zuri:tabs:select', id),
    navigate: (id, input) => ipcRenderer.invoke('zuri:tabs:navigate', id, input),
    back: (id) => ipcRenderer.invoke('zuri:tabs:back', id),
    forward: (id) => ipcRenderer.invoke('zuri:tabs:forward', id),
    reload: (id, ignoreCache) => ipcRenderer.invoke('zuri:tabs:reload', id, ignoreCache),
    stop: (id) => ipcRenderer.invoke('zuri:tabs:stop', id),
    mute: (id, muted) => ipcRenderer.invoke('zuri:tabs:mute', id, muted),
    duplicate: (id) => ipcRenderer.invoke('zuri:tabs:duplicate', id),
    zoom: (id, delta) => ipcRenderer.invoke('zuri:tabs:zoom', id, delta),
    resetZoom: (id) => ipcRenderer.invoke('zuri:tabs:reset-zoom', id),
    find: (id, text, forward, findNext) =>
      ipcRenderer.invoke('zuri:tabs:find', id, text, forward, findNext),
    stopFind: (id) => ipcRenderer.invoke('zuri:tabs:stop-find', id),
    print: (id) => ipcRenderer.invoke('zuri:tabs:print', id),
    setActiveViewVisible: (visible: boolean) =>
      ipcRenderer.invoke('zuri:tabs:visible', visible),
    openDevTools: (id) => ipcRenderer.invoke('zuri:tabs:devtools', id),
    clearBrowsingData: (scope) => ipcRenderer.invoke('zuri:app:clear-data', scope)
  },
  window: {
    minimize: () => ipcRenderer.send('zuri:window:minimize'),
    toggleMaximize: () => ipcRenderer.send('zuri:window:toggle-maximize'),
    close: () => ipcRenderer.send('zuri:window:close'),
    state: () => ipcRenderer.invoke('zuri:window:state')
  },
  data: {
    bookmarks: () => ipcRenderer.invoke('zuri:bookmarks:list'),
    addBookmark: (title, url) => ipcRenderer.invoke('zuri:bookmarks:add', title, url),
    removeBookmark: (id) => ipcRenderer.invoke('zuri:bookmarks:remove', id),
    history: () => ipcRenderer.invoke('zuri:history:list'),
    removeHistory: (url) => ipcRenderer.invoke('zuri:history:remove', url),
    clearHistory: () => ipcRenderer.invoke('zuri:history:clear'),
    downloads: () => ipcRenderer.invoke('zuri:downloads:list'),
    pauseDownload: (id) => ipcRenderer.invoke('zuri:downloads:pause', id),
    resumeDownload: (id) => ipcRenderer.invoke('zuri:downloads:resume', id),
    cancelDownload: (id) => ipcRenderer.invoke('zuri:downloads:cancel', id),
    openDownload: (id) => ipcRenderer.invoke('zuri:downloads:open', id),
    showDownload: (id) => ipcRenderer.invoke('zuri:downloads:show', id)
  },
  settings: {
    get: () => ipcRenderer.invoke('zuri:settings:get'),
    update: (patch) => ipcRenderer.invoke('zuri:settings:update', patch)
  },
  app: {
    info: () => ipcRenderer.invoke('zuri:app:info'),
    openExternal: (url) => ipcRenderer.invoke('zuri:app:open-external', url),
    searchUrl: (query) => ipcRenderer.invoke('zuri:app:search-url', query),
    openMenu: (x, y) => ipcRenderer.send('zuri:menu:open', x, y)
  },
  privacy: {
    state: () => ipcRenderer.invoke('zuri:privacy:state')
  },
  on<T = unknown>(event: string, listener: (payload: T) => void) {
    if (!ALLOWED_EVENTS.has(event)) return () => undefined
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown): void =>
      listener(payload as T)
    ipcRenderer.on(event, wrapped)
    return () => {
      ipcRenderer.removeListener(event, wrapped)
    }
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('zuri', api)
