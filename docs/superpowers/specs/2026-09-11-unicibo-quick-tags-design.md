# UniCibo — Tag rapidi (sotto-progetto 3 di 4, seconda funzionalità)

Data: 2026-09-11
Stato: approvato in chat, in attesa di implementazione

## Contesto

Sotto-progetti 1, 2 e la prima funzionalità del sotto-progetto 3
(pubblicazione multi-gruppo) sono completi e uniti su `main`. Questo
documento copre la seconda funzionalità del sotto-progetto 3 — tag rapidi
sulle ricette, presenti nel mockup originale ma mai implementati per stare
dentro i vincoli del progetto d'esame.

## Decisioni prese (in chat)

- **Elenco tag**: fisso, 3 valori — Vegetariano, Vegano, Senza glutine.
  Nessun tag personalizzato, nessun elenco configurabile.
- **Tag multipli**: una ricetta può avere più tag insieme (es. Vegana E
  Senza glutine sullo stesso post).
- **Filtro nel feed**: sì — oltre a mostrare i tag su card/dettaglio, il
  feed permette di filtrare per tag.
- **Logica del filtro con più tag selezionati**: selezionabile
  dall'utente stesso — un piccolo interruttore "Almeno uno" (OR) / "Tutti
  insieme" (AND), non una scelta fissa nel codice. Di default "Almeno uno",
  la scelta più comune quando si esplora. L'interruttore compare solo
  quando sono selezionati 2 o più tag filtro (con 0 o 1 selezionato la
  distinzione OR/AND non ha senso).
- **Filtro lato client, non query Firestore**: il feed carica già tutte le
  ricette (brand + gruppi uniti) e le fonde/ordina lato client; il filtro
  per tag fa lo stesso, filtrando la lista già caricata. Nessuna nuova
  query, nessun nuovo indice Firestore — evita di reintrodurre la classe di
  bug sulle query a lista già risolta con fatica nel sotto-progetto 1.

## Design

### 1. Schema — nuovo campo `tags`

Ogni documento ricetta (sia `recipes/{id}` in cima sia
`groups/{groupId}/recipes/{id}`) guadagna:
```
tags: string[]   // sottoinsieme di ['vegetariano', 'vegano', 'senzaGlutine']
```
Camel-case, coerente con lo stile già in uso nello schema (`nonMiPiace`,
`authorNickname`). Campo **richiesto** in scrittura (fa parte del
`keys().hasAll([...])` delle regole) ma il suo valore può essere una lista
vuota `[]` — non è richiesto scegliere almeno un tag. Le ricette esistenti
(create prima di questa funzionalità) non hanno questo campo: letto sempre
come `recipe.tags || []` lato client, mai come richiesto/presente.

### 2. `src/utils/tags.js` — elenco condiviso (nuovo file)

```js
export const TAG_OPTIONS = [
  { id: 'vegetariano', label: 'Vegetariano' },
  { id: 'vegano', label: 'Vegano' },
  { id: 'senzaGlutine', label: 'Senza glutine' }
]
```
Unica fonte di verità per i 3 valori/etichette, usata da `NewRecipeView.vue`
(selettore), `RecipeCard.vue`/`RecipeDetailView.vue` (visualizzazione),
`FeedView.vue` (filtro) — evita di ripetere l'elenco in 4 punti diversi.

### 3. `firestore.rules` — validazione

In entrambi i blocchi `recipes` (in cima e dentro `groups/{groupId}`):
- Aggiungere `'tags'` alla lista `keys().hasAll([...])` della regola
  `allow create`.
- Aggiungere `&& request.resource.data.tags is list && request.resource.data.tags.hasOnly(['vegetariano', 'vegano', 'senzaGlutine'])`
  alla stessa regola `allow create` (il metodo `.hasOnly()` esiste anche
  per le liste in Firestore Rules, non solo per le mappe — verifica che
  ogni elemento della lista sia tra quelli ammessi, in qualunque numero e
  ordine, lista vuota compresa).
- Aggiungere `'tags'` all'insieme di campi modificabili nella regola
  `allow update` che oggi copre `['title', 'imageUrl', 'ingredients', 'steps']`
  (stessa validazione hasOnly riapplicata anche lì).

### 4. `NewRecipeView.vue` — selettore tag

Nuovo `selectedTags = ref([])`, usato sia in creazione che in modifica
(unico stato, a differenza di `selectedGroupIds`/`editDestination` che
sono separati per via del vincolo "un solo gruppo in modifica, più in
creazione" — i tag non hanno questo vincolo, restano identici nei due casi).

Template — un `v-chip-group` a selezione multipla subito sotto il campo
"Descrizione e procedimento":
```html
      <div>
        <p class="uc-label">Tag</p>
        <v-chip-group v-model="selectedTags" multiple column>
          <v-chip
            v-for="opt in TAG_OPTIONS"
            :key="opt.id"
            :value="opt.id"
            variant="outlined"
            filter
          >
            {{ opt.label }}
          </v-chip>
        </v-chip-group>
      </div>
```

`onMounted` (ramo modifica): `selectedTags.value = r.tags || []`.

`submit()`: `fields` guadagna `tags: selectedTags.value` — dato che
`fields` viene già spalmato (`...fields`) sia nella creazione multi-gruppo
sia nell'aggiornamento sul posto sia nella ricreazione per cambio gruppo,
questa singola aggiunta copre automaticamente tutti e tre i percorsi di
scrittura senza toccare oltre la logica di `submit()`.

### 5. `RecipeCard.vue` e `RecipeDetailView.vue` — visualizzazione

Riga di chip piccoli sotto il titolo (card) o sotto il nome autore
(dettaglio), uno per ogni tag presente su `recipe.tags`, con l'etichetta
risolta da `TAG_OPTIONS`. Solo lettura, nessuna interazione.

### 6. `FeedView.vue` — filtro

Nuovo stato: `filterTags = ref([])`, `filterMode = ref('or')`.

Riga di chip filtro (stesso `v-chip-group multiple` pattern) sopra la
lista `RecipeCard`, più un piccolo `v-btn-toggle` a due opzioni
("Almeno uno" / "Tutti insieme") mostrato solo `v-if="filterTags.length > 1"`.

Nuovo computed `filteredRecipes`, usato al posto di `recipes` nel
`v-for`:
```js
const filteredRecipes = computed(() => {
  if (!filterTags.value.length) return recipes.value
  return recipes.value.filter((r) => {
    const rt = r.tags || []
    return filterMode.value === 'and'
      ? filterTags.value.every((t) => rt.includes(t))
      : filterTags.value.some((t) => rt.includes(t))
  })
})
```
Nessuna modifica alle funzioni di caricamento (`loadHomeFeed`/
`loadGroupFeed`) — il filtro agisce solo sul risultato già in memoria.

## File toccati

- `src/utils/tags.js` — nuovo.
- `firestore.rules` — validazione `tags` in creazione e modifica, in
  entrambi i blocchi ricette.
- `src/views/NewRecipeView.vue` — selettore tag.
- `src/components/RecipeCard.vue`, `src/views/RecipeDetailView.vue` —
  visualizzazione.
- `src/views/FeedView.vue` — filtro lato client.

Nessuna modifica a `firestore.indexes.json` (nessuna nuova query),
`PostManagementView.vue`, `ReactionBar.vue`/`CommentList.vue`.

## Gestione errori

- Nessuna nuova, oltre a quelle già esistenti in ciascun file (il campo
  `tags` segue lo stesso percorso di scrittura/errore di `title`/
  `ingredients`/`steps`, già gestito).

## Verifica

Nessun framework di test nel progetto — verifica manuale in browser:
- Pubblica una ricetta con 2 tag (Vegano + Senza glutine): verifica che
  compaiano entrambi i chip su card e dettaglio.
- Modifica quella ricetta togliendo un tag: verifica che la card si
  aggiorni di conseguenza.
- Nel feed, filtra per "Vegano": verifica che restino solo le ricette con
  quel tag (o senza filtro tutte, comprese quelle senza alcun tag).
- Seleziona 2 filtri insieme, verifica che compaia l'interruttore
  Almeno-uno/Tutti, e che cambiare interruttore cambi effettivamente i
  risultati mostrati.
- Prova a scrivere un `tags` non valido (es. `['piccante']`) direttamente
  via script con un account autenticato: verifica `permission-denied`.
