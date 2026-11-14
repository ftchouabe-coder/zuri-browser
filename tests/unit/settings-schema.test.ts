import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types'
import { sanitizeSettings } from '../../src/main/settings-schema'

describe('sanitizeSettings', () => {
  it('rend les valeurs par défaut pour une entrée absente ou corrompue', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings('texte')).toEqual(DEFAULT_SETTINGS)
  })

  it('protège la vie privée et les mises à jour par défaut', () => {
    const s = sanitizeSettings({})
    expect(s.adblock && s.httpsOnly && s.blockThirdPartyCookies && s.autoUpdate).toBe(true)
  })

  it('rejette les types et énumérations inconnus', () => {
    const s = sanitizeSettings({ theme: 'rose', dns: 'evil', searchEngine: 'x', adblock: 'false', autoUpdate: 0 })
    expect(s.theme).toBe(DEFAULT_SETTINGS.theme)
    expect(s.dns).toBe(DEFAULT_SETTINGS.dns)
    expect(s.searchEngine).toBe(DEFAULT_SETTINGS.searchEngine)
    expect(s.adblock).toBe(true)
    expect(s.autoUpdate).toBe(true)
  })

  it('n’accepte qu’une page d’accueil http(s), normalisée', () => {
    expect(sanitizeSettings({ homepage: 'example.com' }).homepage).toBe('https://example.com')
    expect(sanitizeSettings({ homepage: 'javascript:alert(1)' }).homepage).toBe('')
    expect(sanitizeSettings({ homepage: 'file:///C:/' }).homepage).toBe('')
    expect(sanitizeSettings({ homepage: '' }).homepage).toBe('')
  })

  it('ignore les clés inconnues', () => {
    expect(sanitizeSettings({ __proto__: { adblock: false }, polluted: true })).not.toHaveProperty('polluted')
  })
})
