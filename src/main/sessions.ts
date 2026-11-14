import { session, type Session } from 'electron'
import { attachDownloads, forgetPrivateDownloads } from './downloads'
import { forgetPrivateFavicons } from './favicons'
import { hardenSession, privacyShield } from './privacy'
import { registerInternalProtocol } from './protocol'

export const MAIN_PARTITION = 'persist:zuri'
export const PRIVATE_PARTITION = 'zuri-private'

let initialized = false

export function getMainSession(): Session {
  return session.fromPartition(MAIN_PARTITION)
}

export function getPrivateSession(): Session {
  return session.fromPartition(PRIVATE_PARTITION)
}

export function initSessions(): void {
  if (initialized) return
  initialized = true

  const main = getMainSession()
  hardenSession(main, 'main')
  privacyShield.attach(main)
  attachDownloads(main, false)
  // `protocol.handle` global ne couvre que la session par défaut : chaque partition
  // d'onglets doit enregistrer `zuri://` elle-même.
  registerInternalProtocol(main)

  const priv = getPrivateSession()
  hardenSession(priv, 'private')
  privacyShield.attach(priv)
  attachDownloads(priv, true)
  registerInternalProtocol(priv)
}

export async function clearPrivateSession(): Promise<void> {
  const priv = getPrivateSession()
  await priv.clearStorageData()
  await priv.clearCache()
  await priv.clearAuthCache()
  forgetPrivateDownloads()
  forgetPrivateFavicons()
}
