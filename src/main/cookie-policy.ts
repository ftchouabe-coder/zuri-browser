import { getDomain } from 'tldts'

/**
 * Politique « cookies tiers » (module pur, testé unitairement).
 *
 * Un « site » est le domaine enregistrable (eTLD+1) selon la Public Suffix List,
 * domaines privés inclus (`a.github.io` et `b.github.io` sont deux sites distincts).
 * Une adresse IP ou un nom sans suffixe public est son propre site.
 */
export function siteOf(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase()
    return getDomain(host, { allowPrivateDomains: true }) ?? host
  } catch {
    return null
  }
}

/**
 * Vrai si `requestUrl` est tiers par rapport à la page de premier niveau `topUrl`.
 * Si le site de premier niveau est inconnu, on ne conclut pas (pas de blocage aveugle).
 */
export function isThirdParty(requestUrl: string, topUrl: string | null | undefined): boolean {
  if (!topUrl) return false
  const target = siteOf(requestUrl)
  const top = siteOf(topUrl)
  return Boolean(target && top && target !== top)
}
