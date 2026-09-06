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
  firebase.js           init Firebase + esporta `db`
  identity.js            identità leggera (nickname + id anonimo + gruppi
                          a cui si è aderito, tutto in localStorage)
  router/index.js
  styles/tokens.css      variabili CSS con la palette del design
  utils/avatar.js         colore avatar derivato dal nickname/id (client-side)
  views/
    FeedView.vue          feed ricette brand + gruppo
    RecipeDetailView.vue  dettaglio + reazioni + commenti
    NewRecipeView.vue     form nuova ricetta
    GroupsView.vue        lista gruppi + crea/unisciti a un gruppo
    HowItWorksView.vue    pagina statica sui limiti dichiarati
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

- `recipes/{id}` — `title`, `imageUrl`, `ingredients: string[]`,
  `steps: string[]` (descrizione e procedimento uniti in un solo campo),
  `source: 'brand' | 'group'`, `brandName: string | null`,
  `groupId: string | null`, `authorNickname`, `authorLocalId`,
  `reactionCounts: { cucinarlo, mangiarlo, nonMiPiace }` (contatore
  denormalizzato), `createdAt: Timestamp`. Modificabile (titolo/immagine/
  ingredienti/procedimento/gruppo) ed eliminabile dall'autore tramite
  "Gestione post" — anche qui nessuna vera verifica di identità: le regole
  permettono la modifica/eliminazione a chiunque conosca l'id del documento,
  l'interfaccia mostra i pulsanti solo sui post dell'utente stesso.
  - `recipes/{id}/reactions/{authorLocalId}` — una reazione per utente:
    `{ type: 'cucinarlo' | 'mangiarlo' | 'nonMiPiace', updatedAt: Timestamp }`
  - `recipes/{id}/comments/{commentId}` — `{ text, authorNickname,
    authorLocalId, createdAt: Timestamp }`
- `groups/{id}` — `name`, `inviteCode`, `createdBy` (funge anche da
  amministratore: unico che può modificare nome/descrizione/foto ed espellere
  membri, sempre senza una vera verifica di identità), `memberIds: string[]`,
  `description: string`, `photoUrl: string | null`,
  `memberNicknames: { [userId]: string }` (snapshot del nickname al momento
  dell'adesione, non aggiornato retroattivamente se il membro cambia
  nickname — stessa logica di `authorNickname` sulle ricette), `createdAt: Timestamp`

I post salvati (bookmark) sono puramente locali (`localStorage`, come bio e
foto profilo): non fanno parte dello schema Firestore perché sono una lista
personale che nessun altro deve vedere.

## Limiti consapevoli (da spiegare all'orale)

- **Nessun vero login**: identità leggera (nickname + id anonimo generato
  con `crypto.randomUUID()`, salvati in localStorage insieme ai gruppi a cui
  si è aderito). Chi ha accesso al dispositivo può impersonare l'utente.
- **Codice invito gruppo non è sicurezza vera**: chiunque lo conosca può
  unirsi. Le `firestore.rules` non possono verificare che l'id scritto nei
  documenti corrisponda a chi sta davvero scrivendo, perché non c'è
  `request.auth` (nessuna Firebase Auth).
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
