import { app, BrowserWindow, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { getSettings, onSettingsChanged } from './settings'

/**
 * Mises à jour automatiques (GitHub Releases, voir `build.publish` dans package.json).
 *
 * Un navigateur qui ne se met pas à jour embarque vite un Chromium vulnérable : la mise à
 * jour est donc active par défaut, désactivable dans les paramètres. Seule la version
 * installée (NSIS) est concernée : en développement et en version portable, rien n'est fait.
 *
 * Intégrité : electron-updater vérifie l'empreinte SHA-512 publiée dans `latest.yml`
 * (servi en HTTPS) et refuse les retours en arrière. Dès que l'exécutable sera signé,
 * renseigner `win.publisherName` pour qu'il vérifie aussi la signature Authenticode.
 */

const FIRST_CHECK_DELAY_MS = 20_000
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let timer: NodeJS.Timeout | null = null
let firstCheck: NodeJS.Timeout | null = null
let prompted = false

function supported(): boolean {
  return app.isPackaged && process.platform === 'win32' && !process.env['PORTABLE_EXECUTABLE_DIR']
}

function check(): void {
  autoUpdater.checkForUpdates().catch((error: unknown) => {
    console.warn('[updater] vérification impossible', error instanceof Error ? error.message : error)
  })
}

function start(): void {
  if (timer || firstCheck) return
  firstCheck = setTimeout(() => {
    firstCheck = null
    check()
  }, FIRST_CHECK_DELAY_MS)
  timer = setInterval(check, CHECK_INTERVAL_MS)
}

function stop(): void {
  if (firstCheck) clearTimeout(firstCheck)
  if (timer) clearInterval(timer)
  firstCheck = null
  timer = null
}

async function promptRestart(version: string): Promise<void> {
  if (prompted) return
  prompted = true
  const fr = getSettings().language === 'fr'
  const parent = BrowserWindow.getAllWindows()[0]
  const options: Electron.MessageBoxOptions = {
    type: 'info',
    title: fr ? 'Mise à jour prête' : 'Update ready',
    message: fr ? `Zuri ${version} est prêt à être installé.` : `Zuri ${version} is ready to install.`,
    detail: fr
      ? 'Elle contient des correctifs de sécurité. Sinon, elle sera installée à la prochaine fermeture.'
      : 'It contains security fixes. Otherwise it will be installed the next time you quit.',
    buttons: fr ? ['Redémarrer maintenant', 'Plus tard'] : ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  }
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options)
  if (response === 0) autoUpdater.quitAndInstall()
}

export function initUpdater(): void {
  if (!supported()) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = null

  autoUpdater.on('update-downloaded', (info) => void promptRestart(info.version))
  autoUpdater.on('error', (error) => console.warn('[updater] erreur', error.message))

  if (getSettings().autoUpdate) start()
  onSettingsChanged((settings) => {
    autoUpdater.autoInstallOnAppQuit = settings.autoUpdate
    if (settings.autoUpdate) start()
    else stop()
  })
}
