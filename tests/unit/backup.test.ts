import { describe, expect, it } from 'vitest'
import { BackupError, openBackup, sealBackup, TEST_ITERATIONS } from '../../src/main/backup-crypto'
import { buildBackup, parseBackup } from '../../src/main/backup-format'
import { DEFAULT_SETTINGS } from '../../src/shared/types'

const password = 'kribi-2026!'

describe('sauvegarde chiffrée (format ZBK1)', () => {
  it('aller-retour, sans texte en clair', () => {
    const plain = Buffer.from('{"bookmarks":[{"u":"https://jumia.com.ng/"}]}')
    const sealed = sealBackup(plain, password, TEST_ITERATIONS)
    expect(sealed.subarray(0, 4).toString()).toBe('ZBK1')
    expect(sealed.toString('latin1')).not.toContain('jumia')
    expect(openBackup(sealed, password).equals(plain)).toBe(true)
  })

  it('refuse un mauvais mot de passe, un en-tête modifié, des itérations faibles', () => {
    const sealed = sealBackup(Buffer.from('x'.repeat(40)), password, TEST_ITERATIONS)
    expect(() => openBackup(sealed, 'autre')).toThrow(BackupError)
    const salt = Buffer.from(sealed)
    salt[10] ^= 1
    expect(() => openBackup(salt, password)).toThrowError(/mot de passe/)
    const weak = Buffer.from(sealed)
    weak.writeInt32BE(1, 4)
    expect(() => openBackup(weak, password)).toThrowError(/pas une sauvegarde/)
    expect(() => openBackup(Buffer.from('PK\u0003\u0004zip'), password)).toThrowError(/pas une sauvegarde/)
  })

  it('relit un fichier produit par la version Android', () => {
    // Vecteur généré par BackupCrypto.kt (test « vecteurPourLeBureau »), mot de passe « kribi-2026! ».
    const fromAndroid = Buffer.from(ANDROID_VECTOR, 'base64')
    expect(openBackup(fromAndroid, password).toString('utf8')).toBe(VECTOR_PLAIN)
  })
})

describe('contenu commun bureau ↔ Android', () => {
  it('construit puis relit la même structure', () => {
    const json = buildBackup(
      [{ id: 'a', title: 'Jumia', url: 'https://jumia.com.ng/', createdAt: 5 }],
      [{ url: 'https://fr.wikipedia.org/wiki/Douala', title: 'Douala', visitedAt: 9, visits: 3 }],
      { ...DEFAULT_SETTINGS, cosmeticFilters: false },
      1
    )
    const parsed = parseBackup(JSON.parse(JSON.stringify(json)))
    expect(parsed?.bookmarks).toEqual([{ url: 'https://jumia.com.ng/', title: 'Jumia', time: 5 }])
    expect(parsed?.history[0].url).toBe('https://fr.wikipedia.org/wiki/Douala')
    expect(parsed?.settings.cosmeticFilters).toBe(false)
  })

  it('écarte les entrées dangereuses et les fichiers étrangers', () => {
    const parsed = parseBackup({
      format: 'zuri-sauvegarde',
      bookmarks: [{ u: 'javascript:alert(1)' }, { u: 'https://ok.test/', t: 7 }, null],
      history: 'pas une liste',
      offline: [{}, {}],
      settings: { adblock: 'oui', httpsOnly: false, lockPrivate: true }
    })
    expect(parsed?.bookmarks).toEqual([{ url: 'https://ok.test/', title: '', time: 0 }])
    expect(parsed?.history).toEqual([])
    expect(parsed?.offlineCount).toBe(2)
    expect(parsed?.settings).toEqual({ httpsOnly: false })
    expect(parseBackup({ format: 'autre' })).toBeNull()
  })
})

const VECTOR_PLAIN = '{"format":"zuri-sauvegarde","v":1,"bookmarks":[{"u":"https://jumia.com.ng/","t":"Jumia","d":5}]}'
const ANDROID_VECTOR = 'WkJLMQAAA+j5wJENDsHxYJ7o7kg/6iH1Yi3xPeWGOE21zi/p33lPnGSpSGgS3kPGhT2K9teGVBZPAXV7TM7C6Lwvg91K9sMLGFQc4RZjo/I1i60ZdcROXom10ceXREJ6hFDyls947wDXYUNtnASFjgec3bUy9W+OWS0q9Q5DqeZvJ0+GySQz9Eti/EoWhKFSQHntdw=='
