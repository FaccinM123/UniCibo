# UniCibo — Pubblicazione multi-gruppo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere di pubblicare un post in più gruppi contemporaneamente
(come copie indipendenti), togliere "Pubblico" dall'interfaccia di
pubblicazione, ed etichettare le ricette brand come "Esempio" nel feed.

**Architecture:** `NewRecipeView.vue` guadagna un multi-select per la
creazione (uno o più gruppi) mantenendo un singolo-select per la modifica di
un post esistente; ogni gruppo selezionato in creazione genera una scrittura
`addDoc` indipendente (stesso schema di oggi, nessuna modifica alle regole).
`FeedView.vue` perde la query dei post "pubblici" (non se ne creano più).
`RecipeCard.vue` etichetta esplicitamente le ricette brand.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Vuetify 3
(`v-select` con `multiple`), Firebase v10 SDK modulare (`firebase/firestore`).

**Spec:** `docs/superpowers/specs/2026-09-11-unicibo-multigroup-posting-design.md`

## Global Constraints

- Nessun framework di test nel progetto: ogni task si verifica manualmente
  (browser + console) — non `npm test`.
- Commenti nel codice solo dove il PERCHÉ non è ovvio, in italiano, stile già
  in uso nel resto del progetto.
- Nessuna modifica a `firestore.rules`/`firestore.indexes.json`/schema dati:
  ogni scrittura di gruppo usa esattamente lo schema già accettato dalle
  regole esistenti (`visibility: 'group'`, `groupId`, ecc.), solo ripetuta
  per ogni gruppo selezionato.
- `firebase deploy` non va eseguito da nessun task (nessuna modifica alle
  regole comunque, ma repetita iuvant: nessun task in questo piano tocca
  `firestore.rules`).
- Import Firebase sempre dal pacchetto modulare `firebase/firestore` già in
  uso nel progetto.

---

### Task 1: `NewRecipeView.vue` — multi-select in creazione, niente più "Pubblico"

**Files:**
- Modify: `src/views/NewRecipeView.vue`

**Interfaces:**
- Produces: nessuna interfaccia esterna nuova (è una view, non un
  componente riutilizzato altrove) — ma la Task 2 dipende dal fatto che
  questo task smetta di creare documenti con `visibility: 'public'` /
  `groupId: null` (la query che li leggeva viene rimossa lì).

- [ ] **Step 1: Rimuovere `PUBLIC_OPTION` e `destinationItems`**

Nel blocco `<script setup>`, rimuovere queste due righe:
```js
const PUBLIC_OPTION = { id: '__public__', name: 'Pubblico (visibile a tutti)' }
```
e:
```js
const destinationItems = computed(() => [PUBLIC_OPTION, ...myGroups.value])
```

- [ ] **Step 2: Sostituire `destination` con `selectedGroupIds` (creazione) e `editDestination` (modifica)**

Sostituire:
```js
const myGroups = ref([])
const destination = ref(PUBLIC_OPTION.id)
```
con:
```js
const myGroups = ref([])
const selectedGroupIds = ref([])
const editDestination = ref(null)
const publishError = ref('')
```

- [ ] **Step 3: Aggiornare il template — blocco Destinazione**

Sostituire:
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
con:
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

- [ ] **Step 4: Aggiungere il messaggio "nessun gruppo" e nascondere il form**

Il template inizia con:
```html
<template>
  <div class="uc-form-page">
    <h1 class="uc-page-title">{{ editingId ? 'Modifica ricetta' : 'Nuova ricetta' }}</h1>

    <form class="uc-form" @submit.prevent="submit">
```
Sostituire con:
```html
<template>
  <div class="uc-form-page">
    <h1 class="uc-page-title">{{ editingId ? 'Modifica ricetta' : 'Nuova ricetta' }}</h1>

    <v-alert v-if="groupsLoaded && !myGroups.length" type="info" variant="tonal" class="mb-4">
      Non fai ancora parte di nessun gruppo: serve almeno un gruppo per pubblicare.
      <RouterLink to="/gruppi">Crea o unisciti a un gruppo</RouterLink>.
    </v-alert>

    <form v-else class="uc-form" @submit.prevent="submit">
```
E aggiungere, subito dopo `const publishError = ref('')` nello script:
```js
const groupsLoaded = ref(false)
```
(`groupsLoaded` evita di mostrare l'alert per un istante mentre `myGroups`
è ancora vuoto solo perché la lettura da Firestore non è ancora arrivata —
diventa `true` solo dopo il primo caricamento in `onMounted`, vedi Step 5.)

Aggiungere `publishError` sotto il pulsante, subito prima della chiusura di
`</form>` (dopo il tag `</v-btn>` esistente):
```html
      <p v-if="publishError" class="uc-error">{{ publishError }}</p>
```

- [ ] **Step 5: Aggiornare `onMounted` — preselezione e caricamento gruppi**

Sostituire l'intero blocco `onMounted`:
```js
onMounted(async () => {
  const ids = getJoinedGroupIds().slice(0, 10) // limite della clausola 'in' di Firestore
  if (ids.length) {
    const snap = await getDocs(query(collection(db, 'groups'), where(documentId(), 'in', ids), limit(10)))
    myGroups.value = snap.docs.map((d) => ({ id: d.id, name: d.data().name }))
  }

  if (editingId.value) {
    const snapRecipe = await getDoc(recipeDocRef(editingId.value, editingGroupId.value))
    if (snapRecipe.exists()) {
      const r = snapRecipe.data()
      title.value = r.title || ''
      imageUrl.value = r.imageUrl || ''
      ingredientsRaw.value = (r.ingredients || []).join('\n')
      stepsRaw.value = (r.steps || []).join('\n')
      destination.value = r.visibility === 'public' ? PUBLIC_OPTION.id : r.groupId
    }
    return
  }

  const preselected = route.query.groupId
  if (preselected && myGroups.value.some((g) => g.id === preselected)) {
    destination.value = preselected
  }
})
```
con:
```js
onMounted(async () => {
  const ids = getJoinedGroupIds().slice(0, 10) // limite della clausola 'in' di Firestore
  if (ids.length) {
    const snap = await getDocs(query(collection(db, 'groups'), where(documentId(), 'in', ids), limit(10)))
    myGroups.value = snap.docs.map((d) => ({ id: d.id, name: d.data().name }))
  }
  groupsLoaded.value = true

  if (editingId.value) {
    const snapRecipe = await getDoc(recipeDocRef(editingId.value, editingGroupId.value))
    if (snapRecipe.exists()) {
      const r = snapRecipe.data()
      title.value = r.title || ''
      imageUrl.value = r.imageUrl || ''
      ingredientsRaw.value = (r.ingredients || []).join('\n')
      stepsRaw.value = (r.steps || []).join('\n')
      // Un vecchio post "pubblico" (visibility:'public', groupId:null) non ha
      // più una destinazione valida da preselezionare: editDestination resta
      // vuoto, l'autore deve scegliere un gruppo per poter salvare.
      editDestination.value = r.visibility === 'public' ? null : r.groupId
    }
    return
  }

  const preselected = route.query.groupId
  if (preselected && myGroups.value.some((g) => g.id === preselected)) {
    selectedGroupIds.value = [preselected]
  }
})
```

- [ ] **Step 6: Riscrivere `submit()`**

Sostituire l'intera funzione `submit`:
```js
async function submit() {
  if (!title.value.trim() || !destination.value) return
  saving.value = true
  try {
    const isPublic = destination.value === PUBLIC_OPTION.id
    const newGroupId = isPublic ? null : destination.value
    // Le ricette di gruppo vivono ora in groups/{groupId}/recipes (vedi
    // firestore.rules): "dove" un post vive è il suo PERCORSO, non più un
    // campo. Non c'è più bisogno di fotografare i membri del gruppo qui.
    const fields = {
      title: title.value.trim(),
      imageUrl: imageUrl.value || null,
      ingredients: ingredientsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean),
      steps: stepsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean)
    }

    if (editingId.value) {
      const samePlace = newGroupId === editingGroupId.value
      if (samePlace) {
        await updateDoc(recipeDocRef(editingId.value, editingGroupId.value), fields)
        router.push(newGroupId ? `/gruppi/${newGroupId}/ricetta/${editingId.value}` : `/ricetta/${editingId.value}`)
      } else {
        // Cambio di destinazione (pubblico<->gruppo, o gruppo A->gruppo B):
        // il documento va ricreato nel posto giusto. Reazioni/commenti non
        // vengono portati con sé (si riparte da zero) — semplificazione
        // accettata: spostare anche le sotto-collezioni richiederebbe una
        // Cloud Function, fuori dallo stack di questo progetto.
        const oldSnap = await getDoc(recipeDocRef(editingId.value, editingGroupId.value))
        const old = oldSnap.data() || {}
        const newRef = newGroupId
          ? doc(collection(db, 'groups', newGroupId, 'recipes'))
          : doc(collection(db, 'recipes'))
        await setDoc(newRef, {
          ...fields,
          source: 'group',
          brandName: null,
          visibility: newGroupId ? 'group' : 'public',
          groupId: newGroupId,
          authorNickname: old.authorNickname || getNickname() || 'Anonimo',
          authorId: old.authorId || getUserId(),
          reactionCounts: { cucinarlo: 0, mangiarlo: 0, nonMiPiace: 0 },
          createdAt: serverTimestamp()
        })
        await deleteDoc(recipeDocRef(editingId.value, editingGroupId.value))
        router.push(newGroupId ? `/gruppi/${newGroupId}/ricetta/${newRef.id}` : `/ricetta/${newRef.id}`)
      }
    } else {
      const docRef = newGroupId
        ? await addDoc(collection(db, 'groups', newGroupId, 'recipes'), {
            ...fields,
            source: 'group',
            brandName: null,
            visibility: 'group',
            groupId: newGroupId,
            authorNickname: getNickname() || 'Anonimo',
            authorId: getUserId(),
            reactionCounts: { cucinarlo: 0, mangiarlo: 0, nonMiPiace: 0 },
            createdAt: serverTimestamp()
          })
        : await addDoc(collection(db, 'recipes'), {
            ...fields,
            source: 'group',
            brandName: null,
            visibility: 'public',
            groupId: null,
            authorNickname: getNickname() || 'Anonimo',
            authorId: getUserId(),
            reactionCounts: { cucinarlo: 0, mangiarlo: 0, nonMiPiace: 0 },
            createdAt: serverTimestamp()
          })
      router.push(newGroupId ? `/gruppi/${newGroupId}/ricetta/${docRef.id}` : `/ricetta/${docRef.id}`)
    }
  } catch (err) {
    console.error('Errore nel pubblicare la ricetta:', err)
  } finally {
    saving.value = false
  }
}
```
con:
```js
async function submit() {
  if (!title.value.trim()) return
  if (editingId.value ? !editDestination.value : !selectedGroupIds.value.length) return
  saving.value = true
  publishError.value = ''
  try {
    const fields = {
      title: title.value.trim(),
      imageUrl: imageUrl.value || null,
      ingredients: ingredientsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean),
      steps: stepsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean)
    }

    if (editingId.value) {
      const newGroupId = editDestination.value
      const samePlace = newGroupId === editingGroupId.value
      if (samePlace) {
        await updateDoc(recipeDocRef(editingId.value, editingGroupId.value), fields)
        router.push(`/gruppi/${newGroupId}/ricetta/${editingId.value}`)
      } else {
        // Cambio di gruppo: il documento va ricreato nel posto giusto.
        // Reazioni/commenti non vengono portati con sé (si riparte da
        // zero) — semplificazione accettata: spostare anche le sotto-
        // collezioni richiederebbe una Cloud Function, fuori dallo stack
        // di questo progetto.
        const oldSnap = await getDoc(recipeDocRef(editingId.value, editingGroupId.value))
        const old = oldSnap.data() || {}
        const newRef = doc(collection(db, 'groups', newGroupId, 'recipes'))
        await setDoc(newRef, {
          ...fields,
          source: 'group',
          brandName: null,
          visibility: 'group',
          groupId: newGroupId,
          authorNickname: old.authorNickname || getNickname() || 'Anonimo',
          authorId: old.authorId || getUserId(),
          reactionCounts: { cucinarlo: 0, mangiarlo: 0, nonMiPiace: 0 },
          createdAt: serverTimestamp()
        })
        await deleteDoc(recipeDocRef(editingId.value, editingGroupId.value))
        router.push(`/gruppi/${newGroupId}/ricetta/${newRef.id}`)
      }
    } else {
      // Copie indipendenti, una per gruppo selezionato: stesso schema di
      // scrittura di sempre, ripetuto. allSettled invece di Promise.all,
      // così un fallimento su un gruppo non annulla le copie già create
      // con successo negli altri.
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
    }
  } catch (err) {
    console.error('Errore nel pubblicare la ricetta:', err)
  } finally {
    saving.value = false
  }
}
```

- [ ] **Step 7: Aggiornare la condizione `:disabled` del pulsante**

Sostituire:
```html
        :disabled="!title.trim() || !destination"
```
con:
```html
        :disabled="!title.trim() || (editingId ? !editDestination : !selectedGroupIds.length)"
```

- [ ] **Step 8: Verifica manuale**

```bash
npm run dev
```
Con un account membro di almeno 2 gruppi:
- Vai su "Nuova ricetta": verifica che il campo Destinazione sia ora a
  selezione multipla e NON offra più "Pubblico" tra le opzioni.
- Seleziona 2 gruppi, pubblica: verifica che la navigazione finisca su
  "Gestione post" e che compaiano 2 post distinti (uno per gruppo).
- Apri ciascuno dei due dal rispettivo feed di gruppo: verifica che siano
  due documenti distinti (reagisci su uno, l'altro non cambia).
- Modifica uno dei due cambiandogli gruppo: verifica che si sposti
  correttamente, l'altro resta intatto.
- Con un account SENZA nessun gruppo: vai su "Nuova ricetta", verifica che
  il form non compaia e appaia invece il messaggio con link a "Gruppi".

- [ ] **Step 9: Commit**

```bash
git add src/views/NewRecipeView.vue
git commit -m "feat(recipes): support publishing to multiple groups at once"
```

---

### Task 2: `FeedView.vue` — via la query dei post pubblici

**Files:**
- Modify: `src/views/FeedView.vue`

**Interfaces:**
- Consumes: nessuna nuova interfaccia da Task 1 — dipende solo sul fatto
  che, andando avanti, nessun nuovo documento con `visibility: 'public'`
  verrà creato (documenti già esistenti con quella forma, se ce ne fossero,
  smettono semplicemente di comparire nel feed home; nessuna migrazione
  necessaria, il progetto non ne ha nessuno al momento).

- [ ] **Step 1: Rimuovere il ref `publicRecipes`**

Sostituire:
```js
const brandRecipes = ref([])
const groupRecipes = ref([])
const publicRecipes = ref([])
const groupNamesById = ref({})
```
con:
```js
const brandRecipes = ref([])
const groupRecipes = ref([])
const groupNamesById = ref({})
```

- [ ] **Step 2: Rimuovere `publicRecipes` dal merge in `recipes`**

Sostituire:
```js
  const merged = [
    ...brandRecipes.value,
    ...publicRecipes.value,
    ...groupRecipes.value.map((r) => ({ ...r, groupName: groupNamesById.value[r.groupId] || '' }))
  ]
```
con:
```js
  const merged = [
    ...brandRecipes.value,
    ...groupRecipes.value.map((r) => ({ ...r, groupName: groupNamesById.value[r.groupId] || '' }))
  ]
```

- [ ] **Step 3: Rimuovere il blocco "1b" (query dei post pubblici) da `loadHomeFeed`**

Rimuovere queste righe (subito dopo il blocco "1. Ricette brand" dentro
`loadHomeFeed`):
```js

    // 1b. Ricette di gruppo pubblicate come "Pubblico": visibili a tutti
    // come le ricette brand, ma scritte da utenti reali.
    const publicQuery = query(
      collection(db, 'recipes'),
      where('visibility', '==', 'public'),
      orderBy('createdAt', 'desc')
    )
    const publicSnap = await getDocs(publicQuery)
    publicRecipes.value = publicSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
```
Il commento del blocco "1." resta invariato (parla solo delle ricette brand,
non serve toccarlo); il blocco "2." (post dei gruppi) resta invariato subito
dopo.

- [ ] **Step 4: Verifica manuale**

```bash
npm run dev
```
Apri il feed home (nessun `groupId` nell'URL): verifica in console che non
ci siano errori, e che il feed mostri solo ricette brand + post di gruppo
(nessuna query su `visibility=='public'` più eseguita — puoi confermarlo
anche solo leggendo il codice, dato che non esistono più post pubblici da
mostrare in questo momento nel database del progetto).

- [ ] **Step 5: Commit**

```bash
git add src/views/FeedView.vue
git commit -m "feat(feed): remove public-recipes query (Pubblico retired from UI)"
```

---

### Task 3: `RecipeCard.vue` — etichetta "Esempio" sulle ricette brand

**Files:**
- Modify: `src/components/RecipeCard.vue`

**Interfaces:**
- Nessuna nuova interfaccia — modifica solo un `computed` interno al
  componente, nessun cambio di props consumate/prodotte.

- [ ] **Step 1: Aggiornare `originLabel`**

Sostituire:
```js
// Le ricette "brand" (source: 'brand', importate da Spoonacular — vedi
// scripts/import-brand-recipes.mjs) restano tali nello schema, ma non si
// presentano come contenuto ufficiale: niente etichetta con la fonte
// esterna, si mescolano nel feed come i post di gruppo.
const originLabel = computed(() => {
  return props.recipe.source === 'group' ? props.recipe.groupName : null
})
```
con:
```js
// Le ricette "brand" (source: 'brand', importate da Spoonacular — vedi
// scripts/import-brand-recipes.mjs) sono ora etichettate "Esempio": con
// "Pubblico" tolto dall'interfaccia di pubblicazione, restano l'unico
// contenuto nel feed non scritto da un utente reale, e vanno distinte
// chiaramente da un post di gruppo.
const originLabel = computed(() => {
  if (props.recipe.source === 'brand') return 'Esempio'
  return props.recipe.source === 'group' ? props.recipe.groupName : null
})
```

- [ ] **Step 2: Verifica manuale**

```bash
npm run dev
```
Se nel database ci sono ricette brand (importate tramite
`scripts/import-brand-recipes.mjs`), apri il feed home e verifica che ogni
ricetta brand mostri "· Esempio" accanto alla data. Se il database è vuoto
di ricette brand in questo momento (verificabile con lo stesso script Admin
SDK usato nelle sessioni precedenti), verifica almeno che il codice compili
senza errori e che un post di gruppo mostri ancora correttamente il nome
del gruppo (comportamento invariato per quel ramo).

- [ ] **Step 3: Commit**

```bash
git add src/components/RecipeCard.vue
git commit -m "feat(feed): label brand recipes as example content"
```

---

## Note per la revisione finale

- Verificare che nessun task abbia toccato `firestore.rules` (vincolo
  globale — questa funzionalità non ne ha bisogno).
- Verificare che `PostManagementView.vue` non richieda modifiche: la sua
  query "i miei post" (per gruppo unito + collezione in cima) già mostra
  correttamente N copie indipendenti pubblicate dalla stessa sottomissione,
  senza bisogno di alcun cambiamento — confermarlo leggendo il file, non
  serve una modifica a parte.
