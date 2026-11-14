import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/types'
import { isHttpUrl, resolveInput, toNavigableUrl } from '../../src/main/search'

const settings = { ...DEFAULT_SETTINGS, searchEngine: 'duckduckgo' as const }
const ddg = (q: string): string => `https://duckduckgo.com/?q=${encodeURIComponent(q)}`

describe('toNavigableUrl', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['example.com:8080/x', 'https://example.com:8080/x'],
    ['https://example.com/a?b=1', 'https://example.com/a?b=1'],
    ['HTTP://Example.com', 'http://example.com/'],
    ['localhost:3000', 'http://localhost:3000'],
    ['127.0.0.1', 'http://127.0.0.1'],
    ['[::1]:8080/', 'http://[::1]:8080/'],
    ['afrique.école', 'https://afrique.école']
  ])('%s → %s', (input, expected) => {
    expect(toNavigableUrl(input)).toBe(expected)
  })

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///C:/Windows/win.ini',
    'zuri://error/?desc=x',
    'ms-settings:privacy',
    'bonjour le monde',
    ''
  ])('refuse %s', (input) => {
    expect(toNavigableUrl(input)).toBeNull()
  })

  it('accepte file: uniquement sur demande explicite', () => {
    expect(toNavigableUrl('file:///C:/tmp/a.txt', { allowFile: true })).toBe('file:///C:/tmp/a.txt')
  })
})

describe('resolveInput', () => {
  it('transforme les schémas actifs en recherche, sans les exécuter', () => {
    expect(resolveInput('javascript:alert(1)', settings)).toBe(ddg('javascript:alert(1)'))
  })

  it('recherche un texte libre avec le moteur choisi', () => {
    expect(resolveInput('météo Dakar', settings)).toBe(ddg('météo Dakar'))
    expect(resolveInput('x', { ...settings, searchEngine: 'qwant' })).toBe('https://www.qwant.com/?q=x')
  })

  it('renvoie une chaîne vide pour une saisie vide', () => {
    expect(resolveInput('   ', settings)).toBe('')
  })
})

describe('isHttpUrl', () => {
  it('reconnaît http(s) sans tenir compte de la casse', () => {
    expect(isHttpUrl('HTTPS://a.b')).toBe(true)
    expect(isHttpUrl('http://a.b')).toBe(true)
    expect(isHttpUrl('httpx://a.b')).toBe(false)
    expect(isHttpUrl('javascript:http://a.b')).toBe(false)
  })
})
