import { Menu, app, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import type { Language, UiAction } from '@shared/types'
import { getSettings } from './settings'
import type { TabManager } from './tabs'

export interface MenuOptions {
  window: BrowserWindow
  tabs: TabManager
  sendUi: (action: UiAction) => void
  clearBrowsingData: () => void
}

interface Labels {
  file: string
  edit: string
  view: string
  history: string
  bookmarks: string
  tools: string
  help: string
  newTab: string
  newPrivate: string
  duplicate: string
  closeTab: string
  print: string
  quit: string
  undo: string
  redo: string
  cut: string
  copy: string
  paste: string
  selectAll: string
  find: string
  omnibox: string
  reload: string
  hardReload: string
  zoomIn: string
  zoomOut: string
  zoomReset: string
  bookmarksBar: string
  fullscreen: string
  devtools: string
  back: string
  forward: string
  home: string
  fullHistory: string
  clearData: string
  addBookmark: string
  manageBookmarks: string
  downloads: string
  settings: string
  privacyGuide: string
  source: string
  about: string
  zoom: string
}

const FR: Labels = {
  file: 'Fichier',
  edit: 'Édition',
  view: 'Affichage',
  history: 'Historique',
  bookmarks: 'Favoris',
  tools: 'Outils',
  help: 'Aide',
  newTab: 'Nouvel onglet',
  newPrivate: 'Nouvel onglet privé',
  duplicate: 'Dupliquer l’onglet',
  closeTab: 'Fermer l’onglet',
  print: 'Imprimer…',
  quit: 'Quitter Zuri',
  undo: 'Annuler',
  redo: 'Rétablir',
  cut: 'Couper',
  copy: 'Copier',
  paste: 'Coller',
  selectAll: 'Tout sélectionner',
  find: 'Rechercher dans la page…',
  omnibox: 'Barre d’adresse',
  reload: 'Recharger',
  hardReload: 'Recharger sans cache',
  zoomIn: 'Zoom avant',
  zoomOut: 'Zoom arrière',
  zoomReset: 'Taille normale',
  bookmarksBar: 'Barre de favoris',
  fullscreen: 'Plein écran',
  devtools: 'Outils de développement',
  back: 'Précédent',
  forward: 'Suivant',
  home: 'Accueil',
  fullHistory: 'Historique complet',
  clearData: 'Effacer les données de navigation…',
  addBookmark: 'Ajouter la page aux favoris',
  manageBookmarks: 'Gérer les favoris',
  downloads: 'Téléchargements',
  settings: 'Paramètres',
  privacyGuide: 'Guide de confidentialité',
  source: 'Code source',
  about: `À propos de Zuri ${app.getVersion()}`,
  zoom: 'Zoom'
}

const EN: Labels = {
  file: 'File',
  edit: 'Edit',
  view: 'View',
  history: 'History',
  bookmarks: 'Bookmarks',
  tools: 'Tools',
  help: 'Help',
  newTab: 'New tab',
  newPrivate: 'New private tab',
  duplicate: 'Duplicate tab',
  closeTab: 'Close tab',
  print: 'Print…',
  quit: 'Quit Zuri',
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'Select all',
  find: 'Find in page…',
  omnibox: 'Address bar',
  reload: 'Reload',
  hardReload: 'Reload without cache',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomReset: 'Actual size',
  bookmarksBar: 'Bookmarks bar',
  fullscreen: 'Full screen',
  devtools: 'Developer tools',
  back: 'Back',
  forward: 'Forward',
  home: 'Home',
  fullHistory: 'Full history',
  clearData: 'Clear browsing data…',
  addBookmark: 'Bookmark this page',
  manageBookmarks: 'Manage bookmarks',
  downloads: 'Downloads',
  settings: 'Settings',
  privacyGuide: 'Privacy guide',
  source: 'Source code',
  about: `About Zuri ${app.getVersion()}`,
  zoom: 'Zoom'
}

function labels(language: Language): Labels {
  return language === 'en' ? EN : FR
}

export function installMenu({ window, tabs, sendUi, clearBrowsingData }: MenuOptions): void {
  const l = labels(getSettings().language)
  const activeId = (): string | null => tabs.activeTabId

  const template: MenuItemConstructorOptions[] = [
    {
      label: l.file,
      submenu: [
        {
          label: l.newTab,
          accelerator: 'CmdOrCtrl+T',
          click: () => tabs.create()
        },
        {
          label: l.newPrivate,
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => tabs.create(undefined, true)
        },
        {
          label: l.duplicate,
          accelerator: 'CmdOrCtrl+Shift+K',
          click: () => {
            const id = activeId()
            if (id) tabs.duplicate(id)
          }
        },
        { type: 'separator' },
        {
          label: l.closeTab,
          accelerator: 'CmdOrCtrl+W',
          click: () => tabs.closeActive()
        },
        {
          label: l.print,
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            const id = activeId()
            if (id) tabs.print(id)
          }
        },
        { type: 'separator' },
        { label: l.quit, accelerator: 'Alt+F4', click: () => window.close() }
      ]
    },
    {
      label: l.edit,
      submenu: [
        { label: l.undo, role: 'undo' },
        { label: l.redo, role: 'redo' },
        { type: 'separator' },
        { label: l.cut, role: 'cut' },
        { label: l.copy, role: 'copy' },
        { label: l.paste, role: 'paste' },
        { label: l.selectAll, role: 'selectAll' },
        { type: 'separator' },
        {
          label: l.find,
          accelerator: 'CmdOrCtrl+F',
          click: () => sendUi({ type: 'open-find' })
        },
        {
          label: l.omnibox,
          accelerator: 'CmdOrCtrl+L',
          click: () => sendUi({ type: 'focus-omnibox' })
        }
      ]
    },
    {
      label: l.view,
      submenu: [
        {
          label: l.reload,
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            const id = activeId()
            if (id) tabs.reload(id)
          }
        },
        {
          label: l.hardReload,
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            const id = activeId()
            if (id) tabs.reload(id, true)
          }
        },
        { type: 'separator' },
        {
          label: l.zoomOut,
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const id = activeId()
            if (id) tabs.zoomBy(id, -0.5)
          }
        },
        {
          label: l.zoomIn,
          accelerator: 'CmdOrCtrl+=',
          click: () => {
            const id = activeId()
            if (id) tabs.zoomBy(id, 0.5)
          }
        },
        {
          label: l.zoomReset,
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            const id = activeId()
            if (id) tabs.resetZoom(id)
          }
        },
        { type: 'separator' },
        {
          label: l.bookmarksBar,
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => sendUi({ type: 'toggle-bookmarks-bar' })
        },
        { label: l.fullscreen, role: 'togglefullscreen' },
        {
          label: l.devtools,
          accelerator: 'F12',
          click: () => {
            const id = activeId()
            if (id) tabs.openDevTools(id)
          }
        }
      ]
    },
    {
      label: l.history,
      submenu: [
        {
          label: l.back,
          accelerator: 'Alt+Left',
          click: () => {
            const id = activeId()
            if (id) tabs.back(id)
          }
        },
        {
          label: l.forward,
          accelerator: 'Alt+Right',
          click: () => {
            const id = activeId()
            if (id) tabs.forward(id)
          }
        },
        {
          label: l.home,
          accelerator: 'Alt+Home',
          click: () => {
            const id = activeId()
            if (id) void tabs.navigate(id, '')
          }
        },
        { type: 'separator' },
        {
          label: l.fullHistory,
          accelerator: 'CmdOrCtrl+H',
          click: () => sendUi({ type: 'open-panel', panel: 'history' })
        },
        { type: 'separator' },
        {
          label: l.clearData,
          accelerator: 'CmdOrCtrl+Shift+Delete',
          click: () => clearBrowsingData()
        }
      ]
    },
    {
      label: l.bookmarks,
      submenu: [
        {
          label: l.addBookmark,
          accelerator: 'CmdOrCtrl+D',
          click: () => tabs.addCurrentBookmark()
        },
        {
          label: l.manageBookmarks,
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendUi({ type: 'open-panel', panel: 'bookmarks' })
        }
      ]
    },
    {
      label: l.tools,
      submenu: [
        {
          label: l.downloads,
          accelerator: 'CmdOrCtrl+J',
          click: () => sendUi({ type: 'open-panel', panel: 'downloads' })
        },
        {
          label: l.settings,
          accelerator: 'CmdOrCtrl+,',
          click: () => sendUi({ type: 'open-panel', panel: 'settings' })
        }
      ]
    },
    {
      label: l.help,
      submenu: [
        {
          label: l.privacyGuide,
          click: () => sendUi({ type: 'open-panel', panel: 'about' })
        },
        {
          label: l.source,
          click: () => void shell.openExternal('https://github.com/ftchouabe-coder/zuri-browser')
        },
        { type: 'separator' },
        {
          label: l.about,
          click: () => sendUi({ type: 'open-panel', panel: 'about' })
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Menu principal du bouton hamburger (natif, donc toujours au-dessus du contenu web). */
export function popupAppMenu(options: MenuOptions, x: number, y: number): void {
  const { window, tabs, sendUi, clearBrowsingData } = options
  const l = labels(getSettings().language)
  const id = (): string | null => tabs.activeTabId

  const template: MenuItemConstructorOptions[] = [
    { label: l.newTab, accelerator: 'CmdOrCtrl+T', click: () => tabs.create() },
    {
      label: l.newPrivate,
      accelerator: 'CmdOrCtrl+Shift+N',
      click: () => tabs.create(undefined, true)
    },
    { type: 'separator' },
    {
      label: l.bookmarks,
      accelerator: 'CmdOrCtrl+Shift+O',
      click: () => sendUi({ type: 'open-panel', panel: 'bookmarks' })
    },
    {
      label: l.history,
      accelerator: 'CmdOrCtrl+H',
      click: () => sendUi({ type: 'open-panel', panel: 'history' })
    },
    {
      label: l.downloads,
      accelerator: 'CmdOrCtrl+J',
      click: () => sendUi({ type: 'open-panel', panel: 'downloads' })
    },
    { type: 'separator' },
    {
      label: l.find,
      accelerator: 'CmdOrCtrl+F',
      click: () => sendUi({ type: 'open-find' })
    },
    {
      label: l.print,
      accelerator: 'CmdOrCtrl+P',
      click: () => {
        const active = id()
        if (active) tabs.print(active)
      }
    },
    {
      label: l.zoom,
      submenu: [
        {
          label: l.zoomIn,
          click: () => {
            const active = id()
            if (active) tabs.zoomBy(active, 0.5)
          }
        },
        {
          label: l.zoomOut,
          click: () => {
            const active = id()
            if (active) tabs.zoomBy(active, -0.5)
          }
        },
        {
          label: l.zoomReset,
          click: () => {
            const active = id()
            if (active) tabs.resetZoom(active)
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: l.clearData,
      accelerator: 'CmdOrCtrl+Shift+Delete',
      click: () => clearBrowsingData()
    },
    {
      label: l.settings,
      accelerator: 'CmdOrCtrl+,',
      click: () => sendUi({ type: 'open-panel', panel: 'settings' })
    },
    { type: 'separator' },
    {
      label: l.about,
      click: () => sendUi({ type: 'open-panel', panel: 'about' })
    },
    { label: l.quit, click: () => window.close() }
  ]

  Menu.buildFromTemplate(template).popup({
    window,
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y))
  })
}
