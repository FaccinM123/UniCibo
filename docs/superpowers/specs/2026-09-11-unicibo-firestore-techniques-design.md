# UniCibo — Tecniche Firestore ripristinate + pull-to-refresh (sotto-progetto 2 di 4)

Data: 2026-09-11
Stato: approvato in chat, in attesa di implementazione

## Contesto

Sotto-progetto 1 di 4 (autenticazione reale e sicurezza) è completo, deployato
e verificato dal vivo. Questo documento copre il sotto-progetto 2: ripristinare
le tecniche Firestore che erano state deliberatamente tolte per stare dentro i
vincoli del progetto d'esame — nel codice attuale sono segnalate esplicitamente
con commenti come "va oltre le slide del corso":

- `ReactionBar.vue`/`CommentList.vue` leggono una volta sola (`getDoc`/`getDocs`),
  niente `onSnapshot`: chi ha la pagina aperta non vede reazioni/commenti altrui
  finché non ricarica.
- Il conteggio delle reazioni (`recipes/{id}.reactionCounts`) viene letto e
  riscritto in due passaggi separati, non dentro una `runTransaction`: due
  reazioni concorrenti sulla stessa ricetta possono sovrascriversi a vicenda.
- Le regole di sicurezza non validano la *forma* del cambiamento su
  `reactionCounts` in scrittura (punto I5, segnalato ma non risolto nel
  sotto-progetto 1): un client che bypassa l'app potrebbe scriverci qualsiasi
  valore.

A queste si aggiunge una richiesta dell'utente emersa durante la discussione:
dato che il feed **non** diventa realtime in questo sotto-progetto (vedi sotto),
serve un modo manuale per ricaricarlo — il gesto "pull-to-refresh" in stile
Instagram (trascina verso il basso in cima alla lista, rilascia, ricarica).

## Decisioni prese (in chat)

- **Ambito del realtime**: SOLO sulla pagina di dettaglio di una ricetta aperta
  (`RecipeDetailView.vue`) — reazioni e commenti di quella ricetta si
  aggiornano dal vivo mentre la pagina è aperta. Il feed (lista ricette, sia
  home che di un gruppo) resta a caricamento singolo: niente ascoltatore
  `onSnapshot` su intere liste, per tenere sotto controllo le letture Firestore
  (piano gratuito Spark). Le card di ricetta nel feed (`RecipeCard.vue`)
  mantengono il comportamento di lettura singola già esistente.
- **Transazioni**: si applicano SEMPRE alla scrittura di una reazione (feed o
  dettaglio, live o no) — la sicurezza delle scritture concorrenti non dipende
  da dove la reazione viene cliccata.
- **Integrità `reactionCounts` nelle regole**: validazione a livello di regola,
  non solo lato client — vedi design sotto per la forma esatta (corretta dopo
  discussione: un cambio di reazione diretto tocca DUE chiavi nella stessa
  scrittura, -1 sulla vecchia e +1 sulla nuova, non una sola).
- **Pull-to-refresh**: solo sul `FeedView.vue` (home e feed di gruppo), gesto
  touch nativo (nessuna nuova dipendenza), naturalmente inerte su desktop
  (nessun evento touch senza schermo tattile — non serve disabilitarlo
  esplicitamente in base alla larghezza dello schermo).

## Design

### 1. Realtime scoped — prop `live` su `ReactionBar.vue`/`CommentList.vue`

Entrambi i componenti restano usati sia dentro le card del feed sia nella
pagina di dettaglio — non si duplicano in una versione "live" separata, perché
l'unica differenza è come leggono i dati (le scritture restano identiche).

Nuova prop opzionale `live: { type: Boolean, default: false }` su entrambi.
Solo `RecipeDetailView.vue` la passa (`:live="true"`); `RecipeCard.vue` non la
tocca (resta `false` di default, nessuna modifica a quel file).

**`ReactionBar.vue`**:
- `live === false` (comportamento attuale, invariato): `onMounted` fa
  `getDoc(recipeRef())` per `counts` e `getDoc(reactionRef(userId))` per
  `myReaction`, una volta sola.
- `live === true`: `onMounted` apre due `onSnapshot`:
  - `onSnapshot(recipeRef(), (snap) => { counts.value = snap.data()?.reactionCounts || {} })`
  - `onSnapshot(reactionRef(userId), (snap) => { myReaction.value = snap.exists() ? snap.data().type : null })`
  Entrambi gli unsubscribe (i valori di ritorno di `onSnapshot`) vengono
  salvati e chiamati in `onUnmounted`. Se `props.recipeId`/`props.groupId`
  cambiano mentre `live` è `true` (non capita oggi — un `RecipeDetailView`
  non cambia ricetta senza rimontare — ma per robustezza si aggiunge comunque
  un `watch` che chiude i vecchi listener e ne apre di nuovi).

**`CommentList.vue`**:
- `live === false` (invariato): `getDocs` una tantum in `onMounted`, e
  `postComment()` continua ad aggiungere il commento localmente via
  `comments.value.push(...)` dopo l'`addDoc` (nessun modo di saperlo
  altrimenti, dato che non c'è un ascoltatore).
- `live === true`: `onMounted` apre
  `onSnapshot(query(commentsRef(), orderBy('createdAt','asc')), (snap) => { comments.value = snap.docs.map(...) })`,
  con unsubscribe in `onUnmounted`. `postComment()` in questo caso **non**
  fa più il push locale: l'ascoltatore riceverà il nuovo commento da solo
  (evita il doppione che si avrebbe pushando E ricevendolo dal listener).

Nessuna modifica a `RecipeCard.vue` (non passa `live`, quindi resta sul path
di lettura singola già esistente).

### 2. Reazioni atomiche — `runTransaction`

`toggleReaction()` in `ReactionBar.vue` (unico punto di scrittura, condiviso
da feed e dettaglio) viene riscritta dentro `runTransaction(db, async (tx) => { ... })`:

```js
async function toggleReaction(type) {
  loading.value = type
  const recipeDoc = recipeRef()
  const myReactionDoc = reactionRef(userId)
  try {
    let nextReaction = null
    await runTransaction(db, async (tx) => {
      const recipeSnap = await tx.get(recipeDoc)
      const myReactionSnap = await tx.get(myReactionDoc)

      const currentCounts = recipeSnap.data()?.reactionCounts || {}
      const previousType = myReactionSnap.exists() ? myReactionSnap.data().type : null

      const newCounts = { ...currentCounts }
      if (previousType) {
        newCounts[previousType] = Math.max(0, (newCounts[previousType] || 0) - 1)
      }

      if (previousType === type) {
        tx.delete(myReactionDoc)
        nextReaction = null
      } else {
        newCounts[type] = (newCounts[type] || 0) + 1
        tx.set(myReactionDoc, { type, updatedAt: serverTimestamp() })
        nextReaction = type
      }

      tx.update(recipeDoc, { reactionCounts: newCounts })
    })
    myReaction.value = nextReaction
    // in modalità non-live, aggiorniamo counts a mano dato che non c'è un
    // ascoltatore che lo faccia da solo (in live, arriva già dall'onSnapshot)
    if (!props.live) {
      const fresh = await getDoc(recipeDoc)
      counts.value = fresh.data()?.reactionCounts || {}
    }
  } catch (err) {
    console.error('Errore nel salvare la reazione:', err)
  } finally {
    loading.value = null
  }
}
```

Il punto chiave rispetto a prima: tutte le letture (`tx.get`) e scritture
(`tx.set`/`tx.delete`/`tx.update`) avvengono DENTRO la stessa transazione —
Firestore garantisce che se il documento cambia tra la lettura e la scrittura
(un'altra reazione concorrente), la transazione viene ritentata automaticamente
con dati freschi, invece di sovrascrivere ciecamente. Nessun cambiamento visibile
per chi usa l'app; cambia solo la garanzia di correttezza sotto concorrenza.

### 3. Integrità `reactionCounts` nelle regole

Funzione condivisa in `firestore.rules` (definita una volta, usata sia dal
blocco `recipes` in cima sia da `groups/{groupId}/recipes`):

```
function reactionCountsValid(oldC, newC) {
  let dC = newC.cucinarlo - oldC.cucinarlo;
  let dM = newC.mangiarlo - oldC.mangiarlo;
  let dN = newC.nonMiPiace - oldC.nonMiPiace;
  return dC >= -1 && dC <= 1 && dM >= -1 && dM <= 1 && dN >= -1 && dN <= 1
    // un solo "evento utente" per scrittura: la somma dei cambi resta in [-1, +1]
    && (dC + dM + dN) >= -1 && (dC + dM + dN) <= 1
    // niente due incrementi o due decrementi insieme; +1/-1 abbinati = cambio
    // diretto di reazione (legittimo, unica scrittura che tocca due chiavi)
    && !(dC == 1 && dM == 1) && !(dC == 1 && dN == 1) && !(dM == 1 && dN == 1)
    && !(dC == -1 && dM == -1) && !(dC == -1 && dN == -1) && !(dM == -1 && dN == -1)
    && newC.cucinarlo >= 0 && newC.mangiarlo >= 0 && newC.nonMiPiace >= 0;
}
```

Usata nel branch `reactionCounts` di entrambe le regole `allow update`
esistenti (top-level `recipes` e `groups/{groupId}/recipes`), aggiungendo
`&& reactionCountsValid(resource.data.reactionCounts, request.resource.data.reactionCounts)`
alla condizione già presente (`affectedKeys().hasOnly(['reactionCounts'])`).
Non cambia nessun altro branch delle regole.

### 4. Pull-to-refresh — `src/components/PullToRefresh.vue`

Nuovo componente, usato solo da `FeedView.vue`, che avvolge il contenuto
esistente:

```html
<PullToRefresh :refreshing="loading" @refresh="load">
  <!-- contenuto attuale di FeedView.vue -->
</PullToRefresh>
```

Meccanismo (eventi touch nativi, nessuna libreria):
- `touchstart`: se `window.scrollY <= 0` (già in cima alla pagina — l'app
  scorre a livello di finestra, non ha un contenitore interno con scroll
  proprio, verificato in `AppShell.vue`), "arma" il gesto e registra la
  posizione Y iniziale del dito.
- `touchmove` (solo se armato): calcola quanto il dito si è spostato verso il
  basso, applica una `transform: translateY(...)` (con un tetto, es. 80px) al
  contenuto per spingerlo visivamente giù, rivelando un piccolo indicatore
  (`v-progress-circular` di Vuetify, già una dipendenza — nessuna nuova icona
  o libreria) sopra di esso. Chiama `preventDefault()` sul touchmove mentre è
  armato, per evitare che lo scroll/bounce nativo della pagina interferisca
  col gesto.
- `touchend`: se lo spostamento supera una soglia (~60px), emette `refresh` e
  resta in stato "refreshing" (spinner visibile, contenuto leggermente
  spostato) finché la prop `refreshing` passata dal genitore non torna a
  `false`; altrimenti (soglia non raggiunta) torna semplicemente alla
  posizione originale senza emettere nulla.

`FeedView.vue` passa la sua `loading` esistente come `:refreshing="loading"` e
richiama la sua funzione `load()` già esistente su `@refresh` — nessuna nuova
funzione di caricamento, riusa quella che c'è.

Essendo basato su eventi `touch*`, che non esistono su un mouse desktop, il
gesto è naturalmente inerte senza schermo tattile: non serve nessun controllo
esplicito su larghezza schermo o `matchMedia`.

## File toccati

- `src/components/ReactionBar.vue` — prop `live`, `onSnapshot` condizionale,
  `toggleReaction()` riscritta con `runTransaction`.
- `src/components/CommentList.vue` — prop `live`, `onSnapshot` condizionale
  sui commenti, `postComment()` senza push locale quando `live`.
- `src/views/RecipeDetailView.vue` — passa `:live="true"` a entrambi.
- `src/views/FeedView.vue` — avvolge il contenuto in `PullToRefresh`.
- `src/components/PullToRefresh.vue` — nuovo file.
- `firestore.rules` — funzione `reactionCountsValid`, usata nei due blocchi
  `recipes`.

Nessuna modifica a `RecipeCard.vue`, `NewRecipeView.vue`, `PostManagementView.vue`,
`MemberView.vue`, schema Firestore (nessun nuovo campo, nessuna migrazione dati).

## Gestione errori

- **Ascoltatori `onSnapshot`**: se falliscono (es. permessi, rete), il
  callback di errore di `onSnapshot` logga in console (`console.error`),
  coerente con lo stile già usato nel resto dell'app (nessun `onSnapshot`
  esisteva prima, quindi non c'è un pattern di gestione errori da seguire —
  si adotta lo stesso approccio "logga e non bloccare l'interfaccia" degli
  altri errori dell'app).
- **Transazione**: `runTransaction` può rifiutarsi dopo troppi tentativi in
  caso di contesa molto alta (scenario improbabile per la scala di
  quest'app) — cade nello stesso `catch` già esistente in `toggleReaction()`.
- **Pull-to-refresh**: se `load()` fallisce, `loading` torna comunque a
  `false` (già gestito da `handleLoadError` esistente in `FeedView.vue`),
  quindi lo spinner del pull-to-refresh si chiude regolarmente; l'errore
  esistente (`loadError`, mostrato con `v-alert`) resta visibile come già
  accade oggi.

## Verifica

- `npm run dev` nel worktree, verifica manuale nel browser (nessun test
  runner nel progetto, stesso vincolo del sotto-progetto 1):
  - Apri una ricetta con due account/schede diverse, reagisci/commenta da
    una: verifica che l'altra veda l'aggiornamento senza ricaricare.
  - Chiudi la pagina di dettaglio (torna al feed): verifica che gli
    ascoltatori si stacchino (nessun log/errore residuo in console dopo
    la navigazione).
  - Reagisci rapidamente più volte in sequenza (anche da account diversi
    sulla stessa ricetta) per verificare che `reactionCounts` resti
    coerente (nessun conteggio negativo o disallineato dal numero di
    documenti `reactions/*` realmente presenti).
  - Tenta di scrivere un `reactionCounts` non valido (es. +5 su una chiave)
    direttamente via script con un account autenticato: verifica
    `permission-denied`.
  - Sul feed, trascina verso il basso in cima alla lista: verifica che
    appaia l'indicatore, si ricarichi al rilascio oltre soglia, e che sotto
    soglia torni semplicemente in posizione senza ricaricare.
  - Verifica visiva desktop (mouse, nessun touch): nessun indicatore, nessun
    comportamento anomalo.
