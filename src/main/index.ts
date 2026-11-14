import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'node:path'
import { EVENTS, type TabsSnapshot } from '@shared/types'
import { flushBookmarks } from './bookmarks'
import { flushHistory, clearHistory, listHistory } from './history'
import { registerIpc, setAppContext, sendUi } from './ipc'
import { installMenu, type MenuOptions } from './menu'
import {
  applyDnsSetting,
  clearPermissionDecisions,
  privacyShield
} from './privacy'
import {
  clearPrivateSession,
  getMainSession,
  initSessions
} from './sessions'
import { flushSettings, getSettings, onSettingsChanged } from './settings'
import { JsonStore } from './store'
import { TabManager } from './tabs'
import { initUpdater } from './updater'

app.setName('Zuri')
if (process.platform === 'win32') app.setAppUserModelId('af.zuri.browser')

// Onglets de la dernière session, chiffrés au repos (safeStorage / DPAPI).
const sessionStore = new JsonStore<string[]>('session.json', [], {
  encrypted: true,
  normalize: (raw) =>
    Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
})

let mainWindow: BrowserWindow | null = null
let tabs: TabManager | null = null
let quitting = false
let restored = false

/** Nombre maximal d’onglets réouverts au démarrage (protection anti-emballement). */
const MAX_RESTORED_TABS = 30

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  void app.whenReady().then(bootstrap)
}

function emitSnapshot(snapshot: TabsSnapshot): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(EVENTS.tabs, snapshot)
}

async function bootstrap(): Promise<void> {
  initSessions()
  applyDnsSetting(getSettings())

  // Le chargement des filtres ne doit jamais retarder l'ouverture de la fenêtre.
  await Promise.race([privacyShield.init(), new Promise((resolve) => setTimeout(resolve, 2500))])

  createWindow()
  registerIpc()
  initUpdater()
}

function createWindow(): void {
  const settings = getSettings()

  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: settings.theme === 'dark' ? '#16130F' : '#EFE6D6',
    title: 'Zuri',
    icon: join(app.getAppPath(), 'resources', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false
    }
  })

  mainWindow = window
  window.removeMenu()

  const manager = new TabManager({
    window,
    emit: emitSnapshot,
    emitBlocked: (info) => {
      if (!window.isDestroyed()) window.webContents.send(EVENTS.blocked, info)
    },
    emitDownloads: (items) => {
      if (!window.isDestroyed()) window.webContents.send(EVENTS.downloads, items)
    }
  })
  tabs = manager

  setAppContext({
    window,
    tabs: manager,
    clearData
  })

  const menuOptions: MenuOptions = {
    window,
    tabs: manager,
    sendUi,
    clearBrowsingData: () => {
      sendUi({ type: 'open-panel', panel: 'settings' })
    }
  }
  installMenu(menuOptions)

  let menuLanguage = getSettings().language
  const offMenu = onSettingsChanged((next) => {
    if (next.language !== menuLanguage) {
      menuLanguage = next.language
      installMenu(menuOptions)
    }
  })

  window.on('ready-to-show', () => {
    window.show()
    restoreSession()
  })

  window.on('maximize', () => window.webContents.send(EVENTS.tabs, manager.snapshot()))
  window.on('unmaximize', () => window.webContents.send(EVENTS.tabs, manager.snapshot()))

  window.on('close', () => {
    if (getSettings().restoreSession) sessionStore.set(manager.serialize())
    sessionStore.flushNow()
  })

  window.on('closed', () => {
    offMenu()
    manager.destroyAll()
    mainWindow = null
    tabs = null
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void window.loadURL(devUrl)
  else void window.loadFile(join(__dirname, '../renderer/index.html'))

  // Aide au diagnostic : relayer les plantures du renderer principal.
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[zuri] interface interrompue', details.reason)
  })
}

function restoreSession(): void {
  if (!tabs || restored) return
  restored = true
  const settings = getSettings()
  const urls = settings.restoreSession
    ? [
        ...new Set(
          sessionStore
            .get()
            .filter((url) => typeof url === 'string' && /^https?:\/\//i.test(url))
            .slice(-MAX_RESTORED_TABS)
        )
      ]
    : []
  if (!urls.length) {
    tabs.create()
    return
  }
  urls.forEach((url, index) => tabs?.create(url, false, { background: index > 0 }))
}

async function clearData(scope: 'all' | 'history' | 'cookies'): Promise<void> {
  const fr = getSettings().language === 'fr'
  try {
    if (scope === 'history' || scope === 'all') {
      clearHistory()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(EVENTS.history, listHistory())
      }
    }
    if (scope === 'cookies' || scope === 'all') {
      const main = getMainSession()
      await main.clearStorageData(
        scope === 'cookies' ? { storages: ['cookies', 'localstorage'] } : undefined
      )
      await clearPrivateSession()
      clearPermissionDecisions()
      if (scope === 'all') await main.clearCache()
      void dialog.showMessageBox({
        type: 'info',
        title: fr ? 'Données effacées' : 'Data cleared',
        message:
          scope === 'all'
            ? fr
              ? 'Historique, cookies et cache ont été effacés.'
              : 'History, cookies and cache have been cleared.'
            : fr
              ? 'Les cookies et le stockage local ont été effacés.'
              : 'Cookies and local storage have been cleared.',
        buttons: ['OK']
      })
    } else if (scope === 'history') {
      void dialog.showMessageBox({
        type: 'info',
        title: fr ? 'Historique effacé' : 'History cleared',
        message: fr
          ? 'Votre historique de navigation a été supprimé.'
          : 'Your browsing history has been deleted.',
        buttons: ['OK']
      })
    }
  } catch (error) {
    console.error('[zuri] effacement impossible', error)
  }
}

app.on('before-quit', (event) => {
  if (quitting) return
  const settings = getSettings()
  if (settings.restoreSession && tabs) sessionStore.set(tabs.serialize())
  sessionStore.flushNow()
  flushSettings()
  flushHistory()
  flushBookmarks()

  if (settings.clearOnExit) {
    event.preventDefault()
    quitting = true
    clearPermissionDecisions()
    // Effacement complet : historique, cookies et stockage, cache HTTP, identifiants HTTP.
    // Les onglets ouverts restent gérés par l'option « Restaurer les onglets ».
    clearHistory()
    flushHistory()
    const main = getMainSession()
    void Promise.allSettled([
      main.clearStorageData(),
      main.clearCache(),
      main.clearAuthCache(),
      clearPrivateSession()
    ]).finally(() => app.quit())
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
})

process.on('uncaughtException', (error) => {
  console.error('[zuri] exception non gérée', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[zuri] promesse rejetée', reason)
})
