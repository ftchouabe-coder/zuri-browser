/*
 * Capture du panneau Réglages (section « Sauvegarde chiffrée ») sur un profil jetable.
 * Usage : npm run build && npx electron scripts/shot-settings.cjs  → %TEMP%\zuri-settings.png
 */
const { app } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const profile = join(tmpdir(), 'zuri-shot-profile')
mkdirSync(profile, { recursive: true })
app.setPath('userData', profile)
require('../out/main/index.js')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.on('browser-window-created', (_event, win) => {
  win.webContents.once('did-finish-load', async () => {
    await wait(2000)
    try {
      await win.webContents.executeJavaScript(
        `document.querySelector('button[title="Paramètres"], button[title="Settings"]')?.click()`
      )
      await wait(800)
      const found = await win.webContents.executeJavaScript(`(() => {
        const h = [...document.querySelectorAll('h2')].find((e) => /Sauvegarde chiffrée|Encrypted backup/.test(e.textContent))
        if (h) h.scrollIntoView({ block: 'start' })
        return Boolean(h)
      })()`)
      await wait(400)
      const image = await win.webContents.capturePage()
      const out = join(tmpdir(), 'zuri-settings.png')
      writeFileSync(out, image.toPNG())
      console.log(`[shot] section trouvée : ${found} — ${out}`)
    } catch (error) {
      console.error('[shot]', error)
    }
    app.quit()
  })
})
