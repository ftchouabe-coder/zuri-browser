import type { Session } from 'electron'

/**
 * Récupération des favicons.
 *
 * L'interface (fenêtre principale) tourne dans la session par défaut : si elle chargeait
 * elle-même l'URL du favicon, la requête partirait hors de la partition de l'onglet
 * (sans anti-pub, avec d'autres cookies), ce qui fuit la navigation privée et sert de
 * pixel de suivi. On télécharge donc l'icône avec la session de l'onglet, sans cookies,
 * et on ne transmet qu'une URL `data:` bornée en taille.
 */

const MAX_BYTES = 128 * 1024
const TIMEOUT_MS = 8000
const CACHE_LIMIT = 300
const IMAGE_TYPES = /^image\/(png|x-icon|vnd\.microsoft\.icon|gif|jpeg|webp|svg\+xml|avif|bmp)$/i
const DATA_IMAGE = /^data:image\/(png|x-icon|vnd\.microsoft\.icon|gif|jpeg|webp|svg\+xml|avif|bmp)[;,]/i

/** Cache mémoire uniquement (jamais écrit sur disque), cloisonné privé / normal. */
const cache = new Map<string, string | null>()

function remember(key: string, value: string | null): string | null {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
  return value
}

/** Oublie les icônes des onglets privés (fin de session privée). */
export function forgetPrivateFavicons(): void {
  for (const key of cache.keys()) if (key.startsWith('private|')) cache.delete(key)
}

export async function loadFavicon(
  ses: Session,
  source: string,
  isPrivate: boolean
): Promise<string | null> {
  if (DATA_IMAGE.test(source)) return source.length <= MAX_BYTES * 1.4 ? source : null
  if (!/^https?:\/\//i.test(source)) return null

  const key = `${isPrivate ? 'private' : 'main'}|${source}`
  if (cache.has(key)) return cache.get(key) ?? null

  try {
    const response = await ses.fetch(source, {
      credentials: 'omit',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!response.ok) return remember(key, null)
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!IMAGE_TYPES.test(type)) return remember(key, null)
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > MAX_BYTES) return remember(key, null)
    const buffer = Buffer.from(await response.arrayBuffer())
    if (!buffer.length || buffer.length > MAX_BYTES) return remember(key, null)
    return remember(key, `data:${type.toLowerCase()};base64,${buffer.toString('base64')}`)
  } catch {
    // Échec réseau ou délai : on ne met pas en cache, une prochaine page pourra réessayer.
    return null
  }
}
