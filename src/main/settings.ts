import {
  DEFAULT_SETTINGS,
  DNS_PROVIDERS,
  SEARCH_ENGINES,
  type Language,
  type Settings,
  type ThemeMode
} from '@shared/types'
import { JsonStore } from './store'

const THEMES: ThemeMode[] = ['light', 'dark', 'system']
const LANGUAGES: Language[] = ['fr', 'en']

export function sanitizeSettings(raw: unknown): Settings {
  const input = (raw ?? {}) as Record<string, unknown>
  const base = { ...DEFAULT_SETTINGS }

  const bool = (key: keyof Settings): boolean =>
    typeof input[key] === 'boolean' ? (input[key] as boolean) : (base[key] as boolean)
  const str = (key: keyof Settings): string =>
    typeof input[key] === 'string' ? (input[key] as string) : (base[key] as string)

  const theme = THEMES.includes(input.theme as ThemeMode) ? (input.theme as ThemeMode) : base.theme
  const language = LANGUAGES.includes(input.language as Language)
    ? (input.language as Language)
    : base.language
  const searchEngine = SEARCH_ENGINES.some((engine) => engine.id === input.searchEngine)
    ? (input.searchEngine as Settings['searchEngine'])
    : base.searchEngine
  const dns = DNS_PROVIDERS.some((provider) => provider.id === input.dns)
    ? (input.dns as Settings['dns'])
    : base.dns

  return {
    theme,
    language,
    searchEngine,
    dns,
    adblock: bool('adblock'),
    cosmeticFilters: bool('cosmeticFilters'),
    blockThirdPartyCookies: bool('blockThirdPartyCookies'),
    httpsOnly: bool('httpsOnly'),
    stripReferrer: bool('stripReferrer'),
    dataSaver: bool('dataSaver'),
    autoplay: bool('autoplay'),
    clearOnExit: bool('clearOnExit'),
    showBookmarksBar: bool('showBookmarksBar'),
    restoreSession: bool('restoreSession'),
    homepage: str('homepage').slice(0, 2048)
  }
}

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
