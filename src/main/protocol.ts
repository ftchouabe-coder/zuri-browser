import { protocol, type Session } from 'electron'
import type { Settings } from '@shared/types'
import { getSettings } from './settings'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'zuri',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false }
  }
])

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const MESSAGES: Record<number, { fr: string; en: string }> = {
  '-2': { fr: 'Échec du chargement', en: 'Failed to load' },
  '-6': { fr: 'Fichier introuvable', en: 'File not found' },
  '-7': { fr: 'Le site met trop de temps à répondre', en: 'The site took too long to respond' },
  '-21': { fr: 'Connexion interrompue par le réseau', en: 'Network connection was interrupted' },
  '-100': { fr: 'Connexion fermée', en: 'Connection closed' },
  '-101': { fr: 'Connexion réinitialisée', en: 'Connection reset' },
  '-102': { fr: 'Connexion refusée', en: 'Connection refused' },
  '-104': { fr: 'Connexion impossible', en: 'Could not connect' },
  '-105': { fr: 'Nom de domaine introuvable', en: 'Server not found' },
  '-106': { fr: 'Vous semblez hors ligne', en: 'You appear to be offline' },
  '-109': { fr: 'Hôte inaccessible', en: 'Host unreachable' },
  '-118': { fr: 'Délai de connexion dépassé', en: 'Connection timed out' },
  '-137': { fr: 'Nom de domaine introuvable', en: 'Name not resolved' },
  '-200': { fr: 'Certificat du site non valide', en: 'Site certificate is not valid' },
  '-201': { fr: 'Certificat du site expiré ou invalide', en: 'Certificate is expired or invalid' },
  '-202': { fr: 'Certificat révoqué', en: 'Certificate revoked' },
  '-501': { fr: 'Connexion non sécurisée refusée', en: 'Insecure connection refused' }
}

/** URL relançable depuis la page d'erreur : uniquement http(s), jamais de schéma actif. */
function safeRetryTarget(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : ''
  } catch {
    return ''
  }
}

const TOKEN_RE = /^[0-9a-f-]{36}$/i

/**
 * Page d'erreur interne. Elle ne contient **aucun script** (CSP `script-src 'none'`) :
 * toutes les données sont des chaînes échappées dans du texte ou des attributs `href`
 * validés, et les actions passent par des liens `zuri://action/...` interceptés par le
 * processus principal (voir `TabManager.handleInternalAction`).
 */
function errorPage(
  url: string,
  code: number,
  description: string,
  insecureToken: string,
  settings: Settings
): string {
  const fr = settings.language === 'fr'
  const message =
    MESSAGES[code]?.[settings.language] || description || (fr ? 'Erreur inconnue' : 'Unknown error')
  const target = safeRetryTarget(url)
  const retryInsecure = TOKEN_RE.test(insecureToken) && target.startsWith('https://')

  return `<!doctype html>
<html lang="${settings.language}">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}" />
<title>${fr ? 'Page inaccessible' : 'Page not available'}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
    background: #EFE6D6; color: #1B1917; padding: 32px;
    background-image:
      radial-gradient(circle at 12% 18%, rgba(36,50,91,.10) 0 12%, transparent 12.5%),
      radial-gradient(circle at 88% 78%, rgba(168,69,31,.12) 0 10%, transparent 10.5%);
    background-size: 320px 320px;
  }
  @media (prefers-color-scheme: dark) {
    body { background-color: #16130F; color: #F2EAD9;
      background-image:
        radial-gradient(circle at 12% 18%, rgba(143,163,214,.08) 0 12%, transparent 12.5%),
        radial-gradient(circle at 88% 78%, rgba(217,160,91,.10) 0 10%, transparent 10.5%); }
    .card { background: #1F1B17; border-color: #332C24; }
    .url { background: #262119; border-color: #3A3229; color: #D9CDB8; }
    .muted { color: #A99C87; }
    .ghost { color: #F2EAD9; border-color: #4A4034; }
  }
  .card {
    width: min(560px, 100%); background: #FAF7F0; border: 1px solid #DCD0BB;
    border-radius: 20px; padding: 40px 36px; box-shadow: 0 24px 60px rgba(27,25,23,.12);
  }
  .stripe { height: 6px; width: 92px; border-radius: 99px; margin-bottom: 28px;
    background: linear-gradient(90deg, #24325B 0 33%, #A8451F 33% 66%, #3F6B45 66% 100%); }
  h1 { font-size: 26px; margin: 0 0 10px; letter-spacing: -.02em; }
  p { line-height: 1.6; margin: 0 0 16px; }
  .url { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 12.5px;
    background: #F2EAD9; border: 1px solid #DCD0BB; border-radius: 10px; padding: 12px 14px;
    overflow-wrap: anywhere; margin: 18px 0 24px; }
  .code { font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: #A8451F; font-weight: 600; }
  .muted { color: #6D6355; font-size: 13px; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 26px; }
  button, a.btn {
    font: inherit; font-weight: 600; font-size: 14px; cursor: pointer;
    border-radius: 10px; padding: 11px 18px; text-decoration: none; display: inline-block;
    border: 1px solid transparent; transition: transform .12s ease, background .12s ease;
  }
  button:hover, a.btn:hover { transform: translateY(-1px); }
  .primary { background: #24325B; color: #fff; }
  .ghost { background: transparent; color: #1B1917; border-color: #C9BBA4; }
  a { color: inherit; }
</style>
</head>
<body>
  <main class="card">
    <div class="stripe"></div>
    <div class="code">${escapeHtml(message)}</div>
    <h1>${fr ? 'Cette page ne répond pas' : 'This page is not responding'}</h1>
    <p class="muted">${
      fr
        ? 'Vérifiez votre connexion, l’adresse saisie, ou réessayez dans un instant.'
        : 'Check your connection, the address, or try again in a moment.'
    }</p>
    <div class="url">${escapeHtml(target || url)}</div>
    <div class="actions">
      ${target ? `<a class="btn primary" href="${escapeHtml(target)}">${fr ? 'Réessayer' : 'Try again'}</a>` : ''}
      ${
        retryInsecure
          ? `<a class="btn ghost" href="zuri://action/retry-insecure?t=${encodeURIComponent(insecureToken)}">${
              fr ? 'Continuer en HTTP (non chiffré)' : 'Continue over HTTP (unencrypted)'
            }</a>`
          : ''
      }
      <a class="btn ghost" href="zuri://action/back">${fr ? 'Retour' : 'Go back'}</a>
    </div>
    <p class="muted" style="margin-top:22px;font-size:12px">${
      fr ? `Code d’erreur ${Number.isFinite(code) ? code : 0}` : `Error code ${Number.isFinite(code) ? code : 0}`
    } · Zuri</p>
  </main>
</body>
</html>`
}

const PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'none'; form-action 'none'; base-uri 'none'"

const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  // `frame-ancestors` n'est valable qu'en en-tête : interdit d'intégrer la page dans un site.
  'content-security-policy': `${PAGE_CSP}; frame-ancestors 'none'`,
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store'
}

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

  return new Response(errorPage(url, code, description, token, settings), {
    headers: PAGE_HEADERS
  })
}

/** Enregistre `zuri://` sur une session (à appeler pour chaque partition d'onglets). */
export function registerInternalProtocol(ses: Session): void {
  if (ses.protocol.isProtocolHandled('zuri')) return
  ses.protocol.handle('zuri', handleZuriRequest)
}
