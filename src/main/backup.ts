import { dialog, type BrowserWindow } from 'electron'
import { readFile, stat, writeFile } from 'node:fs/promises'
import type { BackupResult } from '@shared/types'
import { BackupError, openBackupAsync, sealBackupAsync } from './backup-crypto'
import { buildBackup, parseBackup } from './backup-format'
import { importBookmarks, listBookmarks } from './bookmarks'
import { importHistory, listHistory } from './history'
import { getSettings, updateSettings } from './settings'

const MAX_BACKUP_BYTES = 64 * 1024 * 1024

/**
 * Échange de sauvegardes chiffrées avec la version Android (même format ZBK1) : favoris,
 * historique et réglages communs. Le fichier est choisi par l'utilisateur ; rien n'est envoyé.
 */
export async function exportBackup(window: BrowserWindow, password: string): Promise<BackupResult> {
  if (password.length < 8) return { ok: false, error: 'too-short' }
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    defaultPath: `zuri-sauvegarde-${new Date().toISOString().slice(0, 10)}.zuri`,
    filters: [{ name: 'Sauvegarde Zuri', extensions: ['zuri'] }]
  })
  if (canceled || !filePath) return { ok: false, error: 'cancelled' }
  try {
    const json = buildBackup(listBookmarks(), listHistory(5000), getSettings())
    await writeFile(filePath, await sealBackupAsync(Buffer.from(JSON.stringify(json), 'utf8'), password))
    return { ok: true }
  } catch (error) {
    console.warn('[backup] export impossible :', error instanceof Error ? error.message : error)
    return { ok: false, error: 'failed' }
  }
}

export async function importBackup(window: BrowserWindow, password: string): Promise<BackupResult> {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [{ name: 'Sauvegarde Zuri', extensions: ['zuri'] }, { name: '*', extensions: ['*'] }]
  })
  if (canceled || !filePaths[0]) return { ok: false, error: 'cancelled' }
  try {
    if ((await stat(filePaths[0])).size > MAX_BACKUP_BYTES) return { ok: false, error: 'invalid' }
    const plain = await openBackupAsync(await readFile(filePaths[0]), password)
    const parsed = parseBackup(JSON.parse(plain.toString('utf8')))
    if (!parsed) return { ok: false, error: 'invalid' }
    const bookmarks = importBookmarks(parsed.bookmarks)
    const history = importHistory(parsed.history)
    if (Object.keys(parsed.settings).length) updateSettings(parsed.settings)
    return { ok: true, bookmarks, history, offlineSkipped: parsed.offlineCount }
  } catch (error) {
    if (error instanceof BackupError) return { ok: false, error: error.code }
    if (error instanceof SyntaxError) return { ok: false, error: 'invalid' }
    console.warn('[backup] import impossible :', error instanceof Error ? error.message : error)
    return { ok: false, error: 'failed' }
  }
}
