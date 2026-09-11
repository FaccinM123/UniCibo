# UniCibo — Pubblicazione multi-gruppo, feed solo-gruppi (sotto-progetto 3 di 4, prima funzionalità)

Data: 2026-09-11
Stato: approvato in chat, in attesa di implementazione

## Contesto

Sotto-progetti 1 (autenticazione + sicurezza) e 2 (tecniche Firestore + pull-to-
refresh) sono completi e uniti su `main`. Questo documento copre la prima
funzionalità del sotto-progetto 3 — "funzionalità del mockup mai
implementate", che raggruppa diverse idee indipendenti (post multi-gruppo,
tag rapidi, profilo membro più ricco, ecc.). Ogni funzionalità di quel gruppo
avrà la propria spec/piano separati; questo documento copre **solo** la
pubblicazione multi-gruppo.

Oggi (`NewRecipeView.vue`) un post ha una singola destinazione: "Pubblico"
(finisce nella collezione in cima, visibile a tutti) oppure un singolo gruppo
di cui si è membri (finisce in `groups/{groupId}/recipes`). Il mockup
originale permetteva di scegliere più gruppi contemporaneamente per lo stesso
post.

## Decisioni prese (in chat)

- **Identità del post multi-gruppo**: copie indipendenti, una per gruppo
  scelto — non un singolo post condiviso. Ognuna ha le proprie reazioni e i
  propri commenti, indipendenti dalle altre. Scelta deliberata: un post
  davvero condiviso richiederebbe un elenco di gruppi come campo sul
  documento (invece che nel percorso), esattamente lo schema che ha causato
  il bug delle query a lista risolto con fatica nel sotto-progetto 1 — le
  copie indipendenti restano coerenti con "il gruppo di un post è il suo
  percorso, non un campo".
- **"Pubblico" tolto (per ora) dall'interfaccia**: durante questa
  discussione è emersa una decisione più ampia — niente più destinazione
  "Pubblico" nel form di pubblicazione. Da ora, pubblicare significa scegliere
  uno o più gruppi; non esiste più un modo, dall'interfaccia, di pubblicare
  un post visibile a chiunque. Motivo dichiarato dall'utente: possibile
  reintroduzione futura, non prioritaria adesso.
- **Ricette brand restano nel feed**: le ricette di esempio importate
  automaticamente (`source: 'brand'`) continuano a comparire nel feed di
  chiunque, gruppi o no — servono da contenuto di partenza. Ora etichettate
  esplicitamente "Esempio" in `RecipeCard.vue`, per chiarire che non
  provengono da un gruppo reale.
- **Feed home** = ricette brand + unione dei post di tutti i gruppi a cui si
  appartiene (la query dei post "pubblici" utente sparisce, dato che non se
  ne creeranno più dall'interfaccia).
- **Regole di sicurezza invariate**: le regole lato server restano quelle di
  oggi (tecnicamente permettono ancora di creare un post pubblico) — solo il
  client smette di offrirlo. Scelta esplicita per restare reversibile senza
  dover riaprire le regole se "Pubblico" torna in futuro.
- **Modifica di un post esistente**: resta a singola destinazione (cambi il
  gruppo di QUELLA copia, cancella+ricrea come già oggi) — il multi-select
  vale solo per la creazione di un post nuovo. Un post pubblicato in 3 gruppi
  produce 3 copie indipendenti in "Gestione post"; modificarne una non tocca
  le altre due.
- **Nessun gruppo**: chi non è ancora membro di nessun gruppo non vede il
  form di pubblicazione — un messaggio lo indirizza a creare/unirsi a un
  gruppo prima (stesso pattern già usato nel feed).

## Design

### 1. `NewRecipeView.vue` — multi-select solo in creazione

Rimuove `PUBLIC_OPTION` e `destinationItems` interamente. Introduce:
- `selectedGroupIds = ref([])` — usato SOLO in creazione (multi-select).
- `editDestination = ref(null)` — usato SOLO in modifica (singola, come
  l'attuale `destination`, ma senza più l'opzione "Pubblico": se il post in
  modifica è (raramente, dato uno schema già ripulito) un vecchio post
  pubblico, `editDestination` parte vuoto e l'autore deve scegliere un
  gruppo per salvare).

Template — il blocco "Destinazione" attuale:
```html
      <div>
        <p class="uc-label">Destinazione</p>
        <v-select
          v-model="destination"
          :items="destinationItems"
          item-title="name"
          item-value="id"
          variant="outlined"
          density="comfortable"
          hide-details
        />
      </div>
```
diventa (due varianti condizionali):
```html
      <div>
        <p class="uc-label">Destinazione</p>
        <v-select
          v-if="editingId"
          v-model="editDestination"
          :items="myGroups"
          item-title="name"
          item-value="id"
          variant="outlined"
          density="comfortable"
          hide-details
        />
        <v-select
          v-else
          v-model="selectedGroupIds"
          :items="myGroups"
          item-title="name"
          item-value="id"
          multiple
          chips
          variant="outlined"
          density="comfortable"
          hide-details
        />
      </div>
```

Se `myGroups` è vuoto (nessun gruppo, controllato dopo il primo caricamento),
tutto il form scompare a favore di un messaggio + link a `/gruppi` — stesso
testo/pattern già usato in `FeedView.vue` per il caso "non fai ancora parte
di nessun gruppo".

Bottone submit: disabilitato se `!title.trim()`, o se in modifica
`!editDestination`, o se in creazione `!selectedGroupIds.length`.

`onMounted`: la preselezione da `route.query.groupId` (quando si arriva dal
tasto "+" dentro un gruppo specifico) diventa `selectedGroupIds.value =
[preselected]` invece di `destination.value = preselected` (solo in
creazione). In modifica, `editDestination` parte dal gruppo attuale del post
(`r.groupId`) — o vuoto se il post era pubblico.

`submit()` — creazione (ramo `else`, quando `!editingId`):
```js
const results = await Promise.allSettled(
  selectedGroupIds.value.map((gid) =>
    addDoc(collection(db, 'groups', gid, 'recipes'), {
      ...fields,
      source: 'group',
      brandName: null,
      visibility: 'group',
      groupId: gid,
      authorNickname: getNickname() || 'Anonimo',
      authorId: getUserId(),
      reactionCounts: { cucinarlo: 0, mangiarlo: 0, nonMiPiace: 0 },
      createdAt: serverTimestamp()
    })
  )
)
const failures = results.filter((r) => r.status === 'rejected')
if (failures.length) {
  console.error('Errore nel pubblicare in alcuni gruppi:', failures)
  publishError.value = `Pubblicato in ${results.length - failures.length} di ${results.length} gruppi.`
}
router.push('/gestione-post')
```
(`publishError` è un nuovo `ref('')`, mostrato con un `<p class="uc-error">`
sotto il bottone, stesso stile del messaggio di errore foto già presente.)
Dopo una pubblicazione multi-gruppo si naviga a "Gestione post" — non esiste
più "la" pagina di dettaglio del post appena creato, dato che sono N copie
indipendenti; Gestione post le mostra tutte.

`submit()` — modifica (ramo `if (editingId.value)`): stessa identica logica
di oggi (stesso-posto vs. cambio-destinazione via cancella+ricrea), solo
`destination`/`newGroupId` rinominati in `editDestination`/`newGroupId` per
chiarezza — nessun cambio di comportamento.

### 2. `FeedView.vue` — via la query dei post pubblici

Rimuove interamente il blocco "1b" (query `visibility == 'public'`) e il ref
`publicRecipes`, e la sua voce nel merge dentro `recipes`. Resta invariato
tutto il resto: ricette brand, merge dei post di gruppo, `loadGroupFeed`,
`PullToRefresh`.

### 3. `RecipeCard.vue` — etichetta "Esempio" per le ricette brand

```js
const originLabel = computed(() => {
  if (props.recipe.source === 'brand') return 'Esempio'
  return props.recipe.source === 'group' ? props.recipe.groupName : null
})
```
(Prima: `props.recipe.source === 'group' ? props.recipe.groupName : null` —
le ricette brand non mostravano etichetta; ora la mostrano esplicitamente.)

## File toccati

- `src/views/NewRecipeView.vue` — multi-select in creazione, singola in
  modifica, niente più "Pubblico", messaggio "nessun gruppo", navigazione
  post-pubblicazione a Gestione post.
- `src/views/FeedView.vue` — via la query/merge dei post pubblici.
- `src/components/RecipeCard.vue` — etichetta "Esempio" sulle ricette brand.

Nessuna modifica a `firestore.rules`, `firestore.indexes.json`, schema dati,
`PostManagementView.vue` (già itera i gruppi uniti, mostra correttamente N
copie indipendenti senza modifiche), `ReactionBar.vue`/`CommentList.vue`
(reazioni/commenti restano per-copia, comportamento già corretto).

## Gestione errori

- Pubblicazione multi-gruppo parzialmente fallita: `Promise.allSettled`
  invece di `Promise.all`, così un fallimento su un gruppo non annulla le
  copie già create con successo negli altri; messaggio `publishError` con il
  conteggio di quante sono andate a buon fine.
- Nessun gruppo: messaggio + link a `/gruppi`, invece di un form con un
  multi-select vuoto e nessun modo di pubblicare.

## Verifica

Nessun framework di test nel progetto (stesso vincolo di sempre) — verifica
manuale in browser:
- Crea un account di prova, unisciti/crea 2-3 gruppi, pubblica un post
  selezionando 2 di quei gruppi: verifica che appaiano 2 copie indipendenti
  (in "Gestione post" e nei rispettivi feed di gruppo), ciascuna con le
  proprie reazioni/commenti (reagisci su una, verifica che l'altra non
  cambi).
- Verifica che il feed home mostri le ricette brand (etichettate "Esempio")
  + i post dei gruppi uniti, e NESSUN post "pubblico" (dato che non se ne
  possono più creare).
- Modifica una delle due copie cambiandone il gruppo: verifica che si
  sposti correttamente e che l'altra copia resti intatta.
- Con un account senza nessun gruppo, verifica che il form di pubblicazione
  non compaia e appaia invece il messaggio con link a "Gruppi".
