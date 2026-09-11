# UniCibo — Tecniche Firestore ripristinate + pull-to-refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ripristinare `onSnapshot` (scoped alla pagina di dettaglio ricetta) e
`runTransaction` (scritture reazioni), aggiungere validazione di integrità di
`reactionCounts` nelle regole di sicurezza, e aggiungere un gesto
pull-to-refresh sul feed.

**Architecture:** `ReactionBar.vue`/`CommentList.vue` restano gli unici punti
di lettura/scrittura per reazioni/commenti (usati sia dal feed che dal
dettaglio); una nuova prop `live` fa scegliere tra lettura singola (comportamento
attuale, usato dal feed) e ascoltatore `onSnapshot` (nuovo, usato solo dalla
pagina di dettaglio). Le scritture delle reazioni passano SEMPRE da
`runTransaction`, indipendentemente da `live`. Le regole di sicurezza
aggiungono un controllo di forma sul cambiamento di `reactionCounts`. Un nuovo
componente `PullToRefresh.vue`, basato su eventi touch nativi, avvolge il
contenuto di `FeedView.vue`.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Vuetify 3, Firebase
v10 SDK modulare (`firebase/firestore`: `onSnapshot`, `runTransaction`).

**Spec:** `docs/superpowers/specs/2026-09-11-unicibo-firestore-techniques-design.md`

## Global Constraints

- Nessun framework di test nel progetto: ogni task si verifica manualmente
  (browser + console, o uno script Node one-off con l'SDK client Firebase per
  verificare le regole) — non `npm test`.
- Commenti nel codice solo dove il PERCHÉ non è ovvio (workaround, vincolo
  nascosto), in italiano, stile già in uso nel resto del progetto — niente
  commenti che spiegano il COSA.
- `firestore.rules` NON va mai deployato in produzione senza un via libera
  esplicito dell'utente in chat (stesso vincolo di tutto il sotto-progetto 1:
  l'app in produzione ha utenti/dati reali). Ogni task che tocca
  `firestore.rules` implementa e verifica la SINTASSI/logica localmente
  (lettura attenta, eventualmente `firebase deploy --only firestore:rules
  --dry-run` se disponibile) ma NON esegue il deploy: quello resta un'azione
  esplicita, fuori da questo piano, quando l'utente la richiede.
- Import Firebase: sempre dal pacchetto modulare `firebase/firestore` già in
  uso nel progetto (`import { onSnapshot, runTransaction, ... } from
  'firebase/firestore'`), mai dall'SDK legacy.
- Nessuna nuova dipendenza npm: il pull-to-refresh usa eventi touch nativi e
  `v-progress-circular` di Vuetify (già una dipendenza).
- Lo scroll dell'app avviene a livello di finestra (`window`/`document`), non
  dentro un contenitore interno — verificato in `src/components/AppShell.vue`
  (`.uc-content` non ha `overflow` proprio).

---

### Task 1: `firestore.rules` — validazione integrità `reactionCounts`

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Produces: funzione `reactionCountsValid(oldC, newC)` (Firestore Rules
  language), usata da entrambi i blocchi `recipes` per validare gli
  aggiornamenti di `reactionCounts`. Nessuna interfaccia lato client — Task 2
  la userà indirettamente scrivendo aggiornamenti che già rispettano questa
  forma (nessun cambiamento al contratto JS).

- [ ] **Step 1: Aggiungere la funzione `reactionCountsValid`**

In `firestore.rules`, subito dopo la funzione `isOwner`:

```
    function isOwner(uid) {
      return isSignedIn() && request.auth.uid == uid;
    }

    // Un aggiornamento di reactionCounts è valido solo se corrisponde a UN
    // singolo evento utente: aggiungere una reazione (+1 su una chiave),
    // toglierla (-1 su una chiave), o cambiarla direttamente (+1 su una
    // chiave e -1 su un'altra, nella STESSA scrittura — toggleReaction() in
    // ReactionBar.vue fa esattamente questo quando si passa da una reazione
    // a un'altra senza prima deselezionare). Blocca un client che scrivesse
    // conteggi arbitrari bypassando l'app (difesa in profondità: la
    // transazione in ReactionBar.vue garantisce già la correttezza per un
    // client onesto, questa regola la garantisce anche per uno che non lo è).
    function reactionCountsValid(oldC, newC) {
      let dC = newC.cucinarlo - oldC.cucinarlo;
      let dM = newC.mangiarlo - oldC.mangiarlo;
      let dN = newC.nonMiPiace - oldC.nonMiPiace;
      return dC >= -1 && dC <= 1 && dM >= -1 && dM <= 1 && dN >= -1 && dN <= 1
        && (dC + dM + dN) >= -1 && (dC + dM + dN) <= 1
        && !(dC == 1 && dM == 1) && !(dC == 1 && dN == 1) && !(dM == 1 && dN == 1)
        && !(dC == -1 && dM == -1) && !(dC == -1 && dN == -1) && !(dM == -1 && dN == -1)
        && newC.cucinarlo >= 0 && newC.mangiarlo >= 0 && newC.nonMiPiace >= 0;
    }
```

- [ ] **Step 2: Usare la funzione nel blocco `groups/{groupId}/recipes`**

Nel blocco `match /recipes/{recipeId}` DENTRO `match /groups/{groupId}`, la
regola `allow update` esistente ha questa forma (branch reazioni per primo):

```
        allow update: if
          (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactionCounts']) && isMember())
          ||
```

Aggiungere il controllo di validità a quel branch:

```
        allow update: if
          (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactionCounts'])
            && isMember()
            && reactionCountsValid(resource.data.reactionCounts, request.resource.data.reactionCounts))
          ||
```

- [ ] **Step 3: Usare la funzione nel blocco `recipes` in cima al file**

Stesso pattern, blocco `match /recipes/{recipeId}` in cima (fuori da
`groups`):

```
      allow update: if
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactionCounts']) && isSignedIn())
        ||
```

diventa:

```
      allow update: if
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactionCounts'])
          && isSignedIn()
          && reactionCountsValid(resource.data.reactionCounts, request.resource.data.reactionCounts))
        ||
```

- [ ] **Step 4: Verifica manuale — sintassi**

Leggi l'intero `firestore.rules` da cima a fondo: la funzione
`reactionCountsValid` deve comparire una volta sola (livello top, dentro
`match /databases/{database}/documents`), e deve essere chiamata da
ESATTAMENTE due punti (i due branch `reactionCounts` appena mostrati). Nessun
altro branch delle regole cambia.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules
git commit -m "feat(firestore): validate reactionCounts change shape in security rules"
```

Nota: questo task NON deploya le regole (vedi Global Constraints). Task 2
verifica solo il comportamento del client (transazione, concorrenza), non il
rifiuto di una scrittura malevola — quella verifica (uno script che tenta un
cambiamento di `reactionCounts` non valido e si aspetta `permission-denied`,
stesso pattern usato nel sotto-progetto 1 per verificare le regole dal vivo)
va fatta solo dopo che l'utente avrà dato un via libera esplicito al deploy,
fuori da questo piano.

---

### Task 2: `ReactionBar.vue` — prop `live` + `runTransaction`

**Files:**
- Modify: `src/components/ReactionBar.vue`

**Interfaces:**
- Consumes: `db` da `@/firebase.js`; `getUserId` da `@/identity.js` (invariati).
- Produces: nuova prop `live: { type: Boolean, default: false }`. Task 4
  (`RecipeDetailView.vue`) passa `:live="true"`; nessun altro consumatore di
  `ReactionBar` (`RecipeCard.vue`) viene toccato, quindi resta `false`.

- [ ] **Step 1: Aggiungere la prop `live` e gli import**

In `src/components/ReactionBar.vue`, sostituire l'import esistente:

```js
import { ref, onMounted } from 'vue'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
```

con:

```js
import { ref, onMounted, onUnmounted } from 'vue'
import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
```

(`setDoc`/`updateDoc`/`deleteDoc` non servono più: la Step 3 li sostituisce
con operazioni dentro `runTransaction`.)

E la definizione delle props:

```js
const props = defineProps({
  recipeId: { type: String, required: true },
  groupId: { type: String, default: null },
  live: { type: Boolean, default: false }
})
```

- [ ] **Step 2: Lettura — `onSnapshot` quando `live`, altrimenti invariato**

Sostituire l'attuale:

```js
onMounted(async () => {
  const recipeSnap = await getDoc(recipeRef())
  counts.value = recipeSnap.data()?.reactionCounts || {}

  const myReactionSnap = await getDoc(reactionRef(userId))
  myReaction.value = myReactionSnap.exists() ? myReactionSnap.data().type : null
})
```

con:

```js
let unsubscribeRecipe = null
let unsubscribeReaction = null

function stopListening() {
  if (unsubscribeRecipe) { unsubscribeRecipe(); unsubscribeRecipe = null }
  if (unsubscribeReaction) { unsubscribeReaction(); unsubscribeReaction = null }
}

async function loadOnce() {
  const recipeSnap = await getDoc(recipeRef())
  counts.value = recipeSnap.data()?.reactionCounts || {}

  const myReactionSnap = await getDoc(reactionRef(userId))
  myReaction.value = myReactionSnap.exists() ? myReactionSnap.data().type : null
}

function startListening() {
  unsubscribeRecipe = onSnapshot(recipeRef(), (snap) => {
    counts.value = snap.data()?.reactionCounts || {}
  }, (err) => console.error('Errore nell\'ascoltare i conteggi reazioni:', err))

  unsubscribeReaction = onSnapshot(reactionRef(userId), (snap) => {
    myReaction.value = snap.exists() ? snap.data().type : null
  }, (err) => console.error('Errore nell\'ascoltare la tua reazione:', err))
}

onMounted(() => {
  if (props.live) {
    startListening()
  } else {
    loadOnce()
  }
})

onUnmounted(stopListening)
```

- [ ] **Step 3: Scrittura — `toggleReaction()` dentro `runTransaction`**

Sostituire l'intera funzione `toggleReaction` (e il commento sopra di essa,
ormai superato) con:

```js
// Reazione singola per utente per ricetta, dentro una transazione: lettura
// e scrittura di reactions/{uid} e recipes/{id}.reactionCounts avvengono
// atomicamente, così due reazioni concorrenti sulla stessa ricetta non si
// sovrascrivono più a vicenda (Firestore ritenta la transazione da sola se
// il documento cambia tra lettura e scrittura).
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
    // In modalità non-live non c'è un ascoltatore che aggiorni counts da
    // solo: lo rileggiamo a mano. In live arriva già dall'onSnapshot.
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

`db` va importato: verificare che l'import esistente
`import { db } from '@/firebase.js'` sia già presente (lo è, riga 23 del
file attuale) — nessuna modifica a quella riga.

- [ ] **Step 4: Verifica manuale — comportamento invariato (modalità non-live)**

```bash
npm run dev
```

Apri l'app nel browser, vai su una ricetta dal FEED (non dalla pagina di
dettaglio) — `RecipeCard.vue` non passa `live`, quindi qui `ReactionBar` è
ancora in modalità lettura-singola. Clicca una reazione: il conteggio deve
aggiornarsi subito (stesso comportamento di prima). Clicca di nuovo la
stessa: deve tornare a 0 (toggle off). Nessun errore in console.

- [ ] **Step 5: Verifica manuale — transazione sotto concorrenza**

Con due account diversi (due schede del browser, o due finestre anonime),
apri la STESSA ricetta in entrambe. Clicca "Voglio cucinarlo" quasi
contemporaneamente da entrambe le schede. Ricarica entrambe le pagine: il
conteggio finale di "Voglio cucinarlo" deve essere 2 (non 1) — se prima
della Step 3 la seconda scrittura avesse sovrascritto la prima, sarebbe 1.

- [ ] **Step 6: Commit**

```bash
git add src/components/ReactionBar.vue
git commit -m "feat(reactions): add live prop with onSnapshot, rewrite toggle with runTransaction"
```

---

### Task 3: `CommentList.vue` — prop `live`

**Files:**
- Modify: `src/components/CommentList.vue`

**Interfaces:**
- Consumes: `db` da `@/firebase.js`; `getUserId`, `getNickname` da
  `@/identity.js` (invariati).
- Produces: nuova prop `live: { type: Boolean, default: false }`, stesso
  pattern del Task 2. Task 4 passa `:live="true"`.

- [ ] **Step 1: Aggiungere la prop `live` e gli import**

Sostituire:

```js
import { ref, onMounted } from 'vue'
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore'
```

con:

```js
import { ref, onMounted, onUnmounted } from 'vue'
import { collection, addDoc, getDocs, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'
```

E le props:

```js
const props = defineProps({
  recipeId: { type: String, required: true },
  groupId: { type: String, default: null },
  live: { type: Boolean, default: false }
})
```

- [ ] **Step 2: Lettura — `onSnapshot` quando `live`**

Sostituire:

```js
onMounted(async () => {
  const snap = await getDocs(query(commentsRef(), orderBy('createdAt', 'asc')))
  comments.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
})
```

con:

```js
let unsubscribeComments = null

onMounted(() => {
  if (props.live) {
    unsubscribeComments = onSnapshot(
      query(commentsRef(), orderBy('createdAt', 'asc')),
      (snap) => { comments.value = snap.docs.map((d) => ({ id: d.id, ...d.data() })) },
      (err) => console.error('Errore nell\'ascoltare i commenti:', err)
    )
  } else {
    getDocs(query(commentsRef(), orderBy('createdAt', 'asc'))).then((snap) => {
      comments.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    })
  }
})

onUnmounted(() => {
  if (unsubscribeComments) unsubscribeComments()
})
```

- [ ] **Step 3: `postComment()` — niente push locale quando `live`**

Sostituire il commento e la funzione esistenti:

```js
// Niente onSnapshot: il commento appena pubblicato viene aggiunto subito alla
// lista locale (lo conosciamo già, non serve rileggerlo da Firestore); i
// commenti di altri utenti compaiono alla prossima apertura della pagina.
async function postComment() {
  if (!newComment.value.trim()) return
  posting.value = true
  try {
    const text = newComment.value.trim()
    const authorId = getUserId()
    const authorNickname = getNickname() || 'Anonimo'
    const docRef = await addDoc(commentsRef(), {
      text,
      authorId,
      authorNickname,
      createdAt: serverTimestamp()
    })
    comments.value.push({ id: docRef.id, text, authorId, authorNickname })
    newComment.value = ''
  } catch (err) {
    console.error('Errore nel pubblicare il commento:', err)
  } finally {
    posting.value = false
  }
}
```

con:

```js
// In modalità live il commento appena pubblicato arriva già dall'ascoltatore
// onSnapshot (Step 2): niente push locale, altrimenti comparirebbe due volte
// (una dal push, una dall'ascoltatore). In modalità non-live (feed) non c'è
// un ascoltatore, quindi lo aggiungiamo a mano come prima.
async function postComment() {
  if (!newComment.value.trim()) return
  posting.value = true
  try {
    const text = newComment.value.trim()
    const authorId = getUserId()
    const authorNickname = getNickname() || 'Anonimo'
    const docRef = await addDoc(commentsRef(), {
      text,
      authorId,
      authorNickname,
      createdAt: serverTimestamp()
    })
    if (!props.live) {
      comments.value.push({ id: docRef.id, text, authorId, authorNickname })
    }
    newComment.value = ''
  } catch (err) {
    console.error('Errore nel pubblicare il commento:', err)
  } finally {
    posting.value = false
  }
}
```

- [ ] **Step 4: Verifica manuale**

Nel feed (modalità non-live): scrivi un commento, verifica che compaia
subito, nessun doppione dopo un refresh della pagina.

- [ ] **Step 5: Commit**

```bash
git add src/components/CommentList.vue
git commit -m "feat(comments): add live prop with onSnapshot listener"
```

---

### Task 4: `RecipeDetailView.vue` — attivare `live`

**Files:**
- Modify: `src/views/RecipeDetailView.vue`

**Interfaces:**
- Consumes: prop `live` prodotta dai Task 2 e 3.

- [ ] **Step 1: Passare `:live="true"` a entrambi i componenti**

Sostituire:

```html
      <ReactionBar :recipe-id="id" :group-id="groupId" />
```

con:

```html
      <ReactionBar :recipe-id="id" :group-id="groupId" :live="true" />
```

E sostituire:

```html
      <CommentList :recipe-id="id" :group-id="groupId" />
```

con:

```html
      <CommentList :recipe-id="id" :group-id="groupId" :live="true" />
```

- [ ] **Step 2: Verifica manuale — realtime end-to-end**

```bash
npm run dev
```

Apri la STESSA ricetta con due account in due schede, entrambe sulla pagina
di dettaglio (non nel feed). Da una scheda: reagisci — l'altra scheda deve
mostrare il conteggio aggiornato SENZA ricaricare. Da una scheda: scrivi un
commento — l'altra deve vederlo comparire da solo.

Poi naviga via dalla pagina di dettaglio (torna al feed) e apri la console
del browser: nessun errore residuo, nessun warning su un componente smontato
che tenta ancora di aggiornare stato (segno che `onUnmounted` funziona).

- [ ] **Step 3: Commit**

```bash
git add src/views/RecipeDetailView.vue
git commit -m "feat(recipe-detail): enable live reactions and comments"
```

---

### Task 5: `PullToRefresh.vue` — nuovo componente

**Files:**
- Create: `src/components/PullToRefresh.vue`

**Interfaces:**
- Produces: componente con prop `refreshing: { type: Boolean, default:
  false }`, evento `refresh` (nessun payload), slot di default per il
  contenuto avvolto. Task 6 lo consuma da `FeedView.vue`.

- [ ] **Step 1: Creare il componente**

```html
<template>
  <div
    class="uc-ptr"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  >
    <div class="uc-ptr-indicator" :style="{ opacity: indicatorOpacity }">
      <v-progress-circular
        :indeterminate="refreshing"
        :model-value="refreshing ? undefined : pullRatio * 100"
        size="26"
        width="3"
        color="primary"
      />
    </div>
    <div class="uc-ptr-content" :style="{ transform: `translateY(${offset}px)` }">
      <slot />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  refreshing: { type: Boolean, default: false }
})
const emit = defineEmits(['refresh'])

const THRESHOLD = 60
const MAX_PULL = 80

const armed = ref(false)
const startY = ref(0)
const offset = ref(0)
const triggered = ref(false)

const pullRatio = computed(() => Math.min(offset.value / THRESHOLD, 1))
const indicatorOpacity = computed(() => (props.refreshing ? 1 : Math.min(offset.value / 30, 1)))

function onTouchStart(e) {
  if (window.scrollY > 0) { armed.value = false; return }
  armed.value = true
  startY.value = e.touches[0].clientY
  triggered.value = false
}

function onTouchMove(e) {
  if (!armed.value) return
  const delta = e.touches[0].clientY - startY.value
  if (delta <= 0) { offset.value = 0; return }
  e.preventDefault()
  offset.value = Math.min(delta, MAX_PULL)
}

function onTouchEnd() {
  if (!armed.value) return
  armed.value = false
  if (offset.value >= THRESHOLD && !props.refreshing) {
    triggered.value = true
    emit('refresh')
  } else {
    offset.value = 0
  }
}

// Quando il genitore segnala che il caricamento è finito, richiudiamo
// l'indicatore (se lo avevamo aperto noi con un pull effettivo).
watch(() => props.refreshing, (isRefreshing) => {
  if (!isRefreshing && triggered.value) {
    offset.value = 0
    triggered.value = false
  }
})
</script>

<style scoped>
.uc-ptr {
  position: relative;
}

.uc-ptr-indicator {
  position: absolute;
  top: -36px;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.uc-ptr-content {
  transition: transform 0.15s ease-out;
}
</style>
```

- [ ] **Step 2: Verifica manuale — nessun consumatore ancora**

```bash
npm run dev
```

Nessuna pagina usa ancora `PullToRefresh.vue` (arriva nel Task 6): questo
step verifica solo che il file compili senza errori. Apri la console del
browser su una pagina qualsiasi e conferma che non ci siano errori Vite
relativi a questo nuovo file (es. import non risolto, sintassi del
template).

- [ ] **Step 3: Commit**

```bash
git add src/components/PullToRefresh.vue
git commit -m "feat: add PullToRefresh component (touch gesture, no new dependency)"
```

---

### Task 6: `FeedView.vue` — collegare `PullToRefresh`

**Files:**
- Modify: `src/views/FeedView.vue`

**Interfaces:**
- Consumes: `PullToRefresh` (prop `refreshing`, evento `refresh`) dal Task 5;
  `loading` ref e funzione `load()` già esistenti in questo file (nessuna
  modifica alla loro logica).

- [ ] **Step 1: Importare il componente**

Aggiungere, vicino agli altri import di componenti:

```js
import PullToRefresh from '@/components/PullToRefresh.vue'
```

- [ ] **Step 2: Avvolgere il contenuto del template**

Il template attuale di `FeedView.vue` è (dalla riga 1):

```html
<template>
  <div class="uc-feed">
    <template v-if="groupId">
      ...
    </template>
    <h1 v-else class="uc-page-title">Feed</h1>

    <v-alert v-if="!groupId && !joinedGroupIds.length" type="info" variant="tonal" class="mb-4">
      ...
    </v-alert>

    <v-progress-linear v-if="loading" indeterminate class="mb-4" />
    <v-alert v-if="loadError" type="error" variant="tonal" class="mb-4">{{ loadError }}</v-alert>

    <RecipeCard v-for="recipe in recipes" :key="recipe.id" :recipe="recipe" />

    <p v-if="!loading && !recipes.length" class="uc-empty">
      Nessuna ricetta da mostrare per ora.
    </p>
  </div>
</template>
```

Avvolgere tutto il contenuto interno di `.uc-feed` in `PullToRefresh`,
lasciando `.uc-feed` come contenitore esterno invariato:

```html
<template>
  <div class="uc-feed">
    <PullToRefresh :refreshing="loading" @refresh="load">
      <template v-if="groupId">
        ...
      </template>
      <h1 v-else class="uc-page-title">Feed</h1>

      <v-alert v-if="!groupId && !joinedGroupIds.length" type="info" variant="tonal" class="mb-4">
        ...
      </v-alert>

      <v-progress-linear v-if="loading" indeterminate class="mb-4" />
      <v-alert v-if="loadError" type="error" variant="tonal" class="mb-4">{{ loadError }}</v-alert>

      <RecipeCard v-for="recipe in recipes" :key="recipe.id" :recipe="recipe" />

      <p v-if="!loading && !recipes.length" class="uc-empty">
        Nessuna ricetta da mostrare per ora.
      </p>
    </PullToRefresh>
  </div>
</template>
```

(Il contenuto di `<template v-if="groupId">` e degli altri blocchi non
cambia — solo l'indentazione dentro il nuovo wrapper. Non riscrivere quella
parte, spostarla così com'è dentro `<PullToRefresh>`.)

- [ ] **Step 3: Verifica manuale — desktop (nessun touch)**

```bash
npm run dev
```

Apri il feed su desktop (mouse): nessun indicatore visibile, nessuna
differenza rispetto a prima. La pagina scorre normalmente.

- [ ] **Step 4: Verifica manuale — mobile (dispositivo reale o emulazione touch)**

Usando gli strumenti sviluppatore del browser in modalità dispositivo mobile
(che emula eventi touch), oppure un telefono reale sulla rete locale: apri
il feed, trascina verso il basso partendo dalla cima della pagina. Deve
comparire un piccolo indicatore che segue il dito; rilasciando oltre la
soglia il feed si ricarica (stesso identico contenuto se non ci sono nuovi
post, ma la funzione `load()` viene richiamata — verificabile aggiungendo
temporaneamente un log o osservando la barra di caricamento
`v-progress-linear` esistente lampeggiare). Rilasciando PRIMA della soglia,
l'indicatore torna semplicemente in posizione senza ricaricare.

- [ ] **Step 5: Commit**

```bash
git add src/views/FeedView.vue
git commit -m "feat(feed): wire up pull-to-refresh"
```

---

## Note per la revisione finale (whole-branch review)

- Verificare che NESSUN task abbia eseguito `firebase deploy` (vincolo
  globale) — il deploy resta un'azione esplicita dell'utente, fuori da
  questo piano.
- Verificare che `RecipeCard.vue` non sia stato toccato da nessun task (per
  design, resta sulla modalità non-live in entrambi i componenti che usa).
- Verificare l'assenza di doppioni nei commenti quando si passa da
  modalità non-live a live sulla stessa ricetta durante una singola sessione
  del browser (naviga: feed → dettaglio della stessa ricetta → feed →
  dettaglio di nuovo): ogni volta che `RecipeDetailView` si smonta, i due
  `onUnmounted` (Task 2 e 3) devono chiudere gli ascoltatori, altrimenti se
  ne accumulano di nuovi ad ogni visita.
