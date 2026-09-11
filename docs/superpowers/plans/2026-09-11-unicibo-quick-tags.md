# UniCibo — Tag rapidi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere 3 tag rapidi fissi (Vegetariano/Vegano/Senza glutine)
alle ricette — selezionabili alla pubblicazione, visibili su card/dettaglio,
filtrabili nel feed lato client.

**Architecture:** Un elenco condiviso (`src/utils/tags.js`) è l'unica fonte
di verità per i 3 valori/etichette. Le regole di sicurezza validano che
`tags` sia sempre un sottoinsieme di quell'elenco. Il form di pubblicazione
scrive il campo, i componenti di visualizzazione lo leggono, il feed lo
filtra su dati già caricati (nessuna nuova query Firestore).

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Vuetify 3
(`v-chip-group`, `v-chip`, `v-btn-toggle`), Firebase Rules 2.

**Spec:** `docs/superpowers/specs/2026-09-11-unicibo-quick-tags-design.md`

## Global Constraints

- Nessun framework di test nel progetto: ogni task si verifica manualmente
  (browser + console) — non `npm test`.
- Commenti nel codice solo dove il PERCHÉ non è ovvio, in italiano, stile
  già in uso nel resto del progetto.
- I 3 valori tag sono ESATTAMENTE: `vegetariano`, `vegano`, `senzaGlutine`
  (camelCase) — con etichette "Vegetariano", "Vegano", "Senza glutine".
  Nessun altro valore è mai valido.
- `tags` è un campo richiesto in scrittura ma il suo valore può essere `[]`
  (nessun tag scelto è una scelta legittima).
- Il filtro nel feed è interamente lato client: nessuna nuova query
  Firestore, nessuna modifica a `firestore.indexes.json`.
- Import Firebase sempre dal pacchetto modulare `firebase/firestore` già
  in uso nel progetto.
- `firebase deploy` va eseguito solo dopo un via libera esplicito
  dell'utente in chat — nessun task in questo piano lo esegue da solo.

---

### Task 1: `src/utils/tags.js` — elenco condiviso

**Files:**
- Create: `src/utils/tags.js`

**Interfaces:**
- Produces: `export const TAG_OPTIONS` — array di `{ id: string, label: string }`,
  esattamente 3 elementi, usato da tutti i task successivi (Task 2 ne copia
  solo gli `id` nelle regole come stringhe letterali, Task 3-5 lo importano
  direttamente).

- [ ] **Step 1: Creare il file**

```js
// Elenco fisso dei 3 tag rapidi disponibili per una ricetta — unica fonte
// di verità per id/etichetta, usata dal form di pubblicazione, dalla
// visualizzazione su card/dettaglio, e dal filtro del feed.
export const TAG_OPTIONS = [
  { id: 'vegetariano', label: 'Vegetariano' },
  { id: 'vegano', label: 'Vegano' },
  { id: 'senzaGlutine', label: 'Senza glutine' }
]
```

- [ ] **Step 2: Verifica manuale**

```bash
npx vite --port 5180
```
Apri l'app nel browser, controlla la console: nessun errore di import
(il file non è ancora usato da nessuno, questo verifica solo che sia
sintatticamente corretto e che Vite lo serva).

- [ ] **Step 3: Commit**

```bash
git add src/utils/tags.js
git commit -m "feat(tags): add shared TAG_OPTIONS constant"
```

---

### Task 2: `firestore.rules` — validazione `tags`

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: nessuna — i 3 valori ammessi sono scritti come stringhe
  letterali nelle regole (Firestore Rules non può importare
  `src/utils/tags.js`), devono restare identici a `TAG_OPTIONS` (Task 1):
  `'vegetariano'`, `'vegano'`, `'senzaGlutine'`.

- [ ] **Step 1: Aggiungere `tags` alla regola `allow create` del blocco `groups/{groupId}/recipes`**

Nel blocco `match /recipes/{recipeId}` DENTRO `match /groups/{groupId}`,
la regola `allow create` esistente ha questa forma:

```
        allow create: if isMember()
                      && request.resource.data.authorId == request.auth.uid
                      && request.resource.data.source == 'group'
                      && request.resource.data.visibility == 'group'
                      && request.resource.data.groupId == groupId
                      && request.resource.data.brandName == null
                      && request.resource.data.keys().hasAll(
                           ['title', 'imageUrl', 'ingredients', 'steps', 'source', 'brandName',
                            'visibility', 'groupId', 'authorNickname', 'authorId', 'reactionCounts', 'createdAt']
                         )
                      && request.resource.data.title is string
                      && request.resource.data.ingredients is list
                      && request.resource.data.steps is list
                      && request.resource.data.authorNickname is string
                      && request.resource.data.reactionCounts == {'cucinarlo': 0, 'mangiarlo': 0, 'nonMiPiace': 0}
                      && request.resource.data.createdAt is timestamp;
```

Sostituire con (aggiunto `'tags'` alla lista `hasAll` e due righe di
validazione):

```
        allow create: if isMember()
                      && request.resource.data.authorId == request.auth.uid
                      && request.resource.data.source == 'group'
                      && request.resource.data.visibility == 'group'
                      && request.resource.data.groupId == groupId
                      && request.resource.data.brandName == null
                      && request.resource.data.keys().hasAll(
                           ['title', 'imageUrl', 'ingredients', 'steps', 'source', 'brandName',
                            'visibility', 'groupId', 'authorNickname', 'authorId', 'reactionCounts',
                            'tags', 'createdAt']
                         )
                      && request.resource.data.title is string
                      && request.resource.data.ingredients is list
                      && request.resource.data.steps is list
                      && request.resource.data.authorNickname is string
                      && request.resource.data.reactionCounts == {'cucinarlo': 0, 'mangiarlo': 0, 'nonMiPiace': 0}
                      && request.resource.data.tags is list
                      && request.resource.data.tags.hasOnly(['vegetariano', 'vegano', 'senzaGlutine'])
                      && request.resource.data.createdAt is timestamp;
```

- [ ] **Step 2: Aggiungere `tags` alla regola `allow update` (contenuti) dello stesso blocco**

Trovare, subito sotto la regola `allow create` appena modificata:

```
        allow update: if
          (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactionCounts'])
            && isMember()
            && reactionCountsValid(resource.data.reactionCounts, request.resource.data.reactionCounts))
          ||
          (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['title', 'imageUrl', 'ingredients', 'steps'])
            && isSignedIn() && resource.data.authorId == request.auth.uid);
```

Sostituire il secondo branch (contenuti) con:

```
        allow update: if
          (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactionCounts'])
            && isMember()
            && reactionCountsValid(resource.data.reactionCounts, request.resource.data.reactionCounts))
          ||
          (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['title', 'imageUrl', 'ingredients', 'steps', 'tags'])
            && isSignedIn() && resource.data.authorId == request.auth.uid
            && request.resource.data.tags is list
            && request.resource.data.tags.hasOnly(['vegetariano', 'vegano', 'senzaGlutine']));
```

- [ ] **Step 3: Ripetere gli stessi due cambi nel blocco `recipes` in cima al file**

Il blocco `match /recipes/{recipeId}` FUORI da `groups` ha la stessa forma
(create e update), con `visibility == 'public'`/`groupId == null` al posto
di `visibility == 'group'`/`groupId == groupId`. Applicare
ESATTAMENTE la stessa modifica di Step 1 e Step 2 (aggiungere `'tags'` a
`hasAll`, aggiungere le due righe di validazione list/hasOnly alla create,
aggiungere `'tags'` e la stessa validazione al branch contenuti della
update) — la regola `create` di questo blocco oggi è:

```
      allow create: if isSignedIn()
                    && request.resource.data.source == 'group'
                    && request.resource.data.visibility == 'public'
                    && request.resource.data.groupId == null
                    && request.resource.data.brandName == null
                    && request.resource.data.authorId == request.auth.uid
                    && request.resource.data.keys().hasAll(
                         ['title', 'imageUrl', 'ingredients', 'steps', 'source', 'brandName',
                          'visibility', 'groupId', 'authorNickname', 'authorId', 'reactionCounts', 'createdAt']
                       )
                    && request.resource.data.title is string
                    && request.resource.data.ingredients is list
                    && request.resource.data.steps is list
                    && request.resource.data.authorNickname is string
                    && request.resource.data.reactionCounts == {'cucinarlo': 0, 'mangiarlo': 0, 'nonMiPiace': 0}
                    && request.resource.data.createdAt is timestamp;
```
diventa:
```
      allow create: if isSignedIn()
                    && request.resource.data.source == 'group'
                    && request.resource.data.visibility == 'public'
                    && request.resource.data.groupId == null
                    && request.resource.data.brandName == null
                    && request.resource.data.authorId == request.auth.uid
                    && request.resource.data.keys().hasAll(
                         ['title', 'imageUrl', 'ingredients', 'steps', 'source', 'brandName',
                          'visibility', 'groupId', 'authorNickname', 'authorId', 'reactionCounts',
                          'tags', 'createdAt']
                       )
                    && request.resource.data.title is string
                    && request.resource.data.ingredients is list
                    && request.resource.data.steps is list
                    && request.resource.data.authorNickname is string
                    && request.resource.data.reactionCounts == {'cucinarlo': 0, 'mangiarlo': 0, 'nonMiPiace': 0}
                    && request.resource.data.tags is list
                    && request.resource.data.tags.hasOnly(['vegetariano', 'vegano', 'senzaGlutine'])
                    && request.resource.data.createdAt is timestamp;
```
E la regola `update` di questo blocco oggi è:
```
      allow update: if
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactionCounts'])
          && isSignedIn()
          && reactionCountsValid(resource.data.reactionCounts, request.resource.data.reactionCounts))
        ||
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['title', 'imageUrl', 'ingredients', 'steps'])
          && isSignedIn() && resource.data.authorId == request.auth.uid);
```
diventa:
```
      allow update: if
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactionCounts'])
          && isSignedIn()
          && reactionCountsValid(resource.data.reactionCounts, request.resource.data.reactionCounts))
        ||
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['title', 'imageUrl', 'ingredients', 'steps', 'tags'])
          && isSignedIn() && resource.data.authorId == request.auth.uid
          && request.resource.data.tags is list
          && request.resource.data.tags.hasOnly(['vegetariano', 'vegano', 'senzaGlutine']));
```

- [ ] **Step 4: Verifica manuale — sintassi**

Leggi l'intero `firestore.rules` da cima a fondo: la stringa `'tags'` deve
comparire esattamente 4 volte in `hasAll`/`hasOnly` di `allow create`
(2 blocchi) e 4 volte in `affectedKeys().hasOnly(...)`/`tags.hasOnly(...)`
di `allow update` (2 blocchi) — 8 occorrenze totali, nessuna nel resto del
file. NON deployare queste regole (vedi Global Constraints) — resta locale
finché l'utente non dà un via libera esplicito, fuori da questo piano.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules
git commit -m "feat(firestore): validate tags field on recipe create/update"
```

---

### Task 3: `NewRecipeView.vue` — selettore tag

**Files:**
- Modify: `src/views/NewRecipeView.vue`

**Interfaces:**
- Consumes: `TAG_OPTIONS` da `src/utils/tags.js` (Task 1).
- Produces: nessuna interfaccia esterna nuova — ma il campo `tags` scritto
  qui è quello letto dai Task 4 (visualizzazione) e Task 5 (filtro).

- [ ] **Step 1: Importare `TAG_OPTIONS`**

Aggiungere, vicino agli altri import:
```js
import { TAG_OPTIONS } from '@/utils/tags.js'
```

- [ ] **Step 2: Aggiungere lo stato `selectedTags`**

Vicino alla dichiarazione di `editDestination`/`selectedGroupIds`,
aggiungere:
```js
const selectedTags = ref([])
```

- [ ] **Step 3: Aggiungere il blocco tag al template**

Subito dopo il blocco "Descrizione e procedimento" (il `<div>` con
`stepsRaw`) e prima del blocco "Destinazione", aggiungere:
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

- [ ] **Step 4: Precompilare `selectedTags` in modifica**

Nel blocco `onMounted`, dentro `if (editingId.value) { ... }`, subito dopo
la riga che imposta `editDestination.value`, aggiungere:
```js
      selectedTags.value = r.tags || []
```

- [ ] **Step 5: Includere `tags` nei dati scritti**

Nella funzione `submit()`, dentro la costruzione dell'oggetto `fields`:
```js
    const fields = {
      title: title.value.trim(),
      imageUrl: imageUrl.value || null,
      ingredients: ingredientsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean),
      steps: stepsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean)
    }
```
Sostituire con:
```js
    const fields = {
      title: title.value.trim(),
      imageUrl: imageUrl.value || null,
      ingredients: ingredientsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean),
      steps: stepsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean),
      tags: selectedTags.value
    }
```
(`fields` viene già spalmato con `...fields` in tutti e tre i percorsi di
scrittura di `submit()` — creazione multi-gruppo, aggiornamento sul posto,
ricreazione per cambio gruppo — quindi questa singola aggiunta li copre
tutti senza altre modifiche a `submit()`.)

- [ ] **Step 6: Verifica manuale**

```bash
npx vite --port 5180
```
Con un account membro di almeno un gruppo: apri "Nuova ricetta", verifica
che compaiano i 3 chip tag, selezionabili insieme (multi-selezione).
Pubblica con 2 tag selezionati, poi apri quella ricetta in modifica:
verifica che i 2 chip risultino già selezionati.

- [ ] **Step 7: Commit**

```bash
git add src/views/NewRecipeView.vue
git commit -m "feat(recipes): add quick-tag selector to publish form"
```

---

### Task 4: `RecipeCard.vue` + `RecipeDetailView.vue` — visualizzazione tag

**Files:**
- Modify: `src/components/RecipeCard.vue`
- Modify: `src/views/RecipeDetailView.vue`

**Interfaces:**
- Consumes: `TAG_OPTIONS` da `src/utils/tags.js` (Task 1); campo
  `recipe.tags` scritto da Task 3 (assente su ricette più vecchie, sempre
  letto come `recipe.tags || []`).

- [ ] **Step 1: `RecipeCard.vue` — import e helper etichetta**

Aggiungere l'import:
```js
import { TAG_OPTIONS } from '@/utils/tags.js'
```
E, vicino a `originLabel`, un piccolo helper per risolvere id → etichetta:
```js
const tagLabels = computed(() => {
  return (props.recipe.tags || []).map((id) => TAG_OPTIONS.find((t) => t.id === id)?.label || id)
})
```

- [ ] **Step 2: `RecipeCard.vue` — template**

Subito dopo il blocco `<RouterLink :to="detailPath" class="uc-card-body-link">...</RouterLink>`
e prima di `<div class="uc-card-actions">`, aggiungere:
```html
    <div v-if="tagLabels.length" class="uc-card-tags">
      <v-chip v-for="label in tagLabels" :key="label" size="x-small" variant="tonal" color="primary">
        {{ label }}
      </v-chip>
    </div>
```
E nel blocco `<style scoped>`, aggiungere:
```css
.uc-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 14px 8px;
}
```

- [ ] **Step 3: `RecipeDetailView.vue` — import e helper etichetta**

Stesso pattern di Step 1, nel file `src/views/RecipeDetailView.vue`:
```js
import { TAG_OPTIONS } from '@/utils/tags.js'
```
```js
const tagLabels = computed(() => {
  return (recipe.value?.tags || []).map((id) => TAG_OPTIONS.find((t) => t.id === id)?.label || id)
})
```
(qui la fonte è `recipe.value`, un `ref` popolato in `onMounted` — non
`props.recipe` come in RecipeCard.vue, perché questa view legge il
documento direttamente invece di riceverlo come prop.)

- [ ] **Step 4: `RecipeDetailView.vue` — template**

Subito dopo il blocco `<div class="uc-detail-author">...</div>` e prima
di `<div class="uc-detail-reactions">`, aggiungere:
```html
    <div v-if="tagLabels.length" class="uc-detail-tags">
      <v-chip v-for="label in tagLabels" :key="label" size="small" variant="tonal" color="primary">
        {{ label }}
      </v-chip>
    </div>
```
E nel blocco `<style scoped>`, aggiungere:
```css
.uc-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px 8px;
}
```

- [ ] **Step 5: Verifica manuale**

```bash
npx vite --port 5180
```
Apri la ricetta pubblicata con 2 tag nel Task 3: verifica che i 2 chip
etichetta ("Vegano", "Senza glutine") compaiano sia sulla card nel feed
sia nella pagina di dettaglio. Apri una ricetta SENZA tag (es. una
importata prima di questa funzionalità, se presente): verifica che non
compaia nessuna riga tag (né vuota né con errori in console).

- [ ] **Step 6: Commit**

```bash
git add src/components/RecipeCard.vue src/views/RecipeDetailView.vue
git commit -m "feat(recipes): display tag chips on card and detail view"
```

---

### Task 5: `FeedView.vue` — filtro per tag

**Files:**
- Modify: `src/views/FeedView.vue`

**Interfaces:**
- Consumes: `TAG_OPTIONS` da `src/utils/tags.js` (Task 1); campo
  `recipe.tags` scritto da Task 3.

- [ ] **Step 1: Importare `TAG_OPTIONS`**

```js
import { TAG_OPTIONS } from '@/utils/tags.js'
```

- [ ] **Step 2: Aggiungere lo stato del filtro**

Vicino alle altre dichiarazioni `ref`:
```js
const filterTags = ref([])
const filterMode = ref('or')
```

- [ ] **Step 3: Aggiungere `filteredRecipes`**

Subito dopo il computed `recipes` esistente, aggiungere:
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

- [ ] **Step 4: Template — riga filtro**

Subito dopo il blocco `<v-alert v-if="loadError" ...>{{ loadError }}</v-alert>`
e prima di `<RecipeCard v-for="recipe in recipes" ...>`, aggiungere:
```html
      <div class="uc-tag-filter">
        <v-chip-group v-model="filterTags" multiple column>
          <v-chip
            v-for="opt in TAG_OPTIONS"
            :key="opt.id"
            :value="opt.id"
            variant="outlined"
            filter
            size="small"
          >
            {{ opt.label }}
          </v-chip>
        </v-chip-group>
        <v-btn-toggle v-if="filterTags.length > 1" v-model="filterMode" mandatory density="compact" class="mb-2">
          <v-btn value="or" size="small">Almeno uno</v-btn>
          <v-btn value="and" size="small">Tutti insieme</v-btn>
        </v-btn-toggle>
      </div>
```

- [ ] **Step 5: Template — usare `filteredRecipes` invece di `recipes`**

Sostituire:
```html
      <RecipeCard v-for="recipe in recipes" :key="recipe.id" :recipe="recipe" />

      <p v-if="!loading && !recipes.length" class="uc-empty">
        Nessuna ricetta da mostrare per ora.
      </p>
```
con:
```html
      <RecipeCard v-for="recipe in filteredRecipes" :key="recipe.id" :recipe="recipe" />

      <p v-if="!loading && !filteredRecipes.length" class="uc-empty">
        Nessuna ricetta da mostrare per ora.
      </p>
```
(Il messaggio "Nessuna ricetta da mostrare" ora si applica anche al caso
"ci sono ricette ma nessuna corrisponde al filtro" — stesso testo va bene
per entrambi i casi, non serve un messaggio a parte solo per il filtro.)

- [ ] **Step 6: Stile**

Nel blocco `<style scoped>`, aggiungere:
```css
.uc-tag-filter {
  margin-bottom: 12px;
}
```

- [ ] **Step 7: Verifica manuale**

```bash
npx vite --port 5180
```
Con almeno 2 ricette pubblicate coi tag del Task 3 (una Vegana, una Senza
glutine, una senza tag): apri il feed, seleziona il filtro "Vegano":
verifica che restino solo le ricette con quel tag. Seleziona anche "Senza
glutine" (2 filtri attivi): verifica che compaia l'interruttore
Almeno-uno/Tutti, di default su "Almeno uno" — verifica che con "Almeno
uno" veda entrambe le ricette taggate, e passando a "Tutti insieme" veda
solo quella (se esiste) che ha ENTRAMBI i tag. Deseleziona tutti i filtri:
verifica che tornino visibili tutte le ricette, incluse quelle senza tag.

- [ ] **Step 8: Commit**

```bash
git add src/views/FeedView.vue
git commit -m "feat(feed): add client-side tag filter with OR/AND toggle"
```

---

## Note per la revisione finale

- Verificare che nessun task abbia eseguito `firebase deploy` (vincolo
  globale) — il deploy resta un'azione esplicita dell'utente, fuori da
  questo piano.
- Verificare che i 3 valori tag (`vegetariano`, `vegano`, `senzaGlutine`)
  siano scritti IDENTICI in tutti i punti dove compaiono come stringa
  letterale: `src/utils/tags.js` (Task 1), le 4 occorrenze in
  `firestore.rules` (Task 2) — nessuna discrepanza di maiuscole/minuscole
  o refusi, altrimenti le regole rifiuterebbero scritture valide o
  accetterebbero valori diversi da quelli mostrati nell'interfaccia.
- Verificare che `firestore.indexes.json` non sia stato toccato da nessun
  task (il filtro è lato client, nessuna nuova query).
