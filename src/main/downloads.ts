import { randomUUID } from 'node:crypto'
import { shell, type DownloadItem as NativeDownload, type Session } from 'electron'
import type { DownloadItem, DownloadState } from '@shared/types'

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
      }
      schedule()
    })
  })
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

export async function openDownload(id: string): Promise<void> {
  const entry = get(id)
  if (!entry) return
  const path = entry.view.savePath || entry.native.getSavePath()
  if (path) await shell.openPath(path)
}

export function showDownload(id: string): void {
  const entry = get(id)
  if (!entry) return
  const path = entry.view.savePath || entry.native.getSavePath()
  if (path) shell.showItemInFolder(path)
}
