import {
  DEFAULT_SETTINGS,
  DNS_PROVIDERS,
  SEARCH_ENGINES,
  type Language,
  type Settings,
  type ThemeMode
} from '@shared/types'
import { toNavigableUrl } from './search'

/** Validation des réglages (module pur, testé unitairement). */

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
    safeBrowsing: bool('safeBrowsing'),
    blockThirdPartyCookies: bool('blockThirdPartyCookies'),
    httpsOnly: bool('httpsOnly'),
    stripReferrer: bool('stripReferrer'),
    dataSaver: bool('dataSaver'),
    autoplay: bool('autoplay'),
    clearOnExit: bool('clearOnExit'),
    showBookmarksBar: bool('showBookmarksBar'),
    restoreSession: bool('restoreSession'),
    autoUpdate: bool('autoUpdate'),
    // Page d'accueil : vide, ou une adresse http(s) normalisée — jamais un autre schéma.
    homepage: toNavigableUrl(str('homepage').slice(0, 2048)) ?? ''
  }
}
