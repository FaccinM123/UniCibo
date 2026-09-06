<template>
  <div class="uc-feed">
    <h1 class="uc-page-title">Feed</h1>

    <v-alert v-if="!joinedGroupIds.length" type="info" variant="tonal" class="mb-4">
      Non fai ancora parte di nessun gruppo: vedi solo le ricette consigliate.
      <RouterLink to="/gruppi">Crea o unisciti a un gruppo</RouterLink>.
    </v-alert>

    <v-progress-linear v-if="loading" indeterminate class="mb-4" />
    <v-alert v-if="loadError" type="error" variant="tonal" class="mb-4">{{ loadError }}</v-alert>

    <RecipeCard v-for="recipe in recipes" :key="recipe.id" :recipe="recipe" />

    <p v-if="!loading && !recipes.length" class="uc-empty">
      Nessuna ricetta da mostrare per ora.
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  collection, query, where, onSnapshot, orderBy, getDocs, documentId
} from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getJoinedGroupIds } from '@/identity.js'
import RecipeCard from '@/components/RecipeCard.vue'

const loading = ref(true)
const loadError = ref('')
const brandRecipes = ref([])
const groupRecipes = ref([])
const groupNamesById = ref({})

function handleSnapshotError(err) {
  console.error('Errore nel caricare il feed:', err)
  loading.value = false
  loadError.value = err.code === 'failed-precondition'
    ? 'Il feed richiede un indice Firestore non ancora creato: vedi il link nella console del browser, o firestore.indexes.json.'
    : 'Errore nel caricare il feed. Riprova più tardi.'
}

const joinedGroupIds = getJoinedGroupIds()

let unsubBrand = null
let unsubGroupRecipes = null

const recipes = computed(() => {
  const merged = [
    ...brandRecipes.value,
    ...groupRecipes.value.map((r) => ({ ...r, groupName: groupNamesById.value[r.groupId] || '' }))
  ]
  // Le due query arrivano già ordinate per data (orderBy('createdAt','desc') su
  // Firestore); qui le intercalo in un'unica lista, sempre per data decrescente.
  return merged.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
})

onMounted(async () => {
  // 1. Ricette brand: sempre visibili a tutti, ordinate per data di pubblicazione
  const brandQuery = query(
    collection(db, 'recipes'),
    where('source', '==', 'brand'),
    orderBy('createdAt', 'desc')
  )
  // onSnapshot: va oltre le slide del corso, usato per aggiornare il feed in
  // tempo reale (es. nuove ricette pubblicate da altri membri del gruppo).
  unsubBrand = onSnapshot(brandQuery, (snap) => {
    brandRecipes.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    loading.value = false
  }, handleSnapshotError)

  // 2. Ricette dei gruppi a cui l'utente ha aderito (letti da localStorage,
  // non da una query "chi è membro di cosa" su Firestore)
  if (joinedGroupIds.length) {
    const ids = joinedGroupIds.slice(0, 10) // limite della clausola 'in' di Firestore

    const groupsSnap = await getDocs(
      query(collection(db, 'groups'), where(documentId(), 'in', ids))
    )
    groupNamesById.value = Object.fromEntries(
      groupsSnap.docs.map((d) => [d.id, d.data().name])
    )

    const groupRecipesQuery = query(
      collection(db, 'recipes'),
      where('source', '==', 'group'),
      where('groupId', 'in', ids),
      orderBy('createdAt', 'desc')
    )
    unsubGroupRecipes = onSnapshot(groupRecipesQuery, (snap) => {
      groupRecipes.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }, handleSnapshotError)
  }
})

onUnmounted(() => {
  unsubBrand && unsubBrand()
  unsubGroupRecipes && unsubGroupRecipes()
})
</script>

<style scoped>
.uc-feed {
  padding: 14px 14px 8px;
}

.uc-page-title {
  font-size: 20px;
  font-weight: 700;
  margin: 4px 0 14px;
  color: var(--uc-text);
}

.uc-empty {
  text-align: center;
  color: var(--uc-text-muted);
  font-size: 13.5px;
  padding: 24px 0;
}
</style>
