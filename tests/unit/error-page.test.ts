import { describe, expect, it } from 'vitest'
import { errorPage, PAGE_HEADERS } from '../../src/main/error-page'

const fr = { language: 'fr' as const }
const TOKEN = '7944eb5f-0b05-4e68-a413-814202211978'

describe('errorPage', () => {
  it('ne contient aucun script ni gestionnaire d’événement', () => {
    const html = errorPage("https://x.invalid/'-alert(1)-'", -105, '', TOKEN, fr)
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/\son[a-z]+\s*=/i)
    expect(html).not.toMatch(/javascript:/i)
  })

  it('échappe l’URL et la description', () => {
    const html = errorPage('https://x.invalid/"><img src=x onerror=alert(1)>', 0, '<b>faux</b>', '', fr)
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>faux</b>')
    expect(html).toContain('&lt;b&gt;faux&lt;/b&gt;')
  })

  it('ne propose « Réessayer » que pour une URL http(s)', () => {
    expect(errorPage('javascript:alert(1)', 0, '', '', fr)).not.toContain('btn primary')
    expect(errorPage('https://example.com/', -105, '', '', fr)).toContain('href="https://example.com/"')
  })

  it('n’affiche « Continuer en HTTP » qu’avec un jeton valide', () => {
    const url = 'https://example.com/'
    expect(errorPage(url, -501, '', '', fr)).not.toContain('retry-insecure')
    expect(errorPage(url, -501, '', 'forge"onclick=x', fr)).not.toContain('retry-insecure')
    expect(errorPage(url, -501, '', TOKEN, fr)).toContain(`zuri://action/retry-insecure?t=${TOKEN}`)
  })

  it('utilise le message traduit et un code numérique', () => {
    const html = errorPage('https://example.com/', -105, 'ERR_NAME_NOT_RESOLVED', '', { language: 'en' })
    expect(html).toContain('Server not found')
    expect(errorPage('https://example.com/', Number('abc'), '', '', fr)).toContain('Code d’erreur 0')
  })
})

describe('PAGE_HEADERS', () => {
  it('interdit scripts et intégration dans un cadre', () => {
    const csp = PAGE_HEADERS['content-security-policy']
    expect(csp).toContain("script-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
  })
})
