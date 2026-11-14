import { SEARCH_ENGINES, type Settings } from '@shared/types'

const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const HOST_RE = /^[a-zA-Z0-9\u00a1-\uffff-]+(\.[a-zA-Z0-9\u00a1-\uffff-]+)+(:\d+)?([/?#].*)?$/
const LOCALHOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?([/?#].*)?$/

/**
 * Convertit une saisie en URL chargeable, ou `null` si ce n'est pas une adresse.
 * Seuls http(s) — et `file:` si `allowFile` — sont acceptés ; tout autre schéma
 * (`javascript:`, `data:`, `vbscript:`, gestionnaires externes…) est refusé.
 */
export function toNavigableUrl(input: string, options: { allowFile?: boolean } = {}): string | null {
  const value = input.trim()
  if (!value) return null
  if (LOCALHOST_RE.test(value)) return `http://${value}`
  if (SCHEME_RE.test(value)) {
    try {
      const url = new URL(value)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
      if (options.allowFile && url.protocol === 'file:') return url.href
    } catch {
      /* pas une URL : peut-être « hote:port », traité plus bas */
    }
  }
  if (HOST_RE.test(value)) return `https://${value}`
  return null
}

/** Transforme la saisie de l'omnibox en URL ou, à défaut, en recherche. */
export function resolveInput(
  input: string,
  settings: Settings,
  options: { allowFile?: boolean } = {}
): string {
  const value = input.trim()
  if (!value) return ''
  const url = toNavigableUrl(value, options)
  if (url) return url

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
  return /^https?:\/\//i.test(url)
}
