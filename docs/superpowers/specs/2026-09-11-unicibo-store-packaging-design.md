# UniCibo — Pacchettizzazione e pubblicazione store (sotto-progetto 4 di 4)

Data: 2026-09-11
Stato: approvato in chat, in attesa di implementazione

## Contesto

Sotto-progetti 1 (autenticazione reale), 2 (tecniche Firestore), 3
(post multi-gruppo, tag rapidi, bio profilo) sono completi e uniti su
`main`. Questo è l'ultimo sotto-progetto: trasformare UniCibo da progetto
d'esame eseguito con `npm run dev` in un'app reale, installabile.

**Priorità di distribuzione, in ordine** (esplicitamente indicata
dall'utente):
1. **Web (PWA)** — installabile da browser via un link, nessun account
   sviluppatore necessario. Prima priorità, disponibile subito.
2. **Android (Google Play)** — pacchettizzata via Capacitor. Seconda
   priorità.
3. **iOS (App Store)** — possibile in futuro, quando saranno disponibili
   un account Apple Developer e un Mac con Xcode. Non in scope ora: nessuna
   build/test iOS in questo sotto-progetto, ma le scelte tecniche (Capacitor
   è cross-platform) non precludono di aggiungerlo in seguito.

**Stato di partenza rilevato nel repo** (nessuna base di packaging
esistente):
- Nessuna cartella `public/`, nessun `manifest.json`, nessun service
  worker.
- Nessun `capacitor.config.json`, nessuna cartella `android/`.
- Nessun account Google Play Console né Apple Developer.
- Unico asset grafico: `src/assets/logo-icona.png`, 320×218px, non
  quadrato, con una trama a mosaico troppo fine per taglie piccole — non
  utilizzabile direttamente come icona app.
- `firebase.json` configura solo `firestore` (rules/indexes), nessuna
  sezione `hosting`.
- Nessun git remote configurato (repo solo locale).

## Decisioni prese (in chat)

- **PWA**: tramite `vite-plugin-pwa` (Workbox), non manifest/service
  worker scritti a mano — meno codice custom da mantenere sui criteri di
  installabilità, che sono rigidi.
- **Capacitor/Android**: bundle locale (Capacitor impacchetta la build
  Vite dentro l'app, la WebView la carica da disco), non un wrapper che
  punta all'URL remoto — funziona offline e rispetta la policy Google
  Play "minimum functionality" (le app che sono solo un wrapper di un sito
  remoto rischiano il rifiuto in review).
- **Application ID Android**: `com.unicibo.app`, immutabile dopo la prima
  pubblicazione su Play Store.
- **Hosting PWA**: Firebase Hosting, stesso progetto Firebase già in uso
  per Firestore — dominio gratuito tipo `unicibo.web.app` (o
  `<project-id>.web.app`), HTTPS automatico.
- **Icona**: ricreata da zero come SVG vettoriale, stesso stile/palette
  dell'originale (piatto circolare, gradiente teal→pesca, forchetta e
  coltello ai lati, monogramma "UC"), ma quadrata e ad alta risoluzione.
  Bozza approvata in chat (vedi sezione Icona sotto per i dettagli
  visivi esatti).
- **Privacy policy**: bozza scritta da Claude in `docs/privacy-policy.md`,
  basata sui dati realmente raccolti dall'app, poi pubblicata come pagina
  statica su Firebase Hosting. Da rivedere/approvare dall'utente prima
  della pubblicazione pubblica — non è consulenza legale.
- **Nessuna modifica alla logica applicativa esistente** (Firestore,
  auth, viste) — puro lavoro di packaging attorno al codice già
  funzionante.

## Design

### 1. Icona app

SVG vettoriale, canvas quadrato. Composizione (confermata in chat dopo
due iterazioni visive):
- Piatto circolare centrale con bordo a gradiente lineare teal (`#4f8383`)
  → pesca (`#e7a479`), **senza** l'anello di pallini bianchi della prima
  bozza (scartato).
- Cerchio interno chiaro (`#faf6ef`) che ospita il monogramma.
- Monogramma "UC": stile fedele all'originale — font serif sottile
  (es. Georgia/Times New Roman), "U" in teal scuro (`#3d6b6b`), "C" in
  pesca scuro (`#d98a54`), lettere leggermente sovrapposte/interlacciate
  come nell'originale, con una sottile linea orizzontale sotto (flourish),
  stesso colore a gradiente del bordo.
- Forchetta a sinistra del piatto e coltello a destra, silhouette piena
  (fill, non solo contorno) con lo stesso gradiente del bordo, stile
  semplificato coerente con l'originale.

Da questo SVG sorgente, esportare i formati richiesti:
- `icon-192.png`, `icon-512.png` (PWA/manifest)
- `icon-512-maskable.png` (Android adaptive icon: stesso disegno con
  margine di sicurezza ~10% per il ritaglio a forma variabile del
  sistema)
- `favicon.ico` (16/32/48px) — usa una versione semplificata del
  monogramma senza i dettagli fini (forchetta/coltello/flourish
  diventano illeggibili sotto i 48px; a quelle taglie resta solo il
  piatto con "UC")
- `apple-touch-icon.png` (180×180) — preparato ora anche se iOS non è in
  scope di build, per non dover rifare il lavoro sull'icona quando si
  aggiungerà

Tutti salvati in `public/icons/`.

### 2. PWA — `vite-plugin-pwa`

Aggiungere dipendenza `vite-plugin-pwa`. In `vite.config.js`, configurare
il plugin con:
- `registerType: 'autoUpdate'`
- `manifest`: `name: 'UniCibo'`, `short_name: 'UniCibo'`,
  `description` breve, `theme_color` e `background_color` presi dai
  token CSS esistenti (`--uc-primary` ecc., se definiti in
  `src/styles/tokens.css` — altrimenti dai colori del tema Vuetify in
  `src/main.js`), `display: 'standalone'`, `start_url: '/'`, icone da
  `public/icons/` nelle taglie 192/512 (incluso `purpose: 'maskable'`
  per la 512 maskable).
- Strategia di cache: **precache** degli asset statici (JS/CSS/icone,
  generato automaticamente da Workbox al build), **network-first** per
  le chiamate verso Firestore/Firebase (mai servire dati utente da
  cache stantia quando c'è connessione; fallback alla cache solo se la
  rete non risponde — comportamento di default di Firestore stesso via
  il suo SDK, il service worker non deve intercettare quelle richieste
  in cache-first).

`index.html` guadagna i meta tag PWA standard: `theme-color`,
`apple-touch-icon` (link a `/icons/apple-touch-icon.png`).

### 3. Firebase Hosting

`firebase.json` guadagna una sezione:
```json
"hosting": {
  "public": "dist",
  "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
  "rewrites": [{ "source": "**", "destination": "/index.html" }]
}
```
Il `rewrite` è necessario perché Vue Router gestisce le rotte lato
client (SPA): senza di esso, ricaricare la pagina su una rotta come
`/gruppi` darebbe 404 da Firebase Hosting.

Deploy con `firebase deploy --only hosting` — **richiede conferma
esplicita dell'utente prima di essere eseguito**, come già avvenuto per
il deploy di `firestore.rules` nel sotto-progetto 3.

### 4. Capacitor — Android

Dipendenze: `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`.

`capacitor.config.json`:
```json
{
  "appId": "com.unicibo.app",
  "appName": "UniCibo",
  "webDir": "dist"
}
```

Flusso: `npm run build` (genera `dist/`) → `npx cap add android` (prima
volta, genera la cartella `android/`) → `npx cap sync android` (copia
`dist/` e la config dentro il progetto nativo) → build Gradle
(`cd android && ./gradlew assembleDebug` per un `.apk` di debug
installabile/testabile, o `bundleRelease` per l'`.aab` da caricare su
Play Console — quest'ultimo richiede firma con una keystore, che
l'utente dovrà generare e conservare: **non generata da Claude**,
poiché è una chiave privata di firma che l'utente deve custodire per
tutti gli aggiornamenti futuri dell'app).

Icona e nome app nel progetto Android: Capacitor genera
`android/app/src/main/res/mipmap-*/` dalle icone fornite — usare
`@capacitor/assets` (o l'equivalente aggiornamento manuale delle
risorse `mipmap`) per generare le varie densità (mdpi/hdpi/xhdpi/
xxhdpi/xxxhdpi) a partire da `icon-512.png` e
`icon-512-maskable.png`.

`package.json` guadagna lo script:
```json
"build:android": "vite build && npx cap sync android"
```

### 5. Privacy policy

Contenuto scritto una volta in `docs/privacy-policy.md` (fonte in
markdown, comoda da rivedere) e pubblicato come **file HTML statico**
`public/privacy.html`, fuori dal routing di Vue Router — raggiungibile
direttamente come `unicibo.web.app/privacy.html` anche senza eseguire
JavaScript, il modo più semplice per soddisfare il requisito di link
pubblico di Google Play (nessuna vista Vue dedicata: non serve
interattività per una pagina di solo testo). Contenuto basato sui dati
realmente raccolti dal codice attuale:
- Autenticazione: email, e se usati, identificatori dai provider Google/
  Apple Sign-In (via Firebase Auth).
- Profilo: nickname, bio, foto profilo (se caricata localmente — cfr.
  `identity.js`).
- Contenuti generati dall'utente: ricette (titolo, ingredienti,
  procedimento, foto), commenti, reazioni, appartenenza a gruppi.
- Nessuna raccolta per pubblicità o tracking di terze parti.
- Dati ospitati su Firebase (Google Cloud); cancellazione dati
  contattando l'autore all'indirizzo `marco.faccin.schio@gmail.com`
  (default proposto — l'utente conferma o sostituisce questo indirizzo
  in fase di revisione della bozza, prima che diventi pubblica).

Questa bozza va rivista e approvata dall'utente prima di essere resa
pubblica — è testo descrittivo basato sul codice, non consulenza legale.

### 6. Documentazione

`README.md` guadagna una sezione "Build e distribuzione" con i comandi
per: dev locale (invariato), build PWA + deploy Hosting, build Android
locale, dove trovare/generare la keystore di firma (solo istruzioni,
nessuna chiave nel repo).

## File toccati

**Nuovi:**
- `public/icons/*.svg,*.png`, `public/favicon.ico`
- `capacitor.config.json`
- `android/` (generata da `npx cap add android`, non scritta a mano)
- `docs/privacy-policy.md` (+ relativa pagina pubblicata)
- `docs/superpowers/specs/2026-09-11-unicibo-store-packaging-design.md`
  (questo documento)

**Modificati:**
- `package.json` — nuove dipendenze, script `build:android`
- `vite.config.js` — plugin `vite-plugin-pwa` configurato
- `index.html` — meta tag PWA
- `firebase.json` — sezione `hosting`
- `README.md` — istruzioni di build/deploy

**Non toccati:** nessun file sotto `src/` relativo a logica applicativa
(viste, componenti, `firestore.rules`, `identity.js` oltre a quanto
già presente).

## Gestione errori

- Build Android che fallisce (Gradle/SDK mancante nell'ambiente): non è
  un errore applicativo da gestire nel codice, ma un problema di
  toolchain — verificato durante l'implementazione, documentato in
  `README.md` se richiede setup locale (Android SDK/Java) che l'utente
  dovrà installare.
- Service worker: `vite-plugin-pwa` gestisce da solo gli edge case di
  aggiornamento (nuova versione disponibile mentre l'utente ha l'app
  aperta) tramite `registerType: 'autoUpdate'` — nessuna UI custom di
  "nuova versione disponibile" in questo scope (YAGNI: aggiungibile in
  futuro se necessario).

## Divisione dei compiti

**Automatizzabile (Claude):**
- Tutto il codice/config sopra (PWA, Capacitor, icone, bozza privacy
  policy, script di build)
- Deploy della PWA su Firebase Hosting (dietro conferma esplicita)
- Build Android locale (`.apk` di debug) per verificare che il progetto
  compili

**Solo l'utente:**
- Creare e pagare l'account Google Play Console (25$ una tantum)
- Generare e custodire la keystore di firma per l'`.aab` di release
- Caricare la build su Play Console, compilare la scheda store
  (screenshot, descrizione, categoria), superare la review di Google
- Rivedere/approvare la bozza di privacy policy prima che sia pubblica
- Testare l'app Android su un dispositivo/emulatore reale (l'ambiente di
  sviluppo di Claude non ha un emulatore Android configurato)
- In futuro: account Apple Developer (99$/anno) + Mac con Xcode per iOS

## Verifica

Nessun framework di test nel progetto — verifica manuale:
- `npm run build && npm run preview`: verificare in Chrome che il
  manifest sia corretto (DevTools → Application → Manifest) e che il
  browser proponga "Installa app".
- Verificare che le icone risultino nitide e leggibili nelle anteprime
  del manifest, a più dimensioni.
- `npx cap sync android` seguito da build Gradle: verificare che la
  compilazione vada a buon fine senza errori.
- Verificare che `firebase.json` con la sezione `hosting` sia
  sintatticamente valido (nessun tool di lint locale: revisione
  manuale).
- Non verificabile in questo ambiente: comportamento reale dell'app
  installata su un dispositivo Android fisico/emulatore, review di
  Google Play (fuori portata, lato utente).
