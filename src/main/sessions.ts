import { session, type Session } from 'electron'
import { attachDownloads } from './downloads'
import { hardenSession, privacyShield } from './privacy'

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
  hardenSession(main)
  privacyShield.attach(main)
  attachDownloads(main, false)

  const priv = getPrivateSession()
  hardenSession(priv)
  privacyShield.attach(priv)
  attachDownloads(priv, true)
}

export async function clearPrivateSession(): Promise<void> {
  const priv = getPrivateSession()
  await priv.clearStorageData()
  await priv.clearCache()
  privacyShield.clearCounters()
}
