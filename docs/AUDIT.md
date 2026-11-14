# AUDIT — Zuri 0.1.0 (revue de code et de sécurité)

> 14/11/2026 · périmètre : `src/` (main, preload, renderer, shared), configuration de build, scripts.
> Méthode : lecture intégrale du processus principal et du preload, lecture ciblée du renderer,
> `npm run typecheck`, `npm audit`, puis **sonde dynamique** lancée sur l'application compilée (`out/`)
> avec un profil jetable pour confirmer les points marqués ✅.

> **Mise à jour du 14/11/2026 — Sprint 0 appliqué** : C1, C2, C3, E5 et E6 sont corrigés
> (`history.ts`, `privacy.ts`, `protocol.ts`, `sessions.ts`, `search.ts`, `tabs.ts`, `ipc.ts`).
> Une sonde dynamique de 17 contrôles passe à 17/17 : permissions `denied` par défaut, page
> d'erreur servie sans script, `zuri://` inaccessible depuis le web, lien HTTP à jeton,
> aucune visite privée dans l'historique, purge du dernier onglet privé, une visite comptée
> une fois, schémas `javascript:` refusés, IPC validée. Le test de fumée passe toujours.
> Restent ouverts : E1–E4, E7, M1–M8.
>
> **Mise à jour du 14/11/2026 — Sprint 1 appliqué** :
> - **E1** : `electron-updater` (GitHub Releases, SHA-512, pas de retour en arrière, réglage « Mises à jour automatiques » actif par défaut ; ne concerne pas la version portable) et fuses Electron appliquées au packaging (`RunAsNode`, `NODE_OPTIONS`, `--inspect` désactivés ; intégrité de l'asar, chargement depuis l'asar uniquement, chiffrement des cookies activés). `GrantFileProtocolExtraPrivileges` reste actif car l'interface est chargée en `file://`.
> - **E3** : confirmation avant d'ouvrir un exécutable ou un document à macros. Mark of the Web vérifiée (Chromium la pose déjà ; repli maison sinon). Téléchargements privés annulés et oubliés en fin de session privée.
> - **E4** : site de premier niveau déterminé depuis l'onglet (plus seulement le référent), Public Suffix List via `tldts`, `Set-Cookie` tiers filtré. Limite résiduelle : `document.cookie` dans une iframe tierce n'est pas bloqué.
> - **E7** : favicons téléchargés par la session de l'onglet, sans cookies, et transmis en `data:`. CSP de l'interface stricte en production (`connect-src 'self'`, `img-src 'self' data:`, aucun script inline).
> - **M1** : « Effacer à la fermeture » supprime aussi l'historique, le cache et les identifiants HTTP. **M3** : page d'accueil validée et normalisée.
> - **Tests** : 62 tests unitaires (Vitest), suite de bout en bout `npm run test:e2e` de 26 contrôles avec code de sortie, CI GitHub Actions (Windows) et Dependabot.
>
> Restent ouverts : E2 (anti-phishing), M2 (popups/opener), M4 (`adblocker-electron`), M5 (chiffrement au repos), M6 (traité en partie), M7, M8, signature de code.

---

## 1. État d'avancement

**Base de départ.** L'architecture est saine et conforme à `docs/ANALYSE.md` :
- fenêtre UI en `sandbox` + `contextIsolation` sans `nodeIntegration` ;
- onglets en `WebContentsView` **sans preload**, donc le contenu web n'a aucun accès IPC ;
- `contextBridge` avec liste blanche d'événements ;
- deux partitions (normale persistante et privée en mémoire) ;
- User-Agent nettoyé (✅ aucun jeton `Electron`/`Zuri`) ;
- `npm run typecheck` passe et `npm audit --omit=dev` remonte 0 vulnérabilité ;
- 113 225 règles réseau et 92 579 règles cosmétiques chargées.

| Bloc du MVP (ANALYSE §7) | État |
|---|---|
| Onglets, restauration, omnibox, navigation, raccourcis, menus | ✔ fait |
| Favoris, historique, téléchargements, impression | ✔ fait (défauts §3) |
| Anti-pub, HTTPS-only, DoH, référent tronqué | ✔ fait |
| Cookies tiers bloqués | ⚠ partiel, contournable (E4) |
| Mode privé | ⚠ **fuit dans l'historique** (C1) |
| Permissions par origine | ⚠ **accordées par défaut** (C2) |
| Page d'erreur interne | ✖ **jamais affichée** dans les onglets (C3) |
| Mise à jour automatique signée | ✖ absente (E1) |
| Stockage chiffré au repos, SQLite | ✖ JSON en clair |
| Tests (Vitest/Playwright), ESLint, CI, Dependabot | ✖ absents : le test de fumée n'échoue jamais |
| Signature de code, fuses Electron | ✖ absentes |

**Verdict.** On a un MVP fonctionnel et bien structuré, mais il **n'est pas encore publiable comme « navigateur privé »**. Trois défauts critiques contredisent directement la promesse du produit.

---

## 2. Défauts critiques

### C1 — La navigation privée est écrite dans l'historique
`src/main/tabs.ts:159` et `src/main/tabs.ts:193` appellent `recordVisit()` sans tester `tab.isPrivate`. Toute page visitée en onglet privé finit dans `history.json`, sur le disque et en clair.

```ts
// tabs.ts — dans les deux handlers
if (!tab.isPrivate && /^https?:/i.test(url)) recordVisit(url, title)
```

Il y a aussi un **double comptage** des visites. `did-navigate` incrémente `visits`, puis `page-title-updated` l'incrémente à nouveau, et encore à chaque changement de titre (sur une SPA, le compteur s'emballe). La correction : `did-navigate` enregistre la visite, et `page-title-updated` ne fait que **mettre à jour le titre** (ajouter une fonction `updateTitle(url, title)` dans `history.ts`).

### C2 — Les permissions sont accordées par défaut ✅
`src/main/privacy.ts:407` : `permissionDecisions.get(...) ?? true`.
La sonde le confirme : sur `https://example.com`, sans aucune décision de l'utilisateur, `Notification.permission === "granted"` et `navigator.permissions.query({name:'geolocation'})` renvoie `"granted"`. Conséquences : les sites croient avoir l'autorisation, l'empreinte du navigateur devient atypique, et certaines API qui ne passent que par le *check handler* sont réellement ouvertes.

```ts
return permissionDecisions.get(`${permission}|${originOf(requestingOrigin)}`) ?? false
```

Il faut aussi :
- **séparer les décisions entre la session normale et la session privée**. Aujourd'hui elles partagent la même `Map`, donc une autorisation donnée en privé reste valable hors privé, et inversement. Ajouter l'identité de la session dans la clé, ou utiliser une `Map` par session ;
- pour `media`, inclure `details.mediaTypes` (audio/vidéo) dans la clé ;
- rendre la boîte de dialogue modale sur `mainWindow` et dédupliquer les demandes simultanées ;
- corriger le texte « changez d'avis en rechargeant la page », qui est faux puisque la décision reste mémorisée.

### C3 — Page d'erreur `zuri://` : cassée, avec une XSS latente et une usurpation possible ✅
1. **Elle n'est jamais servie dans les onglets.** `protocol.handle('zuri', …)` (`protocol.ts:128`) ne s'applique qu'à `session.defaultSession`. La sonde donne `isProtocolHandled('zuri')` : `true` pour la session par défaut, **`false`** pour `persist:zuri` et pour `zuri-private`. Toutes les pages d'erreur et le bouton « Continuer en HTTP » sont donc inopérants.
2. **XSS dès que (1) sera corrigé.** `protocol.ts:113` : `onclick="location.href='${escapeHtml(target)}'"`. Le navigateur décode les entités HTML d'un attribut avant d'exécuter le JavaScript, donc `&#39;` redevient `'`. La sonde confirme que `https://x.invalid/'-alert(1)-'` arrive intact dans `validatedURL`. La CSP de la page autorise `script-src 'unsafe-inline'`.
3. **Usurpation.** `tabs.ts:152` laisse toute page web naviguer vers `zuri://…`. Un site pourrait alors afficher une fausse page « navigateur » (`desc=` librement choisi), ou déclencher `zuri://retry-insecure` pour contourner HTTPS-only.

Correctif recommandé :
```ts
// sessions.ts — enregistrer le protocole sur chaque partition
for (const ses of [getMainSession(), getPrivateSession()]) ses.protocol.handle('zuri', handler)

// tabs.ts — seul le processus principal peut charger zuri://
contents.on('will-navigate', (event, url) => {
  if (url.startsWith('zuri://') && !contents.getURL().startsWith('zuri://')) event.preventDefault()
  ...
})
```
Dans la page d'erreur, il ne faut **aucun script** (`script-src 'none'`). Utiliser un `<a href="…">` dont l'URL est d'abord validée en `http(s)` puis échappée, et un lien « Retour » fourni par le processus principal. Protéger `retry-insecure` par un **jeton à usage unique** généré côté main et lié à l'onglet.

---

## 3. Sévérité élevée

**E1 — Pas de mise à jour automatique ni de durcissement du binaire.** Un navigateur Electron qui ne se met pas à jour embarque un Chromium vulnérable au bout de quelques semaines : c'est le risque n°1 du projet. Il faut :
- `electron-updater` sur GitHub Releases avec signature ;
- un rythme de mise à jour d'Electron calé sur chaque version de sécurité ;
- les **fuses** via `@electron/fuses` dans un hook `afterPack` : `RunAsNode=false`, `EnableNodeOptionsEnvironmentVariable=false`, `EnableNodeCliInspectArguments=false`, `EnableEmbeddedAsarIntegrityValidation=true`, `OnlyLoadAppFromAsar=true`, `EnableCookieEncryption=true` ;
- la signature de code (déjà notée dans ANALYSE §8).

**E2 — Aucune protection anti-phishing ni anti-malware.** Electron n'intègre pas Google Safe Browsing, et rien ne le remplace. Il faut au minimum ajouter des listes dédiées au moteur Ghostery (par exemple les listes *malware-filter* URLhaus et Phishing) et l'indiquer clairement dans le README.

**E3 — Téléchargements** (`downloads.ts`).
- `openDownload` lance le fichier d'un seul clic, y compris `.exe`, `.msi`, `.bat`, `.ps1`, `.js`, `.vbs`, `.hta`, `.lnk` et `.scr`. Ajouter une confirmation pour ces extensions et vérifier que la *Mark of the Web* (`Zone.Identifier`) est bien posée.
- Les téléchargements privés restent listés après la fin de la session privée : il faut les purger avec elle.

**E4 — Blocage des cookies tiers contournable** (`privacy.ts:242`).
- Il repose sur `details.referrer`. Avec `Referrer-Policy: no-referrer` ce champ est vide, et **les cookies tiers sont alors envoyés**.
- Il ignore `Set-Cookie` dans les réponses, donc un tiers peut toujours déposer ses cookies.
- Il ignore aussi `document.cookie` dans les iframes.
- La liste d'eTLD maison (`siteKey`) est incomplète.

Correctif : déterminer le site de premier niveau via `details.frame?.top?.url` ou l'URL du `webContents`, utiliser `tldts` (liste publique des suffixes), et filtrer `Set-Cookie` dans `onHeadersReceived`.

**E5 — La session privée n'est pas purgée si l'onglet privé était le dernier** (`tabs.ts:396-403`). Le `return` placé après `this.create()` saute la purge. Par ailleurs, `clearCounters()` remet à zéro les compteurs de **tous** les onglets.

**E6 — L'IPC fait confiance à l'appelant.** Les handlers de `ipc.ts` ne vérifient ni l'émetteur ni les types des arguments. Ce n'est pas exploitable depuis le web aujourd'hui, mais une XSS dans l'interface donnerait un contrôle total. Ajouter un garde commun :
```ts
const trusted = (e: IpcMainInvokeEvent) => e.sender === ctx?.window.webContents
```
et valider chaque argument (chaînes, booléens, bornes). Autre point : `navigate()` accepte n'importe quel schéma (`search.ts:221` renvoie tel quel tout ce qui ressemble à `xxx:`). Le menu contextuel « Ouvrir le lien dans un nouvel onglet » permet donc à une page de faire charger `file:///…` ou `javascript:` par `loadURL`, ce qui **contourne `will-navigate`**. Restreindre les schémas autorisés (http, https, et zuri depuis le processus principal uniquement), et réserver `file:` à une saisie explicite dans l'omnibox, si on veut le garder.

**E7 — Les favicons fuient hors de la partition.** L'`<img src={tab.favicon}>` (`TabStrip.tsx:73`) est chargé par la fenêtre UI, donc par la **session par défaut** : persistante, sans anti-pub, et partagée par tous les onglets. Pour un onglet privé, c'est une requête tierce faite avec un autre jeu de cookies, utilisable comme pixel de suivi. Correctif : récupérer le favicon dans le processus principal avec `session.fetch` de la session de l'onglet, le transmettre en `data:`, et passer la CSP de l'UI à `img-src 'self' data:`.

---

## 4. Sévérité moyenne

| # | Constat | Emplacement | Recommandation |
|---|---|---|---|
| M1 | « Effacer à la fermeture » ne supprime ni l'historique, ni le cache HTTP, ni la liste des téléchargements | `index.ts:243` | Ajouter `clearHistory()`, `clearCache()`, `clearAuthCache()` et la purge des téléchargements |
| M2 | `window.open` crée un onglet **sans `opener`** et sans contrôle de geste utilisateur : les connexions OAuth en popup (Google, PayPal…) cassent, et le spam d'onglets est possible | `tabs.ts:141` | `action: 'allow'` + `createWindow` pour garder l'opener, quota de popups sans geste utilisateur |
| M3 | La page d'accueil n'est pas passée par `resolveInput` (`exemple.com` échoue) et accepte n'importe quel schéma | `tabs.ts:425`, `settings.ts:87` | Résoudre l'URL et valider `http(s)` dans `sanitizeSettings` |
| M4 | Filtrage cosmétique minimal : CSS injecté seulement à `did-stop-loading` (et réinjecté à chaque chargement), sans scriptlets ni règles génériques sur le DOM | `privacy.ts:260` | Passer à `@ghostery/adblocker-electron`, prévu dans ANALYSE §3 |
| M5 | Historique, favoris et session en clair sur le disque, alors que ANALYSE §4 promet un chiffrement au repos | `store.ts` | `safeStorage` (DPAPI), puis SQLite |
| M6 | CSP de l'UI trop large en production : `ws:`, `wss:`, `http://localhost:*` et `img-src https:` | `renderer/index.html` | CSP séparée dev/prod, `connect-src 'self'` en prod |
| M7 | `uncaughtException` est avalée et l'application continue dans un état inconnu | `index.ts:264` | Journaliser puis redémarrer proprement |
| M8 | Le README et la liste des licences ne mentionnent qu'EasyList/EasyPrivacy, alors que le code télécharge aussi deux listes Fanboy. Il dit aussi les permissions « mémorisées localement » alors qu'elles sont en mémoire et perdues au redémarrage | `privacy.ts:17` | Aligner la documentation et les attributions |

---

## 5. Qualité et dette technique

- **Tests.** `scripts/smoke.cjs` affiche des valeurs mais ne vérifie rien et sort toujours avec le code 0. Ajouter :
  - Vitest pour `resolveInput`, `sanitizeSettings`, `siteKey`, l'échappement de la page d'erreur et le magasin d'historique ;
  - Playwright (`_electron`) pour la navigation, le mode privé (aucune entrée dans l'historique) et les permissions refusées par défaut.
- **CI.** Prévoir une GitHub Action qui lance `typecheck`, ESLint (`eslint-plugin-security`), Vitest et `npm audit`, et activer Dependabot.
- **i18n.** Le menu contextuel (`tabs.ts:268-350`), le toast des favoris et la boîte de dialogue de sortie privée sont codés en dur en français, quel que soit le réglage de langue.
- **Code mort et erreurs.**
  - `confirmQuitWithPrivateTabs()` n'est jamais appelée.
  - Le menu « Code source » ouvre `https://github.com/` au lieu du dépôt (`menu.ts:360`).
  - Les snapshots sont émis en double sur `maximize` (`index.ts:138` et `tabs.ts:66`).
- **À vérifier.**
  - Les raccourcis de `Menu.setApplicationMenu` après `window.removeMenu()` sur une fenêtre sans cadre.
  - `second-instance` ignore `argv`, donc on ne peut pas ouvrir une URL depuis Windows ni définir Zuri comme navigateur par défaut.
- **Performance.** `JsonStore` réécrit tout `history.json` (jusqu'à 5 000 entrées) de façon synchrone sur le thread principal, au maximum toutes les 250 ms. C'est acceptable pour le MVP, mais à migrer vers SQLite.

---

## 6. Plan d'action proposé

| Étape | Contenu | Effort |
|---|---|---|
| **Sprint 0, bloquant avant toute diffusion** | C1, C2, C3, E5, E6 (garde IPC et schémas) | ~1–2 j |
| **Sprint 1** | E1 (updater, fuses), E3, E4, E7, M1, M3 + premiers tests Vitest/Playwright et CI | ~1 sem. |
| **Sprint 2** | E2 (listes malware/phishing), M2 (popups), M4 (`adblocker-electron`), M5 (`safeStorage`), i18n complète | ~1–2 sem. |
| **Ensuite** | SQLite, mode lecture, coffre de mots de passe, Linux/macOS (feuille de route ANALYSE §7) | — |
