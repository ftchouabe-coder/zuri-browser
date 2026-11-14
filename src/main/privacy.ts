import { app, dialog, net, session as electronSession, type Session, type WebContents } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { FiltersEngine, Request, type RequestType } from '@ghostery/adblocker'
import { getSettings } from './settings'

/**
 * Bouclier réseau de Zuri.
 *
 * Un seul gestionnaire `webRequest` par événement et par session : le blocage
 * publicitaire, l'économie de données et l'HTTPS-only sont chaînés ici, ce qui
 * évite les conflits de handlers (Electron n'en autorise qu'un par événement).
 */

type AdblockerRequestType = RequestType

const FILTER_LISTS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://secure.fanboy.co.nz/fanboy-cookiemonster.txt',
  'https://easylist.to/easylist/fanboy-annoyance.txt'
]

const CACHE_MAX_AGE_MS = 4 * 24 * 60 * 60 * 1000
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i

function mapResourceType(type: string): AdblockerRequestType {
  return type as AdblockerRequestType
}

/** Clé de site approximative (eTLD+1) pour le blocage des cookies tiers. */
function siteKey(hostname: string): string {
  const parts = hostname.toLowerCase().split('.').filter(Boolean)
  if (parts.length <= 2) return parts.join('.')
  const twoLevel = new Set([
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'co.za', 'org.za', 'gov.za', 'co.ke', 'go.ke',
    'co.tz', 'co.ug', 'com.gh', 'com.ng', 'org.ng', 'co.ma', 'com.eg', 'com.sn', 'co.ci',
    'com.cm', 'co.mz', 'co.zw', 'co.bw', 'com.au', 'co.nz', 'com.br', 'com.mx', 'co.in'
  ])
  const lastTwo = parts.slice(-2).join('.')
  return twoLevel.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo
}

export interface BlockedListener {
  (webContentsId: number, tabCount: number, total: number): void
}

export class PrivacyShield {
  private engine: FiltersEngine | null = null
  private engineLoadedAt = 0
  private refreshing = false
  private blockedTotal = 0
  private blockedByWebContents = new Map<number, number>()
  private allowInsecure = new Set<string>()
  private installed = new WeakSet<Session>()
  private onBlocked: BlockedListener = () => {}

  constructor(private readonly cacheDir = join(app.getPath('userData'), 'adblock')) {}

  setBlockedListener(listener: BlockedListener): void {
    this.onBlocked = listener
  }

  get totalBlocked(): number {
    return this.blockedTotal
  }

  get ready(): boolean {
    return this.engine !== null
  }

  get lastUpdate(): number {
    return this.engineLoadedAt
  }

  /** Charge le moteur (cache disque d'abord, réseau en arrière-plan). */
  async init(): Promise<void> {
    if (!existsSync(this.cacheDir)) mkdirSync(this.cacheDir, { recursive: true })
    this.loadFromCache()
    if (!this.engine) await this.buildFromNetwork()
    const cache = join(this.cacheDir, 'engine.bin')
    if (existsSync(cache) && Date.now() - statSync(cache).mtimeMs > CACHE_MAX_AGE_MS) {
      void this.buildFromNetwork()
    }
  }

  private loadFromCache(): void {
    try {
      const cache = join(this.cacheDir, 'engine.bin')
      if (!existsSync(cache)) return
      const buffer = readFileSync(cache)
      this.engine = FiltersEngine.deserialize(buffer)
      this.engineLoadedAt = statSync(cache).mtimeMs
    } catch (error) {
      console.warn('[privacy] cache de filtres illisible', error)
    }
  }

  private async buildFromNetwork(): Promise<void> {
    if (this.refreshing) return
    this.refreshing = true
    try {
      const texts: string[] = []
      for (const url of FILTER_LISTS) {
        try {
          const response = await net.fetch(url, { signal: AbortSignal.timeout(20_000) })
          if (response.ok) texts.push(await response.text())
        } catch {
          /* liste indisponible : on continue avec les autres */
        }
      }
      const bundled = join(app.getAppPath(), 'resources', 'base-filters.txt')
      if (existsSync(bundled)) texts.push(readFileSync(bundled, 'utf8'))
      if (!texts.length) return

      const engine = FiltersEngine.parse(texts.join('\n'), {
        enableCompression: true,
        loadCosmeticFilters: true
      })
      this.engine = engine
      this.engineLoadedAt = Date.now()
      const cache = join(this.cacheDir, 'engine.bin')
      writeFileSync(cache, engine.serialize())
      console.info(
        '[privacy] filtres chargés :',
        engine.getFilters().networkFilters.length,
        'règles réseau,',
        engine.getFilters().cosmeticFilters.length,
        'règles cosmétiques'
      )
    } catch (error) {
      console.warn('[privacy] mise à jour des filtres impossible', error)
    } finally {
      this.refreshing = false
      // Propager aux sessions déjà branchées : le handler lit `this.engine` à chaque requête.
    }
  }

  private countBlocked(webContentsId: number | undefined): void {
    this.blockedTotal += 1
    if (typeof webContentsId !== 'number') return
    const next = (this.blockedByWebContents.get(webContentsId) ?? 0) + 1
    this.blockedByWebContents.set(webContentsId, next)
    this.onBlocked(webContentsId, next, this.blockedTotal)
  }

  blockedFor(webContentsId: number): number {
    return this.blockedByWebContents.get(webContentsId) ?? 0
  }

  resetFor(webContentsId: number): void {
    this.blockedByWebContents.delete(webContentsId)
  }

  /** Autorise un chargement HTTP en clair, une seule fois (bouton « Continuer en HTTP »). */
  allowInsecureOnce(url: string): void {
    this.allowInsecure.add(url)
    setTimeout(() => this.allowInsecure.delete(url), 30_000).unref?.()
  }

  attach(ses: Session): void {
    if (this.installed.has(ses)) return
    this.installed.add(ses)
    this.attachRequestHandler(ses)
    this.attachHeaderHandlers(ses)
  }

  private attachRequestHandler(ses: Session): void {
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      const settings = getSettings()
      const url = details.url

      if (!/^https?:/i.test(url)) return callback({})

      if (details.resourceType === 'mainFrame') {
        try {
          const parsed = new URL(url)
          if (
            settings.httpsOnly &&
            parsed.protocol === 'http:' &&
            !LOCAL_HOSTS.test(parsed.hostname) &&
            !this.allowInsecure.has(url)
          ) {
            return callback({ redirectURL: url.replace(/^http:/i, 'https:') })
          }
        } catch {
          /* URL invalide : laisser Chromium décider */
        }
      }

      if (settings.adblock && this.engine) {
        try {
          const request = Request.fromRawDetails({
            type: mapResourceType(details.resourceType),
            url,
            sourceUrl: details.referrer || undefined
          })
          const result = this.engine.match(request)
          if (result?.match) {
            this.countBlocked(details.webContentsId)
            const redirect = result.redirect?.dataUrl ?? result.rewrite?.url
            if (typeof redirect === 'string' && /^(https?|data):/i.test(redirect)) {
              return callback({ redirectURL: redirect })
            }
            return callback({ cancel: true })
          }
        } catch {
          /* une règle qui échoue ne doit jamais bloquer la navigation */
        }
      }

      if (settings.dataSaver) {
        const type = details.resourceType
        if (type === 'image' || type === 'media' || type === 'font') {
          return callback({ cancel: true })
        }
      }

      return callback({})
    })
  }

  private attachHeaderHandlers(ses: Session): void {
    ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, callback) => {
      const settings = getSettings()
      const headers = details.requestHeaders

      if (settings.stripReferrer) {
        const key = Object.keys(headers).find((name) => name.toLowerCase() === 'referer')
        const value = key ? headers[key] : undefined
        if (key && value) {
          try {
            const target = new URL(details.url)
            const referer = new URL(value)
            headers[key] = referer.origin === target.origin ? value : `${referer.origin}/`
          } catch {
            delete headers[key]
          }
        }
      }

      if (settings.blockThirdPartyCookies && details.resourceType !== 'mainFrame') {
        const cookieKey = Object.keys(headers).find((name) => name.toLowerCase() === 'cookie')
        if (cookieKey && details.referrer) {
          try {
            const targetSite = siteKey(new URL(details.url).hostname)
            const sourceSite = siteKey(new URL(details.referrer).hostname)
            if (targetSite !== sourceSite) delete headers[cookieKey]
          } catch {
            /* ignore */
          }
        }
      }

      callback({ requestHeaders: headers })
    })
  }

  /** Filtrage cosmétique : masque les emplacements publicitaires restants. */
  async applyCosmetics(contents: WebContents, url: string): Promise<void> {
    if (!this.engine || !getSettings().cosmeticFilters || !/^https?:/i.test(url)) return
    if (contents.isDestroyed()) return
    try {
      const hostname = new URL(url).hostname
      const { styles } = this.engine.getCosmeticsFilters({
        url,
        hostname,
        domain: hostname,
        getBaseRules: true,
        getRulesFromHostname: true
      })
      if (styles && styles.length > 0) await contents.insertCSS(styles, { cssOrigin: 'user' })
    } catch {
      /* cosmétique best-effort */
    }
  }

  /** Purge des compteurs (fin de session privée). */
  clearCounters(): void {
    this.blockedByWebContents.clear()
  }
}

export const privacyShield = new PrivacyShield()

export function applyDnsSetting(settings: ReturnType<typeof getSettings>): void {
  try {
    if (settings.dns === 'off') {
      app.configureHostResolver({ secureDnsMode: 'off', secureDnsServers: [] })
      return
    }
    const provider = [
      { id: 'cloudflare', servers: ['https://cloudflare-dns.com/dns-query'] },
      { id: 'quad9', servers: ['https://dns.quad9.net/dns-query'] },
      { id: 'mullvad', servers: ['https://dns.mullvad.net/dns-query'] },
      { id: 'google', servers: ['https://dns.google/dns-query'] }
    ].find((item) => item.id === settings.dns)
    app.configureHostResolver({
      secureDnsMode: 'secure',
      secureDnsServers: provider?.servers ?? []
    })
  } catch (error) {
    console.warn('[privacy] configuration DNS impossible', error)
  }
}

const ALWAYS_ALLOWED = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock'])
const PROMPTABLE = new Set([
  'media',
  'geolocation',
  'notifications',
  'clipboard-read',
  'midi',
  'midiSysex'
])

const permissionDecisions = new Map<string, boolean>()

const PERMISSION_TEXT: Record<string, { fr: string; en: string }> = {
  media: {
    fr: 'utiliser votre caméra et votre microphone',
    en: 'use your camera and microphone'
  },
  geolocation: { fr: 'connaître votre position', en: 'know your location' },
  notifications: { fr: 'vous envoyer des notifications', en: 'send you notifications' },
  'clipboard-read': {
    fr: 'lire le contenu de votre presse-papiers',
    en: 'read your clipboard'
  },
  midi: { fr: 'accéder à vos périphériques MIDI', en: 'access your MIDI devices' },
  midiSysex: {
    fr: 'accéder à vos périphériques MIDI (SysEx)',
    en: 'access your MIDI devices (SysEx)'
  }
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url
  }
}

async function promptPermission(origin: string, permission: string): Promise<boolean> {
  const language = getSettings().language
  const fr = language === 'fr'
  const what = PERMISSION_TEXT[permission]?.[language] ?? permission
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: fr ? 'Autorisation demandée' : 'Permission requested',
    message: fr
      ? `Le site ${origin} souhaite ${what}.`
      : `The site ${origin} wants to ${what}.`,
    detail: fr
      ? 'Vous pouvez changer d’avis à tout moment en rechargeant la page.'
      : 'You can change your mind at any time by reloading the page.',
    buttons: fr ? ['Autoriser', 'Bloquer'] : ['Allow', 'Block'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  })
  return response === 0
}

/** Réinitialise les autorisations mémorisées (effacement des données). */
export function clearPermissionDecisions(): void {
  permissionDecisions.clear()
}

/** Session par défaut, avec un User-Agent cohérent (sans jeton Electron). */
export function hardenSession(ses: Session): void {
  const ua = ses
    .getUserAgent()
    .replace(/\sZuri\/[\d.]+/i, '')
    .replace(/\sElectron\/[\d.]+/i, '')
  ses.setUserAgent(ua)
  ses.setSpellCheckerEnabled(true)

  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (ALWAYS_ALLOWED.has(permission)) {
      callback(true)
      return
    }
    if (!PROMPTABLE.has(permission)) {
      callback(false)
      return
    }
    const origin = originOf(details.requestingUrl || contents.getURL())
    const key = `${permission}|${origin}`
    const known = permissionDecisions.get(key)
    if (known !== undefined) {
      callback(known)
      return
    }
    void promptPermission(origin, permission)
      .then((granted) => {
        permissionDecisions.set(key, granted)
        callback(granted)
      })
      .catch(() => callback(false))
  })

  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    if (ALWAYS_ALLOWED.has(permission)) return true
    if (!PROMPTABLE.has(permission)) return false
    return permissionDecisions.get(`${permission}|${originOf(requestingOrigin)}`) ?? true
  })
}

export function defaultSession(): Session {
  return electronSession.defaultSession
}
