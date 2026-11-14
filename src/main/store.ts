import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DATA_DIR = (): string => {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** En-tête des fichiers chiffrés (`ZENC` + version), suivi du bloc `safeStorage`. */
const MAGIC = Buffer.from('ZENC1\n', 'utf8')

let warnedUnavailable = false

function encryptionAvailable(): boolean {
  const available = safeStorage.isEncryptionAvailable()
  if (!available && !warnedUnavailable) {
    warnedUnavailable = true
    console.warn('[store] chiffrement du système indisponible : données écrites en clair')
  }
  return available
}

export interface JsonStoreOptions<T> {
  /** Valide et normalise le contenu lu sur disque. */
  normalize?: (raw: unknown) => T
  /**
   * Chiffre le fichier au repos avec `safeStorage` (DPAPI sous Windows, trousseau sous
   * macOS, libsecret sous Linux) : un autre compte de la machine, ou quelqu'un qui copie
   * le disque, ne peut pas lire l'historique ni les favoris.
   */
  encrypted?: boolean
}

/**
 * Petit magasin JSON atomique (écriture temp + rename), sans dépendance native.
 * Le contenu est chargé à la première lecture : `safeStorage` n'est utilisable
 * qu'après l'événement `ready` de l'application.
 */
export class JsonStore<T> {
  private readonly file: string
  private data: T | undefined
  private timer: NodeJS.Timeout | null = null
  private readonly fallback: T
  private readonly normalize?: (raw: unknown) => T
  private readonly encrypted: boolean

  constructor(filename: string, defaults: T, options: JsonStoreOptions<T> | ((raw: unknown) => T) = {}) {
    const opts = typeof options === 'function' ? { normalize: options } : options
    this.file = join(DATA_DIR(), filename)
    this.fallback = defaults
    this.normalize = opts.normalize
    this.encrypted = Boolean(opts.encrypted)
  }

  private ensure(): T {
    if (this.data === undefined) this.data = this.load()
    return this.data
  }

  private parse(text: string): T {
    const raw = JSON.parse(text) as unknown
    return this.normalize ? this.normalize(raw) : (raw as T)
  }

  private load(): T {
    if (this.encrypted && !app.isReady()) {
      throw new Error(`[store] ${this.file} lu avant app.ready : safeStorage indisponible`)
    }
    try {
      if (!existsSync(this.file)) return structuredClone(this.fallback)
      const bytes = readFileSync(this.file)
      if (bytes.subarray(0, MAGIC.length).equals(MAGIC)) {
        return this.parse(safeStorage.decryptString(bytes.subarray(MAGIC.length)))
      }
      // Ancien fichier en clair : lu tel quel, il sera réécrit chiffré au prochain flush.
      const value = this.parse(bytes.toString('utf8'))
      if (this.encrypted) this.schedule()
      return value
    } catch (error) {
      // Fichier illisible (corrompu, ou chiffré par un autre compte Windows) : on le met
      // de côté plutôt que de l'écraser, et on repart de zéro.
      console.error('[store] lecture impossible, fichier mis de côté', this.file, error)
      try {
        if (existsSync(this.file)) renameSync(this.file, `${this.file}.illisible-${Date.now()}`)
      } catch {
        /* ignore */
      }
      return structuredClone(this.fallback)
    }
  }

  get(): T {
    return this.ensure()
  }

  set(value: T): void {
    this.data = value
    this.schedule()
  }

  update(fn: (current: T) => T): T {
    this.data = fn(this.ensure())
    this.schedule()
    return this.data
  }

  reset(): T {
    this.data = structuredClone(this.fallback)
    this.schedule()
    return this.data
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), 250)
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.data === undefined) return
    try {
      const json = JSON.stringify(this.data)
      const payload =
        this.encrypted && encryptionAvailable()
          ? Buffer.concat([MAGIC, safeStorage.encryptString(json)])
          : Buffer.from(json, 'utf8')
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, payload)
      renameSync(tmp, this.file)
    } catch (error) {
      console.error('[store] écriture impossible', error)
    }
  }

  /** Écriture immédiate (fermeture de l'application). */
  flushNow(): void {
    this.flush()
  }

  destroyFile(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      if (existsSync(this.file)) unlinkSync(this.file)
    } catch {
      /* ignore */
    }
  }
}
