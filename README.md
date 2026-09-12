# UniCibo

Social network a gruppi invitati per condividere ricette che si cucinano
davvero tra studenti universitari — progetto d'esame per "Informatica ed
elementi di programmazione II" (UniTN, ITC).

## Stack

- Vue 3 (Composition API) + Vue Router
- Vuetify 3 (Material Design)
- Google Cloud Firestore
- Import ricette "brand" da Spoonacular (script una tantum, mai in runtime)

## Setup

1. **Installa le dipendenze**

   ```bash
   npm install
   ```

2. **Configura Firebase**

   Copia `.env.example` in `.env` e incolla i valori presi da
   Firebase Console → Panoramica progetto → Aggiungi app → Web:

   ```bash
   cp .env.example .env
   ```

3. **Copia le regole Firestore**

   Nella Firebase Console vai su Firestore Database → Regole e incolla
   il contenuto di `firestore.rules` (sono commentate: spiegano anche i
   limiti consapevoli del modello di sicurezza scelto).

4. **Avvia in locale**

   ```bash
   npm run dev
   ```

   Al primo avvio, le query del feed (`source` + `orderBy('createdAt')`)
   richiedono un indice composito che Firestore non crea da solo: se in
   console vedi l'errore `failed-precondition: The query requires an index`,
   segui il link che Firestore stampa in console (crea l'indice in un clic),
   oppure guarda `firestore.indexes.json` per la definizione esatta degli
   indici necessari.

## Popolare le ricette "brand" (opzionale, una tantum)

1. Prendi una chiave gratuita su https://spoonacular.com/food-api e
   mettila in `.env` come `SPOONACULAR_API_KEY`.
2. Scarica una chiave di servizio da Firebase Console → Impostazioni
   progetto → Account di servizio → Genera nuova chiave privata, e
   salvala come `scripts/serviceAccountKey.json` (è già in `.gitignore`).
3. Lancia:

   ```bash
   npm run import-brand-recipes
   ```

Il piano gratuito Spoonacular è limitato a 50 punti/giorno: lo script va
lanciato a mano quando serve, l'app in produzione non chiama mai
l'API in tempo reale.

## Struttura

```
src/
  firebase.js            init Firebase + esporta `db` e `auth`
  auth.js                 wrapper su Firebase Auth: sessione (authUser/
                          authReady) + azioni (email/password, Google Sign-In,
                          Apple Sign-In, reset password, cancellazione account)
  identity.js             facciata identità: combina la sessione di
                          `auth.js` col profilo Firestore di
                          `services/userProfile.js`
  services/userProfile.js profilo utente su Firestore (`users/{uid}`)
  router/index.js
  styles/tokens.css       variabili CSS con la palette del design
  utils/avatar.js          colore avatar derivato dal nickname/uid (client-side)
  views/
    AuthView.vue           login/registrazione (email+password, Google, Apple)
    NicknameSetupView.vue  primo accesso: scelta nickname dopo il login
    FeedView.vue           feed ricette brand + gruppo
    RecipeDetailView.vue   dettaglio + reazioni + commenti
    NewRecipeView.vue      form nuova ricetta
    GroupsView.vue         lista gruppi + crea/unisciti a un gruppo
    HowItWorksView.vue     pagina statica sui limiti dichiarati
  components/
    AppShell.vue          top bar + bottom nav (chrome dell'app)
    RecipeCard.vue
    ReactionBar.vue        transazione Firestore per reazioni
    CommentList.vue
firestore.rules            regole commentate
scripts/import-brand-recipes.mjs
```

## Modello dati Firestore

Nota sulle ricette "brand": a livello di dato restano `source: 'brand'` (lo
schema lo richiede), ma nell'interfaccia non si presentano come contenuto
ufficiale — nickname casuale (vedi `FAKE_NICKNAMES` in
`scripts/import-brand-recipes.mjs`), nessuna etichetta con la fonte esterna.
Si mescolano nel feed come post di esempio, indistinguibili da un post di
gruppo vero.

- `users/{uid}` — profilo utente, `uid` = id Firebase Auth. `nickname`,
  `bio`, `avatarPhoto`, `joinedGroupIds: string[]`, `createdAt: Timestamp`.
  Creato al primo accesso (`NicknameSetupView.vue`); leggibile da chiunque
  sia loggato (serve per mostrare autori/membri ovunque nell'app), ma
  creabile/modificabile/cancellabile solo dal proprietario
  (`request.auth.uid == uid` nelle `firestore.rules`).
  - `users/{uid}/private/data` — dati privati dell'utente, leggibili e
    scrivibili SOLO dal proprietario: `savedRecipeIds: string[]` (post
    salvati/bookmark). Separata dal profilo perché Firestore non ha
    sicurezza a livello di singolo campo dentro un documento.
- `recipes/{id}` — `title`, `imageUrl`, `ingredients: string[]`,
  `steps: string[]` (descrizione e procedimento uniti in un solo campo),
  `source: 'brand' | 'group'`, `brandName: string | null`,
  `groupId: string | null`, `authorNickname`, `authorId` (uid Firebase Auth
  dell'autore), `reactionCounts: { cucinarlo, mangiarlo, nonMiPiace }`
  (contatore denormalizzato), `createdAt: Timestamp`. Modificabile (titolo/
  immagine/ingredienti/procedimento/gruppo) ed eliminabile dall'autore
  tramite "Gestione post" — verificato dalle `firestore.rules`
  (`resource.data.authorId == request.auth.uid`), non solo dall'interfaccia:
  non è più possibile modificare o cancellare il post di un altro utente
  conoscendone semplicemente l'id.
  - `recipes/{id}/reactions/{authorId}` — una reazione per utente (id
    documento = uid Firebase Auth dell'autore della reazione):
    `{ type: 'cucinarlo' | 'mangiarlo' | 'nonMiPiace', updatedAt: Timestamp }`
  - `recipes/{id}/comments/{commentId}` — `{ text, authorNickname,
    authorId, createdAt: Timestamp }`
- `groups/{id}` — `name`, `inviteCode`, `createdBy` (uid dell'amministratore:
  unico che può modificare nome/descrizione/foto ed espellere membri, ora
  verificato dalle regole con `request.auth.uid == createdBy`),
  `memberIds: string[]`, `description: string`, `photoUrl: string | null`,
  `memberNicknames: { [userId]: string }` (snapshot del nickname al momento
  dell'adesione, non aggiornato retroattivamente se il membro cambia
  nickname — stessa logica di `authorNickname` sulle ricette), `createdAt: Timestamp`

## Limiti consapevoli (da spiegare all'orale)

- **Login reale via Firebase Auth**: email/password, Google Sign-In e Apple
  Sign-In (`src/auth.js`). L'identità dell'utente è il suo `uid` Firebase, non
  più un id generato lato client: le `firestore.rules` verificano
  `request.auth.uid` su ogni scrittura sensibile (profilo, ricette, reazioni,
  commenti, adesione/uscita da un gruppo), quindi non è più possibile
  scrivere, modificare o cancellare contenuti a nome di un altro utente
  semplicemente conoscendo un id. Limite residuo: la registrazione via
  email/password non verifica il possesso dell'indirizzo (nessuna
  `sendEmailVerification`), quindi un account può essere creato con
  un'email non realmente controllata da chi si registra.
- **Codice invito gruppo non è sicurezza vera**: chiunque sia loggato può
  leggere un gruppo — serve per validarne il codice invito prima di
  entrare (`allow get` in `firestore.rules`) — quindi un utente autenticato
  che interroga la collezione `groups` può unirsi a un gruppo qualsiasi senza
  avere davvero il codice. Le regole non possono verificare che chi scrive
  `memberIds` "conoscesse per davvero" il codice; una vera barriera
  richiederebbe una Cloud Function (fuori dallo stack di questo progetto).
  Mitigazione applicata (dentro le regole): le query di lista su `groups`
  sono limitate a pochi risultati per richiesta, quindi non è possibile
  scaricare l'intera collezione in una sola chiamata.
- **Solo API Firestore viste a lezione** (`addDoc`/`getDoc`/`getDocs`/
  `setDoc`/`updateDoc`/`deleteDoc`/`query`/`where`/`orderBy`): niente
  `onSnapshot` (letture singole invece di ascolto in tempo reale) né
  `runTransaction` (reazioni: lettura + scrittura separate, non atomiche).
  Scelta deliberata per un'app trattata come prototipo con un solo account
  attivo: il rischio teorico di due scritture concorrenti che si
  sovrascrivono è accettato, in cambio di restare dentro le API comuni.
  `arrayUnion`/`arrayRemove`/`deleteField` (adesione/uscita da un gruppo)
  restano invece in uso — sono ancora segnalati nei commenti del codice
  dove compaiono.
