import { describe, expect, it } from 'vitest'
import { isThirdParty, siteOf } from '../../src/main/cookie-policy'

describe('siteOf', () => {
  it.each([
    ['https://www.example.com/a', 'example.com'],
    ['https://news.bbc.co.uk/', 'bbc.co.uk'],
    ['https://shop.jumia.com.ng/', 'jumia.com.ng'],
    ['https://a.b.c.example.co.za/', 'example.co.za'],
    ['https://alice.github.io/', 'alice.github.io'],
    ['http://192.168.1.10:8080/', '192.168.1.10'],
    ['http://localhost:3000/', 'localhost']
  ])('%s → %s', (url, site) => {
    expect(siteOf(url)).toBe(site)
  })

  it('ignore les schémas non web et les URL invalides', () => {
    expect(siteOf('zuri://error/')).toBeNull()
    expect(siteOf('pas une url')).toBeNull()
  })
})

describe('isThirdParty', () => {
  it('considère les sous-domaines d’un même site comme premier parti', () => {
    expect(isThirdParty('https://cdn.example.com/x.js', 'https://www.example.com/')).toBe(false)
  })

  it('détecte un tiers, y compris entre deux sites github.io', () => {
    expect(isThirdParty('https://tracker.net/p.gif', 'https://example.com/')).toBe(true)
    expect(isThirdParty('https://bob.github.io/', 'https://alice.github.io/')).toBe(true)
  })

  it('ne bloque pas à l’aveugle quand la page de premier niveau est inconnue', () => {
    expect(isThirdParty('https://tracker.net/p.gif', null)).toBe(false)
    expect(isThirdParty('https://tracker.net/p.gif', '')).toBe(false)
  })
})
