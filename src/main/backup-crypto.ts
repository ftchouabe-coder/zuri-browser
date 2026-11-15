import { createCipheriv, createDecipheriv, pbkdf2, pbkdf2Sync, randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

const pbkdf2Async = promisify(pbkdf2)

/**
 * Sauvegarde chiffrée par mot de passe, **identique au format Android** (`BackupCrypto.kt`) :
 * `ZBK1` | itérations (4 octets, gros-boutiste) | sel (16) | IV (12) | AES-256-GCM(données) | tag (16).
 * Clé dérivée par PBKDF2-HMAC-SHA256 ; l'en-tête entier est authentifié (AAD).
 */
export const DEFAULT_ITERATIONS = 310_000
/** Valeur réservée aux vecteurs de test (dérivation rapide), acceptée des deux côtés. */
export const TEST_ITERATIONS = 1_000
const MIN_ITERATIONS = 100_000
const MAX_ITERATIONS = 5_000_000
const MAGIC = Buffer.from('ZBK1')
const HEADER = 4 + 4 + 16 + 12
const TAG = 16

export class BackupError extends Error {
  constructor(readonly code: 'wrong-password' | 'invalid') {
    super(code === 'wrong-password' ? 'mot de passe incorrect ou fichier modifié' : "ce fichier n'est pas une sauvegarde Zuri")
  }
}

function derive(password: string, salt: Buffer, iterations: number): Buffer {
  return pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iterations, 32, 'sha256')
}

function newHeader(iterations: number): { header: Buffer; salt: Buffer; iv: Buffer } {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const header = Buffer.alloc(HEADER)
  MAGIC.copy(header, 0)
  header.writeInt32BE(iterations, 4)
  salt.copy(header, 8)
  iv.copy(header, 24)
  return { header, salt, iv }
}

function encrypt(plain: Buffer, key: Buffer, header: Buffer, iv: Buffer): Buffer {
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(header)
  const body = Buffer.concat([cipher.update(plain), cipher.final()])
  return Buffer.concat([header, body, cipher.getAuthTag()])
}

function readHeader(data: Buffer): { iterations: number; salt: Buffer; iv: Buffer } {
  if (data.length <= HEADER + TAG || !data.subarray(0, 4).equals(MAGIC)) throw new BackupError('invalid')
  const iterations = data.readInt32BE(4)
  if ((iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) && iterations !== TEST_ITERATIONS) {
    throw new BackupError('invalid')
  }
  return { iterations, salt: data.subarray(8, 24), iv: data.subarray(24, HEADER) }
}

function decrypt(data: Buffer, key: Buffer, iv: Buffer): Buffer {
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(data.subarray(0, HEADER))
  decipher.setAuthTag(data.subarray(data.length - TAG))
  try {
    return Buffer.concat([decipher.update(data.subarray(HEADER, data.length - TAG)), decipher.final()])
  } catch {
    throw new BackupError('wrong-password')
  }
}

export async function sealBackupAsync(plain: Buffer, password: string, iterations = DEFAULT_ITERATIONS): Promise<Buffer> {
  const { header, salt, iv } = newHeader(iterations)
  const key = await pbkdf2Async(Buffer.from(password, 'utf8'), salt, iterations, 32, 'sha256')
  return encrypt(plain, key, header, iv)
}

export async function openBackupAsync(data: Buffer, password: string): Promise<Buffer> {
  const { iterations, salt, iv } = readHeader(data)
  const key = await pbkdf2Async(Buffer.from(password, 'utf8'), salt, iterations, 32, 'sha256')
  return decrypt(data, key, iv)
}

export function sealBackup(plain: Buffer, password: string, iterations = DEFAULT_ITERATIONS): Buffer {
  const { header, salt, iv } = newHeader(iterations)
  return encrypt(plain, derive(password, salt, iterations), header, iv)
}

export function openBackup(data: Buffer, password: string): Buffer {
  const { iterations, salt, iv } = readHeader(data)
  return decrypt(data, derive(password, salt, iterations), iv)
}
