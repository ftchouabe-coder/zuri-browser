/*
 * Test de fumée (développement uniquement).
 * Lance l'application compilée sur un profil vierge, vérifie le rendu de
 * l'interface, navigue vers un site de test, puis quitte.
 * Usage : npm run smoke
 */
const { app } = require('electron')
const { mkdirSync, rmSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

// Profil isolé : le test ne touche ni aux réglages ni aux données réelles.
const profile = join(tmpdir(), 'zuri-smoke-profile')
mkdirSync(profile, { recursive: true })
app.setPath('userData', profile)
for (const name of ['session.json', 'history.json', 'bookmarks.json', 'downloads.json']) {
  rmSync(join(profile, 'data', name), { force: true })
}

require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.on('browser-window-created', (_event, win) => {
  win.webContents.on('console-message', (_event, details) => {
    console.log(`[renderer:${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`)
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[renderer] échec de chargement ${code} ${desc} ${url}`)
  })

  win.webContents.once('did-finish-load', async () => {
    await wait(2200)
    try {
      const ui = await win.webContents.executeJavaScript(`(() => {
        const px = (selector) => {
          const el = document.querySelector(selector)
          return el ? Math.round(el.getBoundingClientRect().height) : null
        }
        return {
          title: document.title,
          theme: document.documentElement.dataset.theme,
          indigo: getComputedStyle(document.documentElement).getPropertyValue('--indigo').trim(),
          startPage: Boolean(document.querySelector('.start-page')),
          hero: document.querySelector('.hero h1')?.textContent ?? null,
          tabs: document.querySelectorAll('.tab').length,
          shortcuts: document.querySelectorAll('.shortcut').length,
          discover: document.querySelectorAll('.discover-card').length,
          tabstrip: px('.tabstrip'),
          toolbar: px('.toolbar'),
          bookmarksBar: px('.bookmarks-bar'),
          content: px('.content'),
          startScrollable:
            (document.querySelector('.start-page')?.scrollHeight ?? 0) >
            (document.querySelector('.start-page')?.clientHeight ?? 0),
          bodyOverflow: document.body.scrollHeight > window.innerHeight,
          aria: {
            switches: document.querySelectorAll('[role="switch"]').length,
            tabs: document.querySelectorAll('[role="tab"]').length
          }
        }
      })()`)
      console.log('[smoke] interface :', JSON.stringify(ui))

      const image = await win.webContents.capturePage()
      const file = join(tmpdir(), 'zuri-smoke.png')
      writeFileSync(file, image.toPNG())
      console.log(`[smoke] capture ${file}`)

      const before = await win.webContents.executeJavaScript(
        'window.zuri.tabs.snapshot().then((s) => ({ id: s.activeId, tabs: s.tabs.length }))'
      )
      console.log('[smoke] onglet actif :', JSON.stringify(before))

      await win.webContents.executeJavaScript(
        `window.zuri.tabs.navigate(${JSON.stringify(before.id)}, 'https://example.com')`
      )

      // Attend la fin du chargement et, si possible, la mise en place des filtres.
      const readState = () =>
        win.webContents.executeJavaScript(`Promise.all([
          window.zuri.tabs.snapshot(),
          window.zuri.data.history(),
          window.zuri.privacy.state()
        ]).then(([s, h, p]) => ({
          tab: s.tabs.find((t) => t.id === s.activeId),
          history: h.slice(0, 3).map((e) => e.url),
          blocked: p.totalBlocked,
          filtersReady: p.ready
        }))`)

      let after = await readState()
      for (let i = 0; i < 24 && (after.tab?.loading || !after.filtersReady); i += 1) {
        await wait(500)
        after = await readState()
      }
      console.log('[smoke] navigation :', JSON.stringify(after))
    } catch (error) {
      console.error('[smoke] échec', error)
    } finally {
      app.quit()
    }
  })
})
