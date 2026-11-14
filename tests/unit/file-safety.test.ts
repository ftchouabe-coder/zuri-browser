import { describe, expect, it } from 'vitest'
import { extensionOf, isDangerousFile, zoneIdentifier } from '../../src/main/file-safety'

describe('isDangerousFile', () => {
  it.each(['setup.exe', 'FACTURE.PDF.EXE', 'script.ps1', 'a.js', 'raccourci.lnk', 'b.msi', 'c.hta', 'macro.docm'])(
    '%s est dangereux',
    (name) => expect(isDangerousFile(name)).toBe(true)
  )

  it.each(['rapport.pdf', 'photo.jpg', 'notes.txt', 'archive.zip', 'sans_extension', '.exe'])(
    '%s ne l’est pas',
    (name) => expect(isDangerousFile(name)).toBe(false)
  )

  it('ignore les points et espaces de fin que Windows supprime', () => {
    expect(extensionOf('virus.exe. . ')).toBe('exe')
    expect(isDangerousFile('virus.exe...')).toBe(true)
    expect(extensionOf('C:\\Users\\a\\Downloads\\x.BAT')).toBe('bat')
  })
})

describe('zoneIdentifier', () => {
  it('marque le fichier comme venant d’Internet (zone 3) avec son URL', () => {
    const text = zoneIdentifier('https://user:pw@example.com/f.exe', '', false)
    expect(text).toBe('[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://example.com/f.exe\r\n')
  })

  it('n’inscrit aucune URL en navigation privée', () => {
    expect(zoneIdentifier('https://example.com/f.exe', 'https://example.com/', true)).toBe(
      '[ZoneTransfer]\r\nZoneId=3\r\n'
    )
  })

  it('refuse l’injection de lignes', () => {
    const text = zoneIdentifier('https://example.com/a\r\nZoneId=0', '', false)
    const lines = text.split('\r\n')
    expect(lines.filter((line) => line.startsWith('ZoneId='))).toEqual(['ZoneId=3'])
    expect(lines.filter((line) => line.startsWith('HostUrl='))).toHaveLength(1)
  })
})
