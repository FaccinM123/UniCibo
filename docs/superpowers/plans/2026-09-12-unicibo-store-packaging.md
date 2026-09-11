# UniCibo — Pacchettizzazione e pubblicazione store — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere UniCibo installabile come PWA via Firebase Hosting e pacchettizzata per Android via Capacitor, con icona, manifest e privacy policy pronti — senza toccare la logica applicativa esistente.

**Architecture:** `vite-plugin-pwa` genera manifest e service worker dalla stessa build Vite già esistente; Capacitor impacchetta quella stessa build (`dist/`) come app Android nativa offline-first; Firebase Hosting serve `dist/` con un rewrite SPA. Un'icona SVG sorgente unica alimenta tutti gli export PNG.

**Tech Stack:** Vite, `vite-plugin-pwa` (Workbox), Capacitor 6 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`), Firebase Hosting.

**Spec:** [docs/superpowers/specs/2026-09-11-unicibo-store-packaging-design.md](../specs/2026-09-11-unicibo-store-packaging-design.md)

## Global Constraints

- Nessuna modifica a `src/` sotto viste/componenti/logica applicativa, `firestore.rules`, `identity.js` — solo packaging.
- Application ID Android: `com.unicibo.app` (immutabile dopo la prima pubblicazione — usare questo valore esatto ovunque).
- Nome app ovunque: `UniCibo`.
- Colori icona/tema: bordo piatto gradiente `#4f8383` → `#e7a479`; monogramma "U" `#3d6b6b`, "C" `#d98a54`; sfondo interno `#faf6ef`.
- Il deploy reale (`firebase deploy --only hosting`) richiede conferma esplicita dell'utente in chat — mai eseguito automaticamente da un task o da una verifica.
- Nessuna chiave di firma Android (keystore) generata o committata — è responsabilità esclusiva dell'utente.
- Nessun framework di test nel progetto: ogni verifica è manuale (build, preview, ispezione DevTools, build Gradle).

---

### Task 1: Icona sorgente SVG ed export multi-formato

**Files:**
- Create: `src/assets/icon-source.svg`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/icons/icon-512-maskable.png`
- Create: `public/icons/apple-touch-icon.png`
- Create: `public/favicon.ico`
- Create: `scripts/export-icons.mjs`

**Interfaces:**
- Produces: file PNG statici in `public/icons/` e `public/favicon.ico`, consumati dal manifest PWA (Task 2) e dalla generazione delle risorse Android (Task 4). Nessuna API JS: sono asset statici.

- [ ] **Step 1: Creare l'SVG sorgente dell'icona**

Crea `src/assets/icon-source.svg` con contenuto (canvas quadrato 512×512, piatto circolare con bordo a gradiente, monogramma "UC", forchetta a sinistra, coltello a destra — stessa composizione approvata in chat, riscalata da viewBox 680×400 a un canvas quadrato 512×512 centrato sul piatto):

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f8383"/>
      <stop offset="100%" stop-color="#e7a479"/>
    </linearGradient>
  </defs>
  <g fill="url(#ringGrad)">
    <rect x="70" y="150" width="14" height="90" rx="7"/>
    <rect x="93" y="150" width="14" height="90" rx="7"/>
    <rect x="116" y="150" width="14" height="90" rx="7"/>
    <rect x="139" y="150" width="14" height="90" rx="7"/>
    <rect x="65" y="228" width="93" height="26" rx="13"/>
    <rect x="97" y="242" width="18" height="230" rx="9"/>
  </g>
  <path d="M420 140 C398 140 386 194 386 244 C386 271 400 285 420 285 C440 285 454 271 454 244 C454 194 442 140 420 140 Z" fill="url(#ringGrad)"/>
  <rect x="409" y="285" width="20" height="187" rx="10" fill="url(#ringGrad)"/>
  <circle cx="256" cy="256" r="150" fill="url(#ringGrad)"/>
  <circle cx="256" cy="256" r="109" fill="#faf6ef"/>
  <text x="262" y="296" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="109" font-weight="400">
    <tspan fill="#3d6b6b" dx="-24">U</tspan><tspan fill="#d98a54" dx="-19">C</tspan>
  </text>
  <line x1="205" y1="316" x2="311" y2="316" stroke="url(#ringGrad)" stroke-width="4" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 2: Creare la variante semplificata per taglie piccole (favicon)**

Crea `src/assets/icon-source-simple.svg` — solo piatto + monogramma, senza forchetta/coltello/flourish (illeggibili sotto i 48px):

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="ringGradSimple" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4f8383"/>
      <stop offset="100%" stop-color="#e7a479"/>
    </linearGradient>
  </defs>
  <circle cx="256" cy="256" r="240" fill="url(#ringGradSimple)"/>
  <circle cx="256" cy="256" r="175" fill="#faf6ef"/>
  <text x="262" y="300" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="175" font-weight="400">
    <tspan fill="#3d6b6b" dx="-38">U</tspan><tspan fill="#d98a54" dx="-30">C</tspan>
  </text>
</svg>
```

- [ ] **Step 3: Installare lo strumento di export raster**

```bash
npm install --save-dev sharp
```

- [ ] **Step 4: Scrivere lo script di export**

Crea `scripts/export-icons.mjs`:

```js
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'

mkdirSync('public/icons', { recursive: true })

const full = readFileSync('src/assets/icon-source.svg')
const simple = readFileSync('src/assets/icon-source-simple.svg')

async function exportPng(svgBuffer, size, outPath, padding = 0) {
  const inner = Math.round(size * (1 - padding * 2))
  await sharp(svgBuffer)
    .resize(inner, inner)
    .extend({
      top: Math.round((size - inner) / 2),
      bottom: Math.round((size - inner) / 2),
      left: Math.round((size - inner) / 2),
      right: Math.round((size - inner) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(outPath)
  console.log('OK', outPath)
}

await exportPng(full, 192, 'public/icons/icon-192.png')
await exportPng(full, 512, 'public/icons/icon-512.png')
// Maskable: 10% di margine di sicurezza sui lati, il sistema puo' ritagliare
// a forma variabile (cerchio, squircle, ecc.) senza tagliare il disegno.
await exportPng(full, 512, 'public/icons/icon-512-maskable.png', 0.1)
await exportPng(full, 180, 'public/icons/apple-touch-icon.png')

await exportPng(simple, 48, 'public/icons/favicon-48.png')
await exportPng(simple, 32, 'public/icons/favicon-32.png')
await exportPng(simple, 16, 'public/icons/favicon-16.png')

console.log('Fatto. Nota: public/favicon.ico va generato a parte (vedi Step 5).')
```

- [ ] **Step 5: Eseguire l'export e generare il favicon.ico**

```bash
node scripts/export-icons.mjs
npx --yes png-to-ico public/icons/favicon-16.png public/icons/favicon-32.png public/icons/favicon-48.png > public/favicon.ico
```

Verifica: i comandi non devono dare errori; `ls public/icons/` deve mostrare `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`, i tre `favicon-*.png`; `public/favicon.ico` deve esistere e pesare più di 0 byte.

- [ ] **Step 6: Verifica visiva**

Apri `public/icons/icon-512.png` e `public/icons/favicon-32.png`: il monogramma "UC" deve essere leggibile in entrambi (nel 512 con forchetta/coltello visibili, nel 32 solo piatto+lettere).

- [ ] **Step 7: Commit**

```bash
git add src/assets/icon-source.svg src/assets/icon-source-simple.svg scripts/export-icons.mjs public/icons public/favicon.ico package.json package-lock.json
git commit -m "feat: add app icon source and multi-size exports"
```

---

### Task 2: PWA — `vite-plugin-pwa` e meta tag

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-512-maskable.png`, `public/icons/apple-touch-icon.png` (Task 1).
- Produces: manifest PWA generato automaticamente al build in `dist/manifest.webmanifest`; service worker generato in `dist/sw.js`. Nessuna nuova funzione JS esportata.

- [ ] **Step 1: Installare la dipendenza**

```bash
npm install --save-dev vite-plugin-pwa
```

- [ ] **Step 2: Configurare il plugin in `vite.config.js`**

Sostituisci il contenuto di `vite.config.js` con:

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// Config Vite: plugin Vue 3 + alias @ -> src + PWA (manifest + service
// worker generati da vite-plugin-pwa/Workbox al build).
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'UniCibo',
        short_name: 'UniCibo',
        description: 'Social network a gruppi per condividere ricette che si cucinano davvero.',
        theme_color: '#D97D46',
        background_color: '#F7F4F0',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // Precache degli asset statici (JS/CSS/icone) generato da Workbox.
        // Le chiamate Firestore/Firebase Auth (dominii googleapis.com/
        // firebaseio.com) non vengono intercettate: restano gestite
        // dall'SDK Firebase stesso, mai servite da cache stantia.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}']
      }
    })
  ],
  resolve: {
    alias: {
      '@': '/src'
    }
  }
})
```

- [ ] **Step 3: Aggiungere i meta tag PWA a `index.html`**

Sostituisci il contenuto di `index.html` con:

```html
<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#D97D46" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <link rel="icon" href="/favicon.ico" />
    <title>UniCibo</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Build e verifica manifest**

```bash
npm run build
```

Verifica: il comando termina senza errori; `dist/manifest.webmanifest` e `dist/sw.js` devono esistere dopo il build (`ls dist/`).

- [ ] **Step 5: Verifica installabilità in browser**

```bash
npm run preview
```

Apri `http://localhost:4173` in Chrome, apri DevTools → Application → Manifest: verifica che nome, icone e `theme_color` siano corretti e che non ci siano errori elencati. Controlla anche Application → Service Workers: deve risultare registrato e attivo.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.js index.html
git commit -m "feat: configure PWA manifest and service worker via vite-plugin-pwa"
```

---

### Task 3: Firebase Hosting

**Files:**
- Modify: `firebase.json`

**Interfaces:**
- Consumes: `dist/` prodotta da `npm run build` (Task 2).
- Produces: nessuna API — configurazione di deploy.

- [ ] **Step 1: Aggiungere la sezione `hosting` a `firebase.json`**

Sostituisci il contenuto di `firebase.json` con:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

- [ ] **Step 2: Verificare che il JSON sia sintatticamente valido**

```bash
node -e "JSON.parse(require('fs').readFileSync('firebase.json', 'utf8')); console.log('OK: JSON valido')"
```

Expected: stampa `OK: JSON valido` senza errori.

- [ ] **Step 3: Verifica locale con l'emulatore Hosting (nessun deploy)**

```bash
npm run build
npx --yes firebase-tools emulators:start --only hosting
```

Apri `http://localhost:5000` (o la porta stampata in console), naviga a una rotta client-side (es. `/gruppi`) e ricarica la pagina: deve restare sulla stessa vista invece di dare 404 (verifica che il rewrite SPA funzioni). Ferma l'emulatore con Ctrl+C al termine.

**Non eseguire `firebase deploy` in questo task** — il deploy reale richiede conferma esplicita dell'utente ed è isolato nel Task 6.

- [ ] **Step 4: Commit**

```bash
git add firebase.json
git commit -m "feat: add Firebase Hosting config with SPA rewrite"
```

---

### Task 4: Capacitor — progetto Android

**Files:**
- Create: `capacitor.config.json`
- Create: `android/` (generata da `npx cap add android`, non scritta a mano)
- Modify: `package.json`

**Interfaces:**
- Consumes: `dist/` (Task 2), `public/icons/icon-512.png` e `icon-512-maskable.png` (Task 1).
- Produces: script npm `build:android`, consumato dal Task 7 (README) come comando documentato.

- [ ] **Step 1: Installare le dipendenze Capacitor**

```bash
npm install @capacitor/core @capacitor/android
npm install --save-dev @capacitor/cli
```

- [ ] **Step 2: Creare `capacitor.config.json`**

Crea il file con questo contenuto esatto:

```json
{
  "appId": "com.unicibo.app",
  "appName": "UniCibo",
  "webDir": "dist"
}
```

- [ ] **Step 3: Buildare e aggiungere la piattaforma Android**

```bash
npm run build
npx cap add android
```

Verifica: deve crearsi la cartella `android/` con un progetto Gradle standard (`android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml` devono esistere).

- [ ] **Step 4: Generare le icone native Android dalle icone sorgente**

```bash
npm install --save-dev @capacitor/assets
npx capacitor-assets generate --android --iconBackgroundColor '#faf6ef' --iconBackgroundColorDark '#faf6ef'
```

Questo comando legge `public/icons/icon-512.png` (icona base) e `public/icons/icon-512-maskable.png` (adaptive icon) secondo le convenzioni di `@capacitor/assets` — se lo strumento richiede percorsi diversi (es. una cartella `assets/` dedicata invece di `public/icons/`), copia temporaneamente i due PNG in `assets/icon.png` e `assets/icon-foreground.png` prima di eseguire il comando, secondo quanto indicato dal suo output di errore.

Verifica: `android/app/src/main/res/mipmap-xxxhdpi/` (e le altre densità `mdpi/hdpi/xhdpi/xxhdpi`) devono contenere le icone generate.

- [ ] **Step 5: Sincronizzare la build**

```bash
npx cap sync android
```

Expected: termina con `√ Sync finished` senza errori.

- [ ] **Step 6: Aggiungere lo script `build:android` a `package.json`**

Nella sezione `"scripts"` di `package.json`, aggiungi:

```json
"build:android": "vite build && npx cap sync android"
```

- [ ] **Step 7: Build Gradle di verifica (APK di debug)**

```bash
cd android && ./gradlew assembleDebug
cd ..
```

Expected: `BUILD SUCCESSFUL`, e il file `android/app/build/outputs/apk/debug/app-debug.apk` deve esistere. Se il comando fallisce per Android SDK/Java mancanti nell'ambiente, annota l'errore esatto nel report del task (non è un errore di codice, ma di toolchain locale — va documentato in README, Task 7, non risolto qui).

- [ ] **Step 8: Commit**

```bash
git add capacitor.config.json android package.json package-lock.json
git commit -m "feat: add Capacitor Android project with local bundle"
```

---

### Task 5: Privacy policy

**Files:**
- Create: `docs/privacy-policy.md`
- Create: `public/privacy.html`

**Interfaces:**
- Produces: pagina statica pubblica `public/privacy.html`, servita da Firebase Hosting come `unicibo.web.app/privacy.html` dopo il deploy (Task 6) — nessuna route Vue Router coinvolta.

- [ ] **Step 1: Scrivere la bozza in `docs/privacy-policy.md`**

```markdown
# Privacy Policy — UniCibo

Ultimo aggiornamento: 2026-09-12

UniCibo è un'app per condividere ricette all'interno di gruppi. Questa
pagina descrive quali dati raccogliamo e come li usiamo.

## Dati raccolti

- **Account**: indirizzo email, e se scegli di accedere con Google o
  Apple, l'identificatore fornito da quel servizio (gestito tramite
  Firebase Authentication).
- **Profilo**: nickname, biografia opzionale, foto profilo (se
  impostata, salvata solo sul tuo dispositivo).
- **Contenuti che crei**: ricette (titolo, ingredienti, procedimento,
  foto), commenti, reazioni alle ricette, gruppi a cui aderisci o che
  crei.

## Come usiamo i dati

I dati servono esclusivamente a far funzionare l'app: mostrare le tue
ricette ai membri dei tuoi gruppi, farti accedere al tuo account,
mostrare il tuo profilo agli altri utenti. Non vendiamo né condividiamo
i tuoi dati con terze parti. Non facciamo pubblicità né tracciamento a
scopo pubblicitario.

## Dove sono conservati i dati

I dati sono conservati su Firebase (Google Cloud), il servizio che UniCibo
usa come database e per l'autenticazione.

## Cancellazione dei dati

Per richiedere la cancellazione del tuo account e dei tuoi dati, scrivi a
marco.faccin.schio@gmail.com.

## Contatti

Per domande su questa privacy policy: marco.faccin.schio@gmail.com.
```

- [ ] **Step 2: Convertire in `public/privacy.html` come pagina statica**

Crea `public/privacy.html`:

```html
<!DOCTYPE html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Privacy Policy — UniCibo</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px 16px 48px; line-height: 1.6; color: #23201c; }
      h1 { font-size: 22px; }
      h2 { font-size: 17px; margin-top: 28px; }
      p, li { font-size: 14.5px; }
      a { color: #D97D46; }
    </style>
  </head>
  <body>
    <h1>Privacy Policy — UniCibo</h1>
    <p><em>Ultimo aggiornamento: 2026-09-12</em></p>
    <p>UniCibo è un'app per condividere ricette all'interno di gruppi. Questa pagina descrive quali dati raccogliamo e come li usiamo.</p>

    <h2>Dati raccolti</h2>
    <ul>
      <li><strong>Account</strong>: indirizzo email, e se scegli di accedere con Google o Apple, l'identificatore fornito da quel servizio (gestito tramite Firebase Authentication).</li>
      <li><strong>Profilo</strong>: nickname, biografia opzionale, foto profilo (se impostata, salvata solo sul tuo dispositivo).</li>
      <li><strong>Contenuti che crei</strong>: ricette (titolo, ingredienti, procedimento, foto), commenti, reazioni alle ricette, gruppi a cui aderisci o che crei.</li>
    </ul>

    <h2>Come usiamo i dati</h2>
    <p>I dati servono esclusivamente a far funzionare l'app: mostrare le tue ricette ai membri dei tuoi gruppi, farti accedere al tuo account, mostrare il tuo profilo agli altri utenti. Non vendiamo né condividiamo i tuoi dati con terze parti. Non facciamo pubblicità né tracciamento a scopo pubblicitario.</p>

    <h2>Dove sono conservati i dati</h2>
    <p>I dati sono conservati su Firebase (Google Cloud), il servizio che UniCibo usa come database e per l'autenticazione.</p>

    <h2>Cancellazione dei dati</h2>
    <p>Per richiedere la cancellazione del tuo account e dei tuoi dati, scrivi a <a href="mailto:marco.faccin.schio@gmail.com">marco.faccin.schio@gmail.com</a>.</p>

    <h2>Contatti</h2>
    <p>Per domande su questa privacy policy: <a href="mailto:marco.faccin.schio@gmail.com">marco.faccin.schio@gmail.com</a>.</p>
  </body>
</html>
```

- [ ] **Step 3: Verifica locale**

```bash
npm run build
npm run preview
```

Apri `http://localhost:4173/privacy.html` (nota: serve il path esatto, non passa dal router Vue): la pagina deve mostrarsi correttamente, senza errori in console.

- [ ] **Step 4: Commit**

```bash
git add docs/privacy-policy.md public/privacy.html
git commit -m "docs: add privacy policy draft as a static page"
```

---

### Task 6: Deploy Firebase Hosting (richiede conferma utente)

**Files:** nessuno (solo comandi).

**Interfaces:**
- Consumes: `dist/` da build (Task 2), `firebase.json` con sezione `hosting` (Task 3), `public/privacy.html` (Task 5).

- [ ] **Step 1: Chiedere conferma esplicita all'utente**

Prima di eseguire qualunque comando di questo task, chiedere in chat: "Procedo con il deploy della PWA su Firebase Hosting (progetto `sfamati`, dominio tipo `sfamati.web.app`)?" — **non eseguire nessuno step successivo senza una risposta affermativa esplicita.**

- [ ] **Step 2: Build di produzione**

```bash
npm run build
```

- [ ] **Step 3: Deploy**

```bash
npx --yes firebase-tools deploy --only hosting
```

Expected: il comando stampa un URL Hosting (es. `https://sfamati.web.app`) al termine, senza errori.

- [ ] **Step 4: Verifica live**

Apri l'URL stampato dal deploy in Chrome: verifica che l'app carichi, che il manifest sia raggiungibile (DevTools → Application → Manifest) e che `<url>/privacy.html` mostri la privacy policy.

Non serve commit (nessun file modificato da questo task — il deploy pubblica solo `dist/`, già tracciata come build artifact e ignorata da git).

---

### Task 7: Documentazione — README

**Files:**
- Modify: `README.md`

**Interfaces:** nessuna — solo documentazione.

- [ ] **Step 1: Aggiungere la sezione "Build e distribuzione" a `README.md`**

Aggiungi in fondo al file (dopo l'ultima sezione esistente) il seguente testo. Prima di scrivere, se il Task 4 Step 7 (build Gradle) ha fallito per problemi di toolchain, sostituisci `<ESITO_BUILD_GRADLE>` con la descrizione esatta dell'errore incontrato e delle dipendenze mancanti (es. "richiede Android SDK e JDK 17 installati, variabile ANDROID_HOME impostata"); se invece è andata a buon fine, sostituiscilo con "Verificata: `./gradlew assembleDebug` completa con successo in locale.":

```markdown
## Build e distribuzione

### Web (PWA)

```bash
npm run build
npm run preview   # verifica locale su http://localhost:4173
```

Il build genera anche il manifest PWA e il service worker
(`vite-plugin-pwa`): aprendo l'app in Chrome, dopo qualche secondo
compare l'icona "Installa app" nella barra degli indirizzi.

Deploy su Firebase Hosting (richiede essere loggati con
`npx firebase-tools login` e avere accesso al progetto Firebase
`sfamati`):

```bash
firebase deploy --only hosting
```

### Android

```bash
npm run build:android   # build Vite + npx cap sync android
cd android
./gradlew assembleDebug   # APK di debug, installabile su un dispositivo/emulatore
```

<ESITO_BUILD_GRADLE>

Per pubblicare su Google Play serve una build di release firmata:

1. Genera una keystore (una volta sola, **conservala con cura**: senza
   non potrai più aggiornare l'app dopo la prima pubblicazione):
   ```bash
   keytool -genkey -v -keystore unicibo-release.keystore -alias unicibo -keyalg RSA -keysize 2048 -validity 10000
   ```
2. Configura la firma in `android/app/build.gradle` (sezione
   `signingConfigs`) seguendo la
   [guida ufficiale Capacitor](https://capacitorjs.com/docs/android/deploying-to-google-play).
3. `cd android && ./gradlew bundleRelease` genera l'`.aab` da caricare
   su Google Play Console.

### iOS

Non ancora pacchettizzato: richiede un Mac con Xcode e un account
Apple Developer. Il progetto è già predisposto (Capacitor è
cross-platform): quando saranno disponibili, basterà
`npx cap add ios` seguito dalla build Xcode.
```

- [ ] **Step 2: Verifica**

Rileggi la sezione aggiunta: nessun placeholder tipo `<ESITO_BUILD_GRADLE>` deve restare nel testo finale.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document PWA and Android build/distribution steps"
```
