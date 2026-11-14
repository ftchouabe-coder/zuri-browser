import { SEARCH_ENGINES, type Settings } from '@shared/types'

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const HOST_RE = /^[a-zA-Z0-9\u00a1-\uffff-]+(\.[a-zA-Z0-9\u00a1-\uffff-]+)+(:\d+)?([/?#].*)?$/
const LOCALHOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?([/?#].*)?$/

/** Transforme la saisie de l'omnibox en URL ou en recherche. */
export function resolveInput(input: string, settings: Settings): string {
  const value = input.trim()
  if (!value) return ''

  if (SCHEME_RE.test(value)) return value
  if (LOCALHOST_RE.test(value)) return `http://${value}`
  if (HOST_RE.test(value)) return `https://${value}`

  const engine = SEARCH_ENGINES.find((item) => item.id === settings.searchEngine) ?? SEARCH_ENGINES[0]
  return engine.searchUrl.replace('%s', encodeURIComponent(value))
}

/** Extrait un domaine lisible pour l'interface. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function isInternalUrl(url: string): boolean {
  return url.startsWith('zuri://')
}

export function isHttpUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}
