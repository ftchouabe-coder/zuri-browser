import { randomUUID } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import {
  BrowserWindow,
  dialog,
  shell,
  type DownloadItem as NativeDownload,
  type Session
} from 'electron'
import type { DownloadItem, DownloadState } from '@shared/types'
import { isDangerousFile, zoneIdentifier } from './file-safety'
import { getSettings } from './settings'

interface Entry {
  native: NativeDownload
  view: DownloadItem
}

const entries = new Map<string, Entry>()
let notify: (items: DownloadItem[]) => void = () => {}
let timer: NodeJS.Timeout | null = null

export function setDownloadNotifier(fn: (items: DownloadItem[]) => void): void {
  notify = fn
}

function schedule(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    notify(listDownloads())
  }, 200)
}

export function listDownloads(): DownloadItem[] {
  return [...entries.values()]
    .map((entry) => ({ ...entry.view }))
    .sort((a, b) => b.startedAt - a.startedAt)
}

export function attachDownloads(ses: Session, isPrivate: boolean): void {
  ses.on('will-download', (_event, item) => {
    const id = randomUUID()
    const view: DownloadItem = {
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      state: 'progressing',
      received: item.getReceivedBytes(),
      total: item.getTotalBytes(),
      savePath: '',
      startedAt: Date.now(),
      paused: false,
      isPrivate
    }
    entries.set(id, { native: item, view })
    schedule()

    const sync = (): void => {
      const entry = entries.get(id)
      if (!entry) return
      entry.view = {
        ...entry.view,
        state: item.getState() as DownloadState,
        received: item.getReceivedBytes(),
        total: item.getTotalBytes(),
        savePath: item.getSavePath() || entry.view.savePath,
        paused: item.isPaused()
      }
      entries.set(id, entry)
      schedule()
    }

    item.on('updated', sync)
    item.once('done', (_e, state) => {
      sync()
      const entry = entries.get(id)
      if (entry) {
        entry.view = { ...entry.view, state: state as DownloadState, savePath: item.getSavePath() }
        entries.set(id, entry)
        if (state === 'completed') markOfTheWeb(entry.view.savePath, item, isPrivate)
      }
      schedule()
    })
  })
}

/**
 * Pose la « Mark of the Web » si Chromium ne l'a pas déjà fait, pour que SmartScreen et
 * Office avertissent à l'ouverture d'un fichier venu d'Internet.
 */
function markOfTheWeb(path: string, item: NativeDownload, isPrivate: boolean): void {
  if (process.platform !== 'win32' || !path) return
  const stream = `${path}:Zone.Identifier`
  try {
    if (existsSync(stream)) return
    // L'API ne fournit pas le référent du téléchargement : seule l'URL source est inscrite.
    writeFileSync(stream, zoneIdentifier(item.getURL(), '', isPrivate), 'utf8')
  } catch (error) {
    // Volumes FAT/exFAT ou réseau : pas de flux alternatifs, on ne bloque pas.
    console.warn('[downloads] Mark of the Web impossible', error)
  }
}

/** Fin de la session privée : annule et oublie les téléchargements privés. */
export function forgetPrivateDownloads(): void {
  let changed = false
  for (const [id, entry] of entries) {
    if (!entry.view.isPrivate) continue
    if (entry.native.getState() === 'progressing') entry.native.cancel()
    entries.delete(id)
    changed = true
  }
  if (changed) schedule()
}

function get(id: string): Entry | undefined {
  return entries.get(id)
}

export function pauseDownload(id: string): void {
  get(id)?.native.pause()
}

export function resumeDownload(id: string): void {
  get(id)?.native.resume()
}

export function cancelDownload(id: string): void {
  get(id)?.native.cancel()
}

/** Demande confirmation avant d'ouvrir un fichier exécutable ou à macros. */
async function confirmDangerousOpen(filename: string): Promise<boolean> {
  const fr = getSettings().language === 'fr'
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: fr ? 'Fichier potentiellement dangereux' : 'Potentially dangerous file',
    message: fr
      ? `« ${filename} » peut exécuter du code sur votre ordinateur.`
      : `"${filename}" can run code on your computer.`,
    detail: fr
      ? 'N’ouvrez ce fichier que si vous faites confiance au site qui l’a fourni. Les logiciels malveillants se déguisent souvent en factures, mises à jour ou documents.'
      : 'Only open this file if you trust the site it came from. Malware often poses as invoices, updates or documents.',
    buttons: fr ? ['Ouvrir quand même', 'Annuler'] : ['Open anyway', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  }
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options)
  return response === 0
}

export async function openDownload(id: string): Promise<void> {
  const entry = get(id)
  if (!entry || entry.native.getState() !== 'completed') return
  const path = entry.view.savePath || entry.native.getSavePath()
  if (!path) return
  if (isDangerousFile(path) && !(await confirmDangerousOpen(entry.view.filename))) return
  await shell.openPath(path)
}

export function showDownload(id: string): void {
  const entry = get(id)
  if (!entry) return
  const path = entry.view.savePath || entry.native.getSavePath()
  if (path) shell.showItemInFolder(path)
}
