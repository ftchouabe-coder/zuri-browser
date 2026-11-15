import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  session as electronSession,
  webContents,
  type IpcMainInvokeEvent,
  type Session,
  type WebContents
} from 'electron'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FiltersEngine, Request, type RequestType } from '@ghostery/adblocker'
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import { isThirdParty } from './cookie-policy'
import { checkLookalike } from './lookalike'
import { recordBlocked } from './savings'
import { getSettings } from './settings'

/**
 * Bouclier réseau de Zuri.
 *
 * Electron n'autorise qu'un gestionnaire `webRequest` par événement et par session :
 * protection anti-phishing/malware, HTTPS-only, anti-pub, économie de données et
 * cookies tiers sont donc chaînés ici. Le moteur anti-pub est celui de
 * `@ghostery/adblocker-electron`, mais ses méthodes sont appelées depuis nos handlers
 * (au lieu de `enableBlockingInSession`, qui écraserait ceux de Zuri).
 */

/** Chaque liste est une suite d'adresses équivalentes (source, puis miroirs). */
type ListSource = readonly string[]

const AD_LISTS: ListSource[] = [
  ['https://easylist.to/easylist/easylist.txt'],
  ['https://easylist.to/easylist/easyprivacy.txt'],
  ['https://secure.fanboy.co.nz/fanboy-cookiemonster.txt'],
  ['https://easylist.to/easylist/fanboy-annoyance.txt']
]

/** Listes de sécurité (téléchargées à l'exécution, non redistribuées), avec miroir officiel. */
const PHISHING_LISTS: ListSource[] = [
  [
    'https://malware-filter.gitlab.io/malware-filter/phishing-filter.txt',
    'https://malware-filter.pages.dev/phishing-filter.txt'
  ]
]
const MALWARE_LISTS: ListSource[] = [
  [
    'https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-online.txt',
    'https://malware-filter.pages.dev/urlhaus-filter-online.txt'
  ]
]

/**
 * Téléchargement adapté aux connexions lentes : on n’abandonne que si *rien* n’arrive
 * pendant `IDLE_TIMEOUT_MS`, avec un plafond global. Un délai global court (30 s) rendait
 * la protection inopérante sous ~50 Ko/s, alors que ces listes pèsent plusieurs Mo.
 */
const IDLE_TIMEOUT_MS = 60_000
const TOTAL_TIMEOUT_MS = 10 * 60 * 1000
const MAX_LIST_BYTES = 64 * 1024 * 1024
const RETRY_AFTER_FAILURE_MS = 10 * 60 * 1000

async function downloadText(url: string): Promise<string> {
  const controller = new AbortController()
  let idle: NodeJS.Timeout | undefined
  const arm = (): void => {
    clearTimeout(idle)
    idle = setTimeout(() => controller.abort(new Error('inactivité')), IDLE_TIMEOUT_MS)
  }
  const total = setTimeout(() => controller.abort(new Error('délai global')), TOTAL_TIMEOUT_MS)
  try {
    arm()
    const response = await net.fetch(url, { signal: controller.signal })
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      arm()
      size += value.byteLength
      if (size > MAX_LIST_BYTES) throw new Error('liste trop volumineuse')
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally {
    clearTimeout(idle)
    clearTimeout(total)
  }
}

/** Essaie la source puis ses miroirs ; `null` si aucune adresse n'a répondu. */
async function downloadList(source: ListSource): Promise<string | null> {
  for (const url of source) {
    try {
      return await downloadText(url)
    } catch (error) {
      console.warn(`[privacy] ${url} indisponible :`, error instanceof Error ? error.message : error)
    }
  }
  return null
}

const DAY = 24 * 60 * 60 * 1000
const REFRESH_TICK_MS = 3 * 60 * 60 * 1000
const UNSAFE_ALLOW_MS = 10 * 60 * 1000
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i

const COSMETIC_CHANNEL = '@ghostery/adblocker/inject-cosmetic-filters'
const MUTATION_CHANNEL = '@ghostery/adblocker/is-mutation-observer-enabled'

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

export type ThreatKind = 'phishing' | 'malware' | 'lookalike'

/** Menace bloquée ; pour une imitation de marque, la marque et ses domaines officiels. */
export interface ThreatInfo {
  kind: ThreatKind
  brand?: string
  example?: string
}

interface RequestLike {
  url: string
  resourceType?: string
  referrer?: string
  webContents?: WebContents
  webContentsId?: number
}

/**
 * URL de la page de premier niveau qui a émis la requête : l'URL de l'onglet, sinon
 * le référent. Le référent seul ne suffit pas : il est vide dès qu'un site impose
 * `Referrer-Policy: no-referrer`, ce qui laissait passer les cookies tiers.
 */
function topLevelUrl(details: RequestLike): string | null {
  let contents = details.webContents
  if (!contents && typeof details.webContentsId === 'number') {
    contents = webContents.fromId(details.webContentsId) ?? undefined
  }
  const url = contents && !contents.isDestroyed() ? contents.getURL() : ''
  if (/^https?:/i.test(url)) return url
  return details.referrer || null
}

function toRequest(details: RequestLike): Request {
  return Request.fromRawDetails({
    type: (details.resourceType || 'other') as RequestType,
    url: details.url,
    // Sans référent (Referrer-Policy: no-referrer), la page de l'onglet fait foi :
    // sinon les règles « $third-party » ne s'appliqueraient plus.
    sourceUrl: details.referrer || topLevelUrl(details) || undefined
  })
}

/**
 * Un jeu de listes compilé en moteur, mis en cache sur disque (binaire Ghostery) et
 * rafraîchi périodiquement.
 */
class FilterSet<E extends FiltersEngine> {
  engine: E | null = null
  loadedAt = 0
  private refreshing = false
  private retryTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly label: string,
    private readonly file: string,
    private readonly lists: ListSource[],
    private readonly maxAgeMs: number,
    private readonly build: (text: string) => E,
    private readonly load: (buffer: Uint8Array) => E,
    private readonly fallback: () => string = () => ''
  ) {}

  private get stale(): boolean {
    return !this.engine || Date.now() - this.loadedAt > this.maxAgeMs
  }

  /** Cache d'abord ; on n'attend le réseau que s'il n'y a aucun cache. */
  async init(): Promise<void> {
    try {
      if (existsSync(this.file)) {
        this.engine = this.load(readFileSync(this.file))
        this.loadedAt = statSync(this.file).mtimeMs
      }
    } catch (error) {
      console.warn(`[privacy] cache ${this.label} illisible`, error)
    }
    if (!this.engine) await this.refresh()
    else if (this.stale) void this.refresh()
  }

  refreshIfStale(): void {
    if (this.stale) void this.refresh()
  }

  private async refresh(): Promise<void> {
    if (this.refreshing) return
    this.refreshing = true
    try {
      const remote = (await Promise.all(this.lists.map(downloadList))).filter(
        (text): text is string => text !== null
      )
      // Aucune liste distante et un moteur existe : on le garde plutôt qu'un moteur appauvri.
      if (!remote.length && this.engine) return
      const local = this.fallback()
      const texts = local ? [...remote, local] : remote
      if (!texts.length) return
      const engine = this.build(texts.join('\n'))
      this.engine = engine
      if (remote.length) {
        this.loadedAt = Date.now()
        writeFileSync(this.file, engine.serialize())
      } else {
        // Moteur de secours (liste embarquée seule) : utilisable tout de suite, mais ni mis
        // en cache ni considéré comme à jour, pour retenter le réseau rapidement.
        this.loadedAt = 0
      }
      const { networkFilters, cosmeticFilters } = engine.getFilters()
      console.info(
        `[privacy] ${this.label} : ${networkFilters.length} règles réseau, ${cosmeticFilters.length} cosmétiques`
      )
    } catch (error) {
      console.warn(`[privacy] mise à jour ${this.label} impossible`, error)
    } finally {
      this.refreshing = false
      this.scheduleRetryIfIncomplete()
    }
  }

  /** Sans moteur à jour (réseau absent ou trop lent), nouvel essai dans 10 minutes. */
  private scheduleRetryIfIncomplete(): void {
    if (!this.stale || this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.refreshIfStale()
    }, RETRY_AFTER_FAILURE_MS)
    this.retryTimer.unref?.()
  }
}

export interface BlockedListener {
  (webContentsId: number, tabCount: number, total: number): void
}

export class PrivacyShield {
  private readonly cacheDir = join(app.getPath('userData'), 'adblock')
  private readonly ads: FilterSet<ElectronBlocker>
  private readonly phishing: FilterSet<FiltersEngine>
  private readonly malware: FilterSet<FiltersEngine>
  private blockedTotal = 0
  private blockedByWebContents = new Map<number, number>()
  private allowInsecure = new Set<string>()
  /** Sites signalés que l'utilisateur a choisi d'ouvrir : clé `${webContentsId}|${hôte}`. */
  private allowUnsafe = new Map<string, number>()
  /** Dernière menace bloquée par onglet, lue pour afficher la page d'avertissement. */
  private pendingThreats = new Map<number, ThreatInfo & { url: string }>()
  private installed = new WeakSet<Session>()
  private ipcReady = false
  private refreshTimer: NodeJS.Timeout | null = null
  private onBlocked: BlockedListener = () => {}

  constructor() {
    const bundled = (): string => {
      const file = join(app.getAppPath(), 'resources', 'base-filters.txt')
      return existsSync(file) ? readFileSync(file, 'utf8') : ''
    }
    const plain = (text: string): FiltersEngine =>
      FiltersEngine.parse(text, { enableCompression: true, loadCosmeticFilters: false })
    this.ads = new FilterSet(
      'anti-pub',
      join(this.cacheDir, 'engine.bin'),
      AD_LISTS,
      4 * DAY,
      (text) =>
        ElectronBlocker.parse(text, {
          enableCompression: true,
          loadCosmeticFilters: true,
          loadNetworkFilters: true,
          enableMutationObserver: true
        }),
      (buffer) => ElectronBlocker.deserialize(buffer),
      bundled
    )
    this.phishing = new FilterSet(
      'anti-phishing',
      join(this.cacheDir, 'phishing.bin'),
      PHISHING_LISTS,
      DAY / 2,
      plain,
      (buffer) => FiltersEngine.deserialize(buffer)
    )
    this.malware = new FilterSet(
      'anti-malware',
      join(this.cacheDir, 'malware.bin'),
      MALWARE_LISTS,
      DAY / 2,
      plain,
      (buffer) => FiltersEngine.deserialize(buffer)
    )
  }

  setBlockedListener(listener: BlockedListener): void {
    this.onBlocked = listener
  }

  get totalBlocked(): number {
    return this.blockedTotal
  }

  get ready(): boolean {
    return this.ads.engine !== null
  }

  get securityReady(): boolean {
    return this.phishing.engine !== null && this.malware.engine !== null
  }

  get lastUpdate(): number {
    return this.ads.loadedAt
  }

  async init(): Promise<void> {
    if (!existsSync(this.cacheDir)) mkdirSync(this.cacheDir, { recursive: true })
    await Promise.all([this.ads.init(), this.phishing.init(), this.malware.init()])
    if (!this.refreshTimer) {
      this.refreshTimer = setInterval(() => {
        this.ads.refreshIfStale()
        this.phishing.refreshIfStale()
        this.malware.refreshIfStale()
      }, REFRESH_TICK_MS)
      this.refreshTimer.unref?.()
    }
  }

  private countBlocked(webContentsId: number | undefined): void {
    this.blockedTotal += 1
    recordBlocked()
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
    this.pendingThreats.delete(webContentsId)
    for (const key of this.allowUnsafe.keys()) {
      if (key.startsWith(`${webContentsId}|`)) this.allowUnsafe.delete(key)
    }
  }

  /** Autorise un chargement HTTP en clair, une seule fois (bouton « Continuer en HTTP »). */
  allowInsecureOnce(url: string): void {
    this.allowInsecure.add(url)
    setTimeout(() => this.allowInsecure.delete(url), 30_000).unref?.()
  }

  /** Ouverture malgré l'avertissement : autorisée pour cet onglet et cet hôte, 10 minutes. */
  allowUnsafeFor(webContentsId: number, url: string): void {
    try {
      const host = new URL(url).hostname
      this.allowUnsafe.set(`${webContentsId}|${host}`, Date.now() + UNSAFE_ALLOW_MS)
    } catch {
      /* URL invalide : rien à autoriser */
    }
  }

  /** Menace bloquée pour cet onglet et cette URL (consommée par la page d'avertissement). */
  takeThreat(webContentsId: number, url: string): ThreatInfo | null {
    const threat = this.pendingThreats.get(webContentsId)
    if (!threat || threat.url !== url) return null
    this.pendingThreats.delete(webContentsId)
    return { kind: threat.kind, brand: threat.brand, example: threat.example }
  }

  private isUnsafeAllowed(webContentsId: number | undefined, url: string): boolean {
    if (typeof webContentsId !== 'number') return false
    try {
      const key = `${webContentsId}|${new URL(url).hostname}`
      const expires = this.allowUnsafe.get(key)
      if (!expires) return false
      if (expires < Date.now()) {
        this.allowUnsafe.delete(key)
        return false
      }
      return true
    } catch {
      return false
    }
  }

  private threatOf(request: Request): ThreatKind | null {
    if (this.phishing.engine?.match(request).match) return 'phishing'
    if (this.malware.engine?.match(request).match) return 'malware'
    return null
  }

  attach(ses: Session): void {
    if (this.installed.has(ses)) return
    this.installed.add(ses)
    this.attachRequestHandler(ses)
    this.attachHeaderHandlers(ses)
    this.attachCosmetics(ses)
  }

  private attachRequestHandler(ses: Session): void {
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      const settings = getSettings()
      const url = details.url
      if (!/^https?:/i.test(url)) return callback({})

      let request: Request | null = null
      const req = (): Request => (request ??= toRequest(details))

      // 1. Phishing et logiciels malveillants (indépendant de l'anti-pub).
      if (settings.safeBrowsing && !this.isUnsafeAllowed(details.webContentsId, url)) {
        try {
          const kind = this.threatOf(req())
          if (kind) {
            this.countBlocked(details.webContentsId)
            if (details.resourceType === 'mainFrame' && typeof details.webContentsId === 'number') {
              this.pendingThreats.set(details.webContentsId, { url, kind })
            }
            return callback({ cancel: true })
          }
        } catch {
          /* une règle qui échoue ne doit jamais bloquer la navigation */
        }
        // Faux site de mobile money ou de banque : nom d'hôte imitant une marque connue.
        if (details.resourceType === 'mainFrame' && typeof details.webContentsId === 'number') {
          const match = checkLookalike(hostOf(url))
          if (match) {
            this.pendingThreats.set(details.webContentsId, {
              url,
              kind: 'lookalike',
              brand: match.brand.name,
              example: match.brand.example
            })
            return callback({ cancel: true })
          }
        }
      }

      // 2. HTTPS-only pour la page principale.
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

      // 3. Anti-pub / anti-trace (jamais sur la page principale, comme Ghostery).
      const blocker = this.ads.engine
      if (settings.adblock && blocker && details.resourceType !== 'mainFrame') {
        try {
          const { match, redirect } = blocker.match(req())
          if (match || redirect) {
            this.countBlocked(details.webContentsId)
            const target = redirect?.dataUrl
            if (typeof target === 'string' && target.startsWith('data:')) {
              return callback({ redirectURL: target })
            }
            return callback({ cancel: true })
          }
        } catch {
          /* idem */
        }
      }

      // 4. Économie de données.
      if (settings.dataSaver) {
        const type = details.resourceType
        if (type === 'image' || type === 'media' || type === 'font') return callback({ cancel: true })
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

      if (
        settings.blockThirdPartyCookies &&
        details.resourceType !== 'mainFrame' &&
        isThirdParty(details.url, topLevelUrl(details))
      ) {
        for (const name of Object.keys(headers)) {
          if (name.toLowerCase() === 'cookie') delete headers[name]
        }
      }

      callback({ requestHeaders: headers })
    })

    ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
      const settings = getSettings()
      const headers = details.responseHeaders
      if (!headers) return callback({})
      let changed = false

      // Règles « $csp » des listes, ajoutées comme politique *supplémentaire* : les fusionner
      // dans l'en-tête du site (comme le fait Ghostery) peut affaiblir sa propre CSP.
      const isDocument = details.resourceType === 'mainFrame' || details.resourceType === 'subFrame'
      const blocker = this.ads.engine
      if (settings.adblock && blocker && isDocument) {
        try {
          const directives = blocker.getCSPDirectives(toRequest(details))
          if (directives) {
            const key =
              Object.keys(headers).find((name) => name.toLowerCase() === 'content-security-policy') ??
              'Content-Security-Policy'
            headers[key] = [...(headers[key] ?? []), directives]
            changed = true
          }
        } catch {
          /* best-effort */
        }
      }

      // Un tiers ne doit pas non plus pouvoir *déposer* de cookie via ses réponses.
      if (
        settings.blockThirdPartyCookies &&
        details.resourceType !== 'mainFrame' &&
        isThirdParty(details.url, topLevelUrl(details))
      ) {
        for (const name of Object.keys(headers)) {
          if (name.toLowerCase() === 'set-cookie') {
            delete headers[name]
            changed = true
          }
        }
      }

      const response: Electron.HeadersReceivedResponse = changed ? { responseHeaders: headers } : {}
      callback(response)
    })
  }

  /**
   * Filtrage cosmétique et scriptlets d'`adblocker-electron` : un préchargement isolé
   * (compatible sandbox) demande les règles au chargement, puis à chaque mutation du DOM.
   */
  private attachCosmetics(ses: Session): void {
    ses.registerPreloadScript({
      type: 'frame',
      filePath: require.resolve('@ghostery/adblocker-electron-preload')
    })
    if (this.ipcReady) return
    this.ipcReady = true

    const frameUrlIfAllowed = (event: IpcMainInvokeEvent): string | null => {
      const settings = getSettings()
      if (!settings.adblock || !settings.cosmeticFilters || !this.ads.engine) return null
      // Uniquement depuis un onglet d'une session protégée, avec l'URL réelle du cadre
      // (et non celle que la page prétend avoir).
      if (!this.installed.has(event.sender.session)) return null
      const frameUrl = event.senderFrame?.url ?? ''
      return /^https?:/i.test(frameUrl) ? frameUrl : null
    }

    type CosmeticMessage = Parameters<ElectronBlocker['onInjectCosmeticFilters']>[2]
    ipcMain.handle(COSMETIC_CHANNEL, async (event, _url: unknown, msg: unknown) => {
      const frameUrl = frameUrlIfAllowed(event)
      const engine = this.ads.engine
      if (!frameUrl || !engine) return
      const payload = msg && typeof msg === 'object' ? (msg as CosmeticMessage) : undefined
      await engine.onInjectCosmeticFilters(event, frameUrl, payload)
    })
    ipcMain.handle(MUTATION_CHANNEL, (event) => {
      const engine = this.ads.engine
      if (!frameUrlIfAllowed(event) || !engine) return false
      return engine.onIsMutationObserverEnabled(event)
    })
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

/**
 * Décisions mémorisées, clé `${portée}|${permission}|${origine}`.
 * La portée (session normale / privée) empêche toute fuite d'une décision entre les deux.
 * Pour `media`, la permission est déclinée par type : `media:audio`, `media:video`.
 */
const permissionDecisions = new Map<string, boolean>()
const pendingPrompts = new Map<string, Promise<boolean>>()

const PERMISSION_TEXT: Record<string, { fr: string; en: string }> = {
  'media:audio': { fr: 'utiliser votre microphone', en: 'use your microphone' },
  'media:video': { fr: 'utiliser votre caméra', en: 'use your camera' },
  'media:audio+video': {
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

/** Origine sérialisée ; `null` si l'URL n'a pas d'origine exploitable (opaque, invalide). */
function originOf(url: string): string | null {
  try {
    const origin = new URL(url).origin
    return origin && origin !== 'null' ? origin : null
  } catch {
    return null
  }
}

/** Types de média demandés, normalisés (`audio`, `video`). */
function mediaKinds(types: readonly string[] | undefined): string[] {
  const kinds = new Set<string>()
  for (const type of types ?? []) if (type === 'audio' || type === 'video') kinds.add(type)
  return [...kinds].sort()
}

async function promptPermission(
  origin: string,
  topOrigin: string | null,
  textKey: string
): Promise<boolean> {
  const language = getSettings().language
  const fr = language === 'fr'
  const what = PERMISSION_TEXT[textKey]?.[language] ?? textKey
  const embedded = topOrigin && topOrigin !== origin
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options: Electron.MessageBoxOptions = {
    type: 'question',
    title: fr ? 'Autorisation demandée' : 'Permission requested',
    message: fr ? `Le site ${origin} souhaite ${what}.` : `The site ${origin} wants to ${what}.`,
    detail:
      (embedded
        ? fr
          ? `Cette demande provient d’un contenu intégré à ${topOrigin}.\n`
          : `This request comes from content embedded in ${topOrigin}.\n`
        : '') +
      (fr
        ? 'Votre choix est mémorisé jusqu’à l’effacement des cookies ou le redémarrage de Zuri.'
        : 'Your choice is remembered until cookies are cleared or Zuri restarts.'),
    buttons: fr ? ['Autoriser', 'Bloquer'] : ['Allow', 'Block'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  }
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options)
  return response === 0
}

/** Réinitialise les autorisations mémorisées (effacement des données). */
export function clearPermissionDecisions(): void {
  permissionDecisions.clear()
}

/**
 * Durcit une session : User-Agent sans jeton Electron, permissions refusées par défaut
 * et demandées explicitement, décisions cloisonnées par `scope`.
 */
export function hardenSession(ses: Session, scope: 'main' | 'private'): void {
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
    // Les origines opaques (data:, about:, sandbox) n'obtiennent jamais de permission.
    if (!origin) {
      callback(false)
      return
    }

    let names: string[] = [permission]
    let textKey: string = permission
    if (permission === 'media') {
      const kinds = mediaKinds((details as Electron.MediaAccessPermissionRequest).mediaTypes)
      if (!kinds.length) {
        callback(false)
        return
      }
      names = kinds.map((kind) => `media:${kind}`)
      textKey = `media:${kinds.join('+')}`
    }

    const keys = names.map((name) => `${scope}|${name}|${origin}`)
    const known = keys.map((key) => permissionDecisions.get(key))
    if (known.some((value) => value === false)) {
      callback(false)
      return
    }
    if (known.every((value) => value === true)) {
      callback(true)
      return
    }

    // Une seule boîte de dialogue par demande identique, même si la page insiste.
    const pendingKey = keys.join(',')
    let pending = pendingPrompts.get(pendingKey)
    if (!pending) {
      pending = promptPermission(origin, originOf(contents.getURL()), textKey)
        .then((granted) => {
          for (const key of keys) permissionDecisions.set(key, granted)
          return granted
        })
        .catch(() => false)
        .finally(() => pendingPrompts.delete(pendingKey))
      pendingPrompts.set(pendingKey, pending)
    }
    void pending.then(callback)
  })

  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) => {
    if (ALWAYS_ALLOWED.has(permission)) return true
    if (!PROMPTABLE.has(permission)) return false
    const origin = originOf(requestingOrigin)
    if (!origin) return false
    const name =
      permission === 'media'
        ? details.mediaType === 'audio' || details.mediaType === 'video'
          ? `media:${details.mediaType}`
          : null
        : permission
    if (!name) return false
    // Refus par défaut : seule une autorisation explicite et mémorisée ouvre l'accès.
    return permissionDecisions.get(`${scope}|${name}|${origin}`) === true
  })
}

export function defaultSession(): Session {
  return electronSession.defaultSession
}
