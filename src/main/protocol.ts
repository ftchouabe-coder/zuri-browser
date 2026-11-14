import { protocol, type Session } from 'electron'
import { errorPage, PAGE_HEADERS, type ThreatPage } from './error-page'
import { getSettings } from './settings'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'zuri',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false }
  }
])

function handleZuriRequest(request: Request): Response {
  let parsed: URL
  try {
    parsed = new URL(request.url)
  } catch {
    return new Response('Requête invalide', { status: 400 })
  }
  if (parsed.hostname !== 'error') return new Response('Introuvable', { status: 404 })

  const settings = getSettings()
  const url = (parsed.searchParams.get('url') ?? '').slice(0, 8192)
  const code = Number(parsed.searchParams.get('code') ?? 0)
  const description = (parsed.searchParams.get('desc') ?? '').slice(0, 300)
  const token = parsed.searchParams.get('t') ?? ''
  const kind = parsed.searchParams.get('threat')
  const threat: ThreatPage | null = kind === 'phishing' || kind === 'malware' ? { kind, token } : null

  return new Response(errorPage(url, code, description, threat ? '' : token, settings, threat), {
    headers: PAGE_HEADERS
  })
}

/** Enregistre `zuri://` sur une session (à appeler pour chaque partition d'onglets). */
export function registerInternalProtocol(ses: Session): void {
  if (ses.protocol.isProtocolHandled('zuri')) return
  ses.protocol.handle('zuri', handleZuriRequest)
}
