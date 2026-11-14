import { DEFAULT_SETTINGS, type Settings } from '@shared/types'
import { sanitizeSettings } from './settings-schema'
import { JsonStore } from './store'

export { sanitizeSettings }

const store = new JsonStore<Settings>('settings.json', DEFAULT_SETTINGS, sanitizeSettings)
const listeners = new Set<(settings: Settings) => void>()

export function getSettings(): Settings {
  return store.get()
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = sanitizeSettings({ ...store.get(), ...patch })
  store.set(next)
  for (const listener of listeners) {
    try {
      listener(next)
    } catch (error) {
      console.error('[settings] listener error', error)
    }
  }
  return next
}

export function onSettingsChanged(listener: (settings: Settings) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function flushSettings(): void {
  store.flushNow()
}
