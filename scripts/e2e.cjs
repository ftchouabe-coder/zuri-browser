/*
 * Tests de bout en bout (sécurité et vie privée) sur l'application compilée.
 * Lance Zuri sur un profil jetable, avec un petit serveur HTTP local pour les cas
 * « cookies tiers » et « téléchargements », puis sort avec le code 0 si tout passe.
 * Usage : npm run test:e2e   (nécessite un accès réseau pour example.com / wikipedia.org)
 */
const { app, session, webContents, BrowserWindow } = require('electron')
const http = require('node:http')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { FiltersEngine } = require('@ghostery/adblocker')

const profile = join(tmpdir(), 'zuri-e2e-profile')
const downloadsDir = join(tmpdir(), 'zuri-e2e-downloads')
rmSync(profile, { recursive: true, force: true })
rmSync(downloadsDir, { recursive: true, force: true })
mkdirSync(downloadsDir, { recursive: true })

// Listes de sécurité de test, déposées comme un cache frais : aucun site réel n'est visé.
mkdirSync(join(profile, 'adblock'), { recursive: true })
const seedEngine = (file, rule) =>
  writeFileSync(join(profile, 'adblock', file), FiltersEngine.parse(rule, { loadCosmeticFilters: false }).serialize())
seedEngine('phishing.bin', '/zuri-e2e-phish/*')
seedEngine('malware.bin', '/zuri-e2e-malware/*')

// Ancien fichier de favoris en clair : doit être relu puis réécrit chiffré.
mkdirSync(join(profile, 'data'), { recursive: true })
writeFileSync(
  join(profile, 'data', 'bookmarks.json'),
  JSON.stringify([{ id: 'graine', title: 'Graine', url: 'https://example.com/graine', createdAt: 1 }])
)
app.setPath('userData', profile)
// Nom de domaine fictif résolu vers le serveur local : EasyList désactive le masquage
// générique sur localhost / 127.0.0.1, il faut donc un « vrai » nom pour le tester.
app.commandLine.appendSwitch('host-resolver-rules', 'MAP zuri-e2e.test 127.0.0.1')
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, detail) => results.push({ ok: Boolean(ok), name, detail })

// --- Serveur local : deux « sites » distincts, localhost et 127.0.0.1 -----------------
const pixelHits = []
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XqJDMAAAAASUVORK5CYII=',
  'base64'
)
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/top') {
    const port = server.address().port
    res.writeHead(200, { 'content-type': 'text/html', 'referrer-policy': 'no-referrer' })
    res.end(`<!doctype html><title>top</title><img src="http://127.0.0.1:${port}/pixel?from=third">`)
  } else if (url.pathname === '/pixel') {
    pixelHits.push({ from: url.searchParams.get('from'), cookie: req.headers.cookie ?? null })
    res.writeHead(200, { 'content-type': 'image/png', 'set-cookie': `tp_${url.searchParams.get('from')}=1; Path=/` })
    res.end(PNG)
  } else if (url.pathname.startsWith('/zuri-e2e-')) {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end('<!doctype html><meta charset="utf-8"><title>page signalée</title>')
  } else if (url.pathname === '/opener') {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end("<!doctype html><meta charset='utf-8'><title>opener</title><script>addEventListener('message', (e) => { document.title = 'reçu:' + e.data })</script>")
  } else if (url.pathname === '/popup') {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end("<!doctype html><title>popup</title><script>window.opener && window.opener.postMessage('pong', '*')</script>")
  } else if (url.pathname === '/cosmetic') {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(
      '<!doctype html><title>cosmetic</title><div id="banner" class="ad-slot">pub</div><p id="ok">contenu</p>' +
        "<script>setTimeout(() => { const d = document.createElement('div'); d.id = 'late'; d.className = 'ad-slot'; d.textContent = 'pub'; document.body.append(d) }, 400)</script>"
    )
  } else if (url.pathname === '/essai.exe') {
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="essai.exe"'
    })
    res.end(Buffer.from('MZ-not-a-real-program'))
  } else {
    res.writeHead(404)
    res.end()
  }
})

function download(contents, ses, url) {
  return new Promise((resolve) => {
    const onDownload = (_event, item) => {
      ses.removeListener('will-download', onDownload)
      item.setSavePath(join(downloadsDir, `${Date.now()}-${item.getFilename()}`))
      item.once('done', (_e, state) => setTimeout(() => resolve({ state, path: item.getSavePath() }), 300))
    }
    ses.on('will-download', onDownload)
    contents.downloadURL(url)
  })
}

app.whenReady().then(async () => {
  await new Promise((resolve) => server.listen(0, resolve))
  const port = server.address().port
  await wait(5000)
  try {
    const main = session.fromPartition('persist:zuri')
    const priv = session.fromPartition('zuri-private')
    const ui = BrowserWindow.getAllWindows()[0].webContents
    const tabsOf = (ses) => webContents.getAllWebContents().filter((w) => w.session === ses && !w.isDestroyed())
    const zuri = (code) => ui.executeJavaScript(code)

    // --- Protocole interne et page d'erreur -------------------------------------------
    check('zuri:// sur session normale', main.protocol.isProtocolHandled('zuri'))
    check('zuri:// sur session privée', priv.protocol.isProtocolHandled('zuri'))

    const tab = tabsOf(main)[0]
    await tab.loadURL('https://example.com').catch(() => {})
    await wait(1500)

    // --- Permissions -------------------------------------------------------------------
    const notif = await tab.executeJavaScript('Notification.permission')
    const geo = await tab.executeJavaScript("navigator.permissions.query({name:'geolocation'}).then(r=>r.state)")
    check('Notification non accordée par défaut', notif !== 'granted', notif)
    check('Géolocalisation non accordée par défaut', geo !== 'granted', geo)

    await tab.executeJavaScript("location.href='zuri://error/?url=x&desc=FAUX&code=0'")
    await wait(1200)
    check('Une page web ne peut pas ouvrir zuri://', tab.getURL().startsWith('https://example.com'), tab.getURL())

    await tab.loadURL("https://zuri-audit.invalid/'-alert(1)-'").catch(() => {})
    await wait(2500)
    check("La page d'erreur s'affiche", tab.getURL().startsWith('zuri://error'), tab.getURL().slice(0, 60))
    const page = await tab.executeJavaScript(`({
      scripts: document.scripts.length,
      handlers: document.querySelectorAll('[onclick]').length,
      retry: document.querySelector('a.primary')?.getAttribute('href'),
      insecure: document.querySelector('a[href^="zuri://action/retry-insecure"]')?.getAttribute('href') ?? null
    })`)
    check("Aucun script dans la page d'erreur", page.scripts === 0 && page.handlers === 0, page)
    check('Lien « Réessayer » échappé', page.retry === "https://zuri-audit.invalid/'-alert(1)-'", page.retry)
    check('Lien HTTP avec jeton', /t=[0-9a-f-]{36}$/.test(page.insecure ?? ''), page.insecure)
    await tab.executeJavaScript(`document.querySelector('a[href^="zuri://action/retry-insecure"]').click()`)
    await wait(2500)
    const after = decodeURIComponent(tab.getURL())
    check('« Continuer en HTTP » charge la version http', after.includes('url=http://zuri-audit.invalid'), after.slice(0, 80))

    // --- Interface : CSP stricte, favicons en data: -----------------------------------
    const uiFetch = await zuri("fetch('https://example.com/').then(() => 'autorisé', () => 'bloqué')")
    check("L'interface ne peut pas joindre le réseau", uiFetch === 'bloqué', uiFetch)
    await tab.loadURL('https://www.wikipedia.org/').catch(() => {})
    await wait(4000)
    const snapshot = await zuri('window.zuri.tabs.snapshot()')
    const icon = snapshot.tabs.find((t) => t.url.includes('wikipedia'))?.favicon ?? null
    check('Favicon transmis en data:image', typeof icon === 'string' && icon.startsWith('data:image/'), icon && icon.slice(0, 30))

    // --- Cookies tiers (Referrer-Policy: no-referrer sur la page) ---------------------
    await main.cookies.set({ url: `http://127.0.0.1:${port}`, name: 'seed', value: '1' })
    await tab.loadURL(`http://localhost:${port}/top`).catch(() => {})
    await wait(1500)
    const third = pixelHits.find((hit) => hit.from === 'third')
    check('Cookie tiers non envoyé (même sans référent)', third && third.cookie === null, third)
    const jar = (await main.cookies.get({ url: `http://127.0.0.1:${port}` })).map((c) => c.name)
    check('Cookie tiers non déposé (Set-Cookie filtré)', !jar.includes('tp_third'), jar)
    await tab.loadURL(`http://127.0.0.1:${port}/pixel?from=first`).catch(() => {})
    await wait(800)
    const first = pixelHits.find((hit) => hit.from === 'first')
    const jar2 = (await main.cookies.get({ url: `http://127.0.0.1:${port}` })).map((c) => c.name)
    check('Cookies premier parti intacts', first?.cookie?.includes('seed=1') && jar2.includes('tp_first'), { first, jar2 })

    // --- Téléchargements : Mark of the Web --------------------------------------------
    const dl = await download(tab, main, `http://127.0.0.1:${port}/essai.exe`)
    let zone = ''
    try {
      zone = readFileSync(`${dl.path}:Zone.Identifier`, 'utf8')
    } catch {
      /* absent */
    }
    check('Téléchargement marqué « venant d’Internet »', dl.state === 'completed' && /ZoneId=3/.test(zone), zone.trim())

    // --- Protection anti-phishing / anti-malware --------------------------------------
    for (const [kind, path] of [['phishing', 'zuri-e2e-phish/login'], ['malware', 'zuri-e2e-malware/setup']]) {
      await tab.loadURL(`http://127.0.0.1:${port}/${path}`).catch(() => {})
      await wait(1500)
      const warned = decodeURIComponent(tab.getURL())
      const info = await tab.executeJavaScript(`({
        danger: document.body.classList.contains('danger'),
        retry: Boolean(document.querySelector('a.primary[href^="http"]')),
        proceed: document.querySelector('a[href^="zuri://action/proceed-unsafe"]')?.getAttribute('href') ?? null
      })`)
      check(
        `Avertissement ${kind} affiché`,
        warned.includes(`threat=${kind}`) && info.danger && !info.retry && /t=[0-9a-f-]{36}$/.test(info.proceed ?? ''),
        { url: warned.slice(0, 90), info }
      )
    }
    await tab.executeJavaScript(`document.querySelector('a[href^="zuri://action/proceed-unsafe"]').click()`)
    await wait(1500)
    check('« Ignorer l’avertissement » ouvre la page', tab.getURL().endsWith('/zuri-e2e-malware/setup'), tab.getURL())
    await tab.executeJavaScript("location.href = 'zuri://action/proceed-unsafe?t=00000000-0000-0000-0000-000000000000'")
    await wait(600)
    check('Lien d’action forgé par une page ignoré', tab.getURL().endsWith('/zuri-e2e-malware/setup'), tab.getURL())

    // --- Filtrage cosmétique (préchargement adblocker-electron, règles dynamiques) -----
    await zuri('window.zuri.settings.update({ httpsOnly: false })')
    await tab.loadURL(`http://zuri-e2e.test:${port}/cosmetic`).catch(() => {})
    await wait(2500)
    await zuri('window.zuri.settings.update({ httpsOnly: true })')
    const hidden = await tab.executeJavaScript(`({
      banner: getComputedStyle(document.getElementById('banner')).display,
      dynamic: document.getElementById('late') ? getComputedStyle(document.getElementById('late')).display : 'absent',
      content: getComputedStyle(document.getElementById('ok')).display
    })`)
    check(
      'Emplacements publicitaires masqués (y compris ajoutés après coup)',
      hidden.banner === 'none' && hidden.dynamic === 'none' && hidden.content !== 'none',
      hidden
    )

    // --- Fenêtres surgissantes : opener conservé, rafales limitées --------------------
    await tab.loadURL(`http://127.0.0.1:${port}/opener`).catch(() => {})
    await wait(800)
    const before = (await zuri('window.zuri.tabs.snapshot()')).tabs.length
    await tab.executeJavaScript("window.open('/popup'); true", true)
    await wait(2000)
    const afterPopup = (await zuri('window.zuri.tabs.snapshot()')).tabs.length
    check('Popup ouvert en onglet avec window.opener', afterPopup === before + 1 && tab.getTitle() === 'reçu:pong', {
      before,
      afterPopup,
      title: tab.getTitle()
    })
    await tab.executeJavaScript("for (let i = 0; i < 8; i++) window.open('about:blank'); true", true)
    await wait(1200)
    const burst = await zuri('window.zuri.tabs.snapshot()')
    const openerState = burst.tabs.find((t) => t.url.endsWith('/opener'))
    check('Rafale de popups bloquée et signalée', burst.tabs.length <= afterPopup + 1 && (openerState?.popupsBlocked ?? 0) >= 7, {
      tabs: burst.tabs.length,
      blocked: openerState?.popupsBlocked
    })
    for (const extra of burst.tabs.filter((t) => t.id !== openerState?.id && !t.url.endsWith('/opener')).slice(0)) {
      if (extra.url === '' || extra.url.endsWith('/popup') || extra.url === 'about:blank') {
        await zuri(`window.zuri.tabs.close(${JSON.stringify(extra.id)})`)
      }
    }

    // --- Chiffrement au repos ---------------------------------------------------------
    const marks = await zuri('window.zuri.data.bookmarks().then(b => b.map(x => x.url))')
    const bookmarkFile = readFileSync(join(profile, 'data', 'bookmarks.json'))
    check(
      'Favoris en clair relus puis réécrits chiffrés',
      marks.includes('https://example.com/graine') && bookmarkFile.subarray(0, 6).toString() === 'ZENC1\n' && !bookmarkFile.includes('graine'),
      { marks, head: bookmarkFile.subarray(0, 6).toString() }
    )
    check('Langue du document', (await zuri('document.documentElement.lang')) === 'fr')

    // --- Schémas, réglages et validation IPC ------------------------------------------
    const search = await zuri("window.zuri.app.searchUrl('javascript:alert(1)')")
    check('javascript: tapé → recherche', search.startsWith('https://duckduckgo.com/'), search)
    const port8080 = await zuri("window.zuri.app.searchUrl('example.com:8080/x')")
    check('hôte:port → https', port8080 === 'https://example.com:8080/x', port8080)
    const bad = await zuri("window.zuri.data.addBookmark('x', 'javascript:alert(1)').then(() => 'accepté', () => 'refusé')")
    check('Favori javascript: refusé', bad === 'refusé', bad)
    const hp1 = await zuri("window.zuri.settings.update({ homepage: 'javascript:alert(1)' }).then(s => s.homepage)")
    const hp2 = await zuri("window.zuri.settings.update({ homepage: 'example.com' }).then(s => s.homepage)")
    check("Page d'accueil validée", hp1 === '' && hp2 === 'https://example.com', { hp1, hp2 })
    await zuri("window.zuri.settings.update({ homepage: '' })")

    // --- Mode privé -------------------------------------------------------------------
    await zuri("window.zuri.tabs.create('https://example.org/prive', true)")
    await wait(3000)
    const ptab = tabsOf(priv)[0]
    check('Onglet privé ouvert', Boolean(ptab))
    await ptab.executeJavaScript("document.cookie = 'zuri_probe=1; max-age=3600'")
    const privDl = await download(ptab, priv, `http://127.0.0.1:${port}/essai.exe`)
    const privZone = readFileSync(`${privDl.path}:Zone.Identifier`, 'utf8')
    // Chromium pose lui-même la marque ; en privé il inscrit « about:internet » au lieu de l'URL.
    check(
      'Téléchargement privé : MOTW sans URL réelle',
      /ZoneId=3/.test(privZone) && !/https?:\/\//.test(privZone),
      privZone.trim()
    )
    const cookiesBefore = (await priv.cookies.get({})).length
    const history = await zuri('window.zuri.data.history().then(h => h.map(e => e.url))')
    check("Visite privée absente de l'historique", !history.some((u) => u.includes('example.org')), history)
    const snap = await zuri('window.zuri.tabs.snapshot()')
    const privId = snap.tabs.find((t) => t.isPrivate).id
    for (const t of snap.tabs.filter((t) => !t.isPrivate)) {
      await zuri(`window.zuri.tabs.close(${JSON.stringify(t.id)})`)
    }
    await zuri(`window.zuri.tabs.close(${JSON.stringify(privId)})`)
    await wait(1500)
    const cookiesAfter = (await priv.cookies.get({})).length
    check('Session privée purgée (dernier onglet)', cookiesBefore > 0 && cookiesAfter === 0, { cookiesBefore, cookiesAfter })
    const downloads = await zuri('window.zuri.data.downloads()')
    check('Téléchargements privés oubliés', !downloads.some((d) => d.isPrivate) && downloads.length === 1, downloads.length)

    // --- Historique : une navigation = une visite -------------------------------------
    const ntab = tabsOf(main)[0]
    await ntab.loadURL('https://example.net/').catch(() => {})
    await wait(2500)
    const entry = await zuri("window.zuri.data.history().then(h => h.find(e => e.url === 'https://example.net/'))")
    check('Une visite comptée une seule fois, titre correct', entry?.visits === 1 && entry?.title !== 'https://example.net/', entry)
    await wait(600)
    const historyFile = readFileSync(join(profile, 'data', 'history.json'))
    check(
      'Historique chiffré sur le disque',
      historyFile.subarray(0, 6).toString() === 'ZENC1\n' && !historyFile.includes('example.net'),
      historyFile.subarray(0, 12).toString()
    )
  } catch (error) {
    check('exception', false, String((error && error.stack) || error))
  }

  for (const r of results) {
    const detail = r.detail !== undefined ? ` — ${JSON.stringify(r.detail)}` : ''
    console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${r.name}${r.ok ? '' : detail}`)
  }
  const passed = results.filter((r) => r.ok).length
  console.log(`[e2e] ${passed}/${results.length} OK`)
  server.close()
  app.exit(passed === results.length ? 0 : 1)
})
