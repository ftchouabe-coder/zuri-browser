import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DATA_DIR = () => {
  const dir = join(app.getPath('userData'), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Petit magasin JSON atomique (écriture temp + rename), sans dépendance native.
 * Le volume de données du MVP (favoris, historique borné, session) le justifie ;
 * une migration vers SQLite est prévue sans changer l'API appelante.
 */
export class JsonStore<T> {
  private readonly file: string
  private data: T
  private timer: NodeJS.Timeout | null = null
  private readonly fallback: T

  constructor(filename: string, defaults: T, private readonly normalize?: (raw: unknown) => T) {
    this.file = join(DATA_DIR(), filename)
    this.fallback = defaults
    this.data = this.load(defaults)
  }

  private load(defaults: T): T {
    try {
      if (!existsSync(this.file)) return structuredClone(defaults)
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as unknown
      return this.normalize ? this.normalize(raw) : (raw as T)
    } catch {
      return structuredClone(defaults)
    }
  }

  get(): T {
    return this.data
  }

  set(value: T): void {
    this.data = value
    this.schedule()
  }

  update(fn: (current: T) => T): T {
    this.data = fn(this.data)
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
    try {
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data), 'utf8')
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
