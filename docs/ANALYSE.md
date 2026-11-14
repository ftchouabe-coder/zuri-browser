# ANALYSE — Navigateur web privé, « aux couleurs africaines »

> Document de cadrage. **Aucune ligne de code applicatif avant validation des points clés.**
> Version 0.1 — 14/11/2026

---

## 1. Objectif

Construire un navigateur de bureau grand public qui :

1. **Couvre les besoins réels** de la majorité des internautes (navigation, onglets, favoris, historique, téléchargements, recherche, PDF, lecture, traduction, partage).
2. **Respecte la vie privée par défaut** : zéro télémétrie, zéro compte obligatoire, blocage publicités/traqueurs, stockage local chiffré, intentions claires.
3. **Assume une identité africaine** : palette, motifs, typographie, tonalité éditoriale — sans folklore ni clichés, et **accessible** (WCAG 2.2 AA).
4. **Tienne compte des contraintes locales** : connexions lentes ou intermittentes, coût des données, matériel modeste, multilinguisme.

Contrainte implicite : projet mené en solo/small team, livrable par étapes, sans dépendance à une infrastructure serveur coûteuse.

---

## 2. Besoins utilisateurs (priorisés)

| Priorité | Besoin | Traduction produit |
|---|---|---|
| P0 | Naviguer vite et sans pub | Moteur Chromium + blocage natif (pub, traqueur, bannière cookies) |
| P0 | Ne pas être espionné | Anti-trace, HTTPS-only, DoH, cookies tiers bloqués, mode privé étanche |
| P0 | Retrouver ses sites | Favoris, historique, barre d'adresse intelligente, restauration de session |
| P0 | Économiser les données | Mode économie : images différées, autoplay bloqué, médias non préchargés |
| P0 | Comprendre l'interface | FR par défaut, i18n prête, RTL (arabe), lisibilité, contrastes |
| P1 | Gérer ses mots de passe | Coffre local chiffré (DPAPI/Keychain) + générateur + anti-phishing |
| P1 | Lire confortablement | Mode lecture, zoom, taille de police, thème sombre forcé |
| P1 | Télécharger / imprimer / PDF | Gestionnaire de téléchargements, reprise, impression, export PDF |
| P1 | Partager vers le mobile | QR code de l'URL, « envoyer vers… » (V2) |
| P2 | Traduire | Traduction à la demande (fournisseur configurable, hors ligne si possible) |
| P2 | Organiser | Onglets verticaux, groupes, espaces de travail, palette de commandes |
| P2 | Extensions | Support partiel Chromium (V2) — le blocage natif couvre l'essentiel |
| P3 | Synchroniser | Sync chiffrée de bout en bout, **optionnelle** (nécessite backend) |

**Non-objectifs v1** : moteur de rendu maison, réseau publicitaire, compte obligatoire, réseau social intégré, crypto-monnaie.

---

## 3. Architecture — comparatif

| Critère (poids) | Electron | Tauri 2 + WebView2 | .NET 10 + WebView2 | Fork Chromium |
|---|---|---|---|---|
| Délai jusqu'à un navigateur crédible (30 %) | ★★★★★ | ★★ | ★★★ | ★ |
| Multi-onglets + cycle de vie web fiable (20 %) | ★★★★★ | ★★★ | ★★★★ | ★★★★★ |
| Blocage réseau fin (webRequest) (15 %) | ★★★★★ | ★★ | ★★★★ | ★★★★★ |
| Confidentialité / contrôle du moteur (10 %) | ★★★★ | ★★★ | ★★★ | ★★★★★ |
| Taille installée / RAM (10 %) | ★★ (≈200 Mo) | ★★★★★ (≈8 Mo) | ★★★★ | ★★ |
| Multiplateforme (10 %) | ★★★★★ | ★★★★ | ★ (Windows) | ★★★ |
| Maintenance / écosystème (5 %) | ★★★★★ | ★★★ | ★★★★ | ★ |

**Recommandation : Electron + TypeScript.**
Raisons : `webRequest` complet (cœur de l'anti-pub), `WebContentsView` par onglet, `session` partitionnée pour le mode privé, `safeStorage` pour le chiffrement, écosystème mature, et **portabilité Windows/Linux/macOS** sans réécriture.
Coût assumé : binaire ~150–250 Mo. Atténuation : build **portable**, mises à jour différentielles, et une variante « légère » Tauri envisageable plus tard si le critère taille devient bloquant.

Alternatives écartées :
- **Tauri** : Rust absent de la machine (toolchain MSVC + rustup à installer), pas d'API `webRequest` → anti-pub et anti-trace médiocres, gestion multi-onglets plus artisanale.
- **.NET/WebView2** : très bon sur Windows, mais enferme le produit sur un OS et ralentit l'itération UI.
- **Fork Chromium** : 6–12 mois avant le premier build utilisable, maintenance impossible en solo.

### Pile proposée

```
Electron (dernière stable)  ── process principal : fenêtres, sessions, permissions,
│                              anti-pub, téléchargements, MAJ, coffre chiffré
├─ preload (contextBridge)  ── IPC typé, aucune exposition Node au renderer
├─ renderer React + TS      ── chrome du navigateur : onglets, omnibox, panneaux, réglages
└─ WebContentsView / onglet ── contenu web isolé (sandbox, contextIsolation)
Stockage : SQLite (better-sqlite3) + secrets via safeStorage
Anti-pub : @ghostery/adblocker-electron (MPL-2.0) + listes EasyList/EasyPrivacy/Fanboy
Build : electron-builder (NSIS + portable) · MAJ : electron-updater signé
Qualité : Vitest + Playwright (E2E Electron) + ESLint/Prettier + CI GitHub Actions
```

---

## 4. Confidentialité — modèle retenu

**Local-first, zéro télémétrie, zéro compte.** Rien ne quitte la machine sans action explicite.

| Mesure | Détail |
|---|---|
| Blocage contenu | Listes filtres locales, mise à jour signée, compteur par site, pause par site |
| Anti-trace | Blocage cookies tiers, purge des cookies à la fermeture (option), Referer tronqué |
| Transport | HTTPS-only (interstitiel explicite), HSTS, DoH configurable (Cloudflare/Quad9/Mullvad/**désactivé**) |
| Empreinte | UA cohérente, WebRTC restreint, `canvas`/`audio` bruités en mode strict, fonts locales limitées |
| Mode privé | Partition `persist:` éphémère, jamais écrite sur disque, téléchargements tracés |
| Permissions | Demande explicite par origine (caméra, micro, géoloc, notifications, presse-papiers) |
| Stockage | Historique/favoris/mots de passe chiffrés au repos ; mots de passe via DPAPI |
| Réseau | Aucune requête sortante non sollicitée (pas de crash reporter, pas de ping) |
| Sécurité app | `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, CSP stricte, MAJ signée |

Points de vigilance : les listes de filtres et l'anti-pub cassent parfois des sites → mode « pause » visible et rapport par site. Les fonctions « économie de données » **ne doivent pas** passer par un proxy qui lirait le trafic, sauf choix explicite et documenté.

---

## 5. Économie de données & faibles connexions

1. **Mode économie** (bascule visible dans la barre) : images non chargées par défaut (clic pour charger), autoplay vidéo bloqué, `preload` média désactivé, polices distantes bloquées au profit de polices système, scripts de mesure bloqués.
2. **Indicateur de poids** : compteur octets par onglet/par jour (local, non transmis).
3. **Mode hors ligne** : page d'erreur utile, cache consultable, support PWA.
4. **Optimisation optionnelle par proxy** (V3) : uniquement si serveur maîtrisé, chiffré, avec consentement — sinon on crée un point d'écoute, ce qui contredit le positionnement.

---

## 6. Identité visuelle africaine

Principe : **géométrie et matière, pas de stereotype**. Motifs inspirés (kente, bogolan, adinkra) utilisés en accent fin (séparateurs, états, page d'accueil), jamais en fond criard. Deux thèmes (clair/sombre) issus des mêmes jetons.

### Option A — « Panafricain moderne »
Vert profond, or, rouge, sable. Énergie, unité, contraste fort.

| Rôle | Hex | Usage | Contraste |
|---|---|---|---|
| Vert | `#0B6B3A` | actions, succès, actif | 6,6:1 sur blanc |
| Or | `#F2C230` | aplats, accents | décoratif |
| Or texte | `#8A5A00` | texte/icône sur clair | 5,7:1 |
| Rouge | `#B3261E` | alertes, mises à jour | 6,5:1 |
| Encre | `#14110F` | texte | — |
| Sable | `#FAF6EC` | fond clair | — |

### Option B — « Terre & indigo » (recommandée)
Sahel, bogolan, indigo : plus sobre, moins « drapeau », très lisible en sombre comme en clair.

| Rôle | Hex | Usage | Contraste |
|---|---|---|---|
| Indigo | `#24325B` | primaire, chrome, liens | 11:1 sur sable |
| Terracotta | `#A8451F` | accent, CTA secondaire | 5,9:1 (blanc dessus) |
| Acacia | `#3F6B45` | succès, sécurité | 5,4:1 |
| Sable | `#EFE6D6` | fond clair | — |
| Noir terre | `#1B1917` | fond sombre | — |
| Or doux | `#D9A05B` | accents sombres | décoratif |

### Option C — « Kente nuit » (dark-first)
Fond nuit `#0E1116`, or `#E9B949` (10:1), vert `#1F8A70`, rouge `#D64545`, ivoire `#F5EFE6`.
Adapté aux usages nocturnes, mais moins consensuel en plein soleil (lisibilité écran).

### Transversal
- Typographie : une sans-serif humaniste à bonne couverture latine + diacritiques africains (Inter, Source Sans 3, Noto Sans) ; titres avec une display sobre.
- i18n : FR, EN, puis SW, HA, YO, AM, AR (RTL), PT. Fichiers de traduction externes, aucune chaîne codée en dur.
- Accessibilité : focus visible, cibles ≥ 44 px, `prefers-reduced-motion`, mode contraste élevé, zoom 200 % sans casse.
- Page d'accueil : « Découvrir l'Afrique » statique et éditoriale (sites régionaux, presse, universités, services publics) — **sans tracker, sans flux distant**.

---

## 7. Périmètre proposé (MVP vs suite)

**MVP « cœur solide » (≈ 4–6 semaines)**
Onglets + restauration, omnibox (moteurs au choix), navigation/raccourcis/menus, favoris, historique, téléchargements, PDF/impression, anti-pub + anti-trace + HTTPS-only + DoH, mode privé, permissions, paramètres + thèmes, mode économie de données, page d'accueil, page d'erreur, mise à jour auto.

**V1.1 (≈ 2–3 semaines)**
Coffre de mots de passe local, mode lecture, zoom/police, recherche dans la page, groupes d'onglets/onglets verticaux, palette de commandes, capture d'écran/QR, import depuis Chrome/Edge/Firefox, compteur de données, i18n EN.

**V2 (post-validation)**
Traduction intégrée, sync E2EE optionnelle, extensions partielles, « envoyer vers mobile », notes/clip, profils multiples, version Linux/macOS, éventuel portage Android (WebView) ou Tauri.

---

## 8. Sécurité & conformité

- Chaîne de build reproductible, dépendances verrouillées (`package-lock`), audit `npm audit`, Dependabot.
- Signature de code Windows (OV/EV) nécessaire pour éviter SmartScreen — **coût externe à prévoir**.
- MAJ : manifeste signé, pas de downgrade, vérification d'intégrité.
- Licences : Electron (MIT), @ghostery/adblocker (MPL-2.0, OK si fichiers non modifiés), EasyList (CC BY-SA 3.0 → attribution + partage à l'identique des listes modifiées), Chromium (BSD). Éviter d'embarquer des listes GPL ou NC dans un produit commercial sans avis juridique.
- RGPD : pas de traitement de données personnelles côté éditeur → position simple ; consentement local pour toute fonction réseau optionnelle (traduction, sync).
- Nom/trademarks : vérifier la disponibilité (« Ubuntu » est déposé par Canonical — à éviter).

---

## 9. Risques

| Risque | Impact | Parade |
|---|---|---|
| Poids/RAM Electron | Adoption sur matériel modeste | Build portable, MAJ delta, mode économie, profilage mémoire |
| Signature de code coûteuse | Installation entravée | Budget certificat ou distribution via Store/winget |
| Contournement anti-pub | Expérience dégradée | Listes à jour, signalement, pause par site |
| Traduction/sync = backend | Coût + surface d'attaque | Optionnel, chiffré, ou auto-hébergé |
| Dérive « usine à gaz » | Retard | Périmètre MVP gelé, revue à chaque jalon |
| Cadre juridique des listes | Risque de retrait | Choix de licences compatibles dès le départ |

---

## 10. Décisions à valider (bloquantes avant code)

1. Plateformes cibles (Windows seul / + Linux-macOS / + Android).
2. Stack : Electron (recommandé) vs Tauri vs .NET.
3. Périmètre de la première livraison (MVP cœur / + coffre & lecture / tout).
4. Direction visuelle (A, B, C ou variante).
5. Nom du produit et ton de marque.
6. Langues d'interface au lancement.
7. Sync/compte : local-only (recommandé) ou cloud E2EE dès v1.
8. Licence et canal de distribution (open source vs privé, GitHub/Store/winget).

---

## 11. Décisions validées

| Point | Décision |
|---|---|
| Plateformes | Windows d'abord (NSIS + portable) ; Linux/macOS ensuite. |
| Stack | Electron 45 + TypeScript + React 19, electron-vite, electron-builder. |
| Périmètre | MVP « cœur solide » : onglets/restauration, omnibox, favoris, historique, téléchargements, impression/PDF, anti-pub + anti-trace, HTTPS-only, DoH, mode privé, permissions, paramètres, thèmes, page d'accueil, page d'erreur. |
| Direction visuelle | Option B « Terre & indigo » : indigo `#24325B`, terracotta `#A8451F`, acacia `#3F6B45`, sable `#EFE6D6`, noir terre `#1B1917`, or `#D9A05B`. WCAG AA, pas de folklore. |
| Nom | **Zuri** (beau / bon en swahili). |
| Langues | FR au lancement, EN intégré (bascule instantanée). |
| Compte & sync | Aucun compte, aucune sync, tout en local. |
| Licence & diffusion | MIT, open source, GitHub Releases. |
| Anti-pub | `@ghostery/adblocker` (MPL-2.0) + EasyList/EasyPrivacy (CC BY-SA 3.0) + filet local CC0. |
| Données | JSON atomique maison (`JsonStore`), pas de module natif ; migration SQLite prévue sans changer l'API. |

