<template>
  <div class="uc-feed">
    <template v-if="groupId">
      <RouterLink v-if="group" :to="`/gruppi/${groupId}/dettagli`" class="uc-group-header">
        <img v-if="group.photoUrl" :src="group.photoUrl" alt="" class="uc-group-icon uc-group-icon-photo" />
        <div v-else class="uc-group-icon" :style="{ background: avatarColor(groupId) }">
          <v-icon icon="mdi-account-group" size="20" color="white" />
        </div>
        <div class="uc-group-header-text">
          <div class="uc-group-name">{{ group.name }}</div>
          <div class="uc-group-meta">{{ group.memberIds.length }} partecipanti · tocca per i dettagli</div>
        </div>
        <v-icon icon="mdi-chevron-right" size="20" color="var(--uc-text-muted)" />
      </RouterLink>
    </template>
    <h1 v-else class="uc-page-title">Feed</h1>

    <v-alert v-if="!groupId && !joinedGroupIds.length" type="info" variant="tonal" class="mb-4">
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
import { ref, onMounted, computed, watch } from 'vue'
import {
  collection, query, where, orderBy, getDocs, getDoc, doc, documentId
} from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getJoinedGroupIds } from '@/identity.js'
import { avatarColor } from '@/utils/avatar.js'
import RecipeCard from '@/components/RecipeCard.vue'

const props = defineProps({
  groupId: { type: String, default: null }
})

const loading = ref(true)
const loadError = ref('')
const brandRecipes = ref([])
const groupRecipes = ref([])
const groupNamesById = ref({})
const group = ref(null)

function handleLoadError(err) {
  console.error('Errore nel caricare il feed:', err)
  loading.value = false
  loadError.value = err.code === 'failed-precondition'
    ? 'Il feed richiede un indice Firestore non ancora creato: vedi il link nella console del browser, o firestore.indexes.json.'
    : 'Errore nel caricare il feed. Riprova più tardi.'
}

const joinedGroupIds = getJoinedGroupIds()

const recipes = computed(() => {
  if (props.groupId) {
    // Feed di un singolo gruppo: solo i suoi post, niente ricette brand.
    return groupRecipes.value
  }
  const merged = [
    ...brandRecipes.value,
    ...groupRecipes.value.map((r) => ({ ...r, groupName: groupNamesById.value[r.groupId] || '' }))
  ]
  // Le due query arrivano già ordinate per data (orderBy('createdAt','desc') su
  // Firestore); qui le intercalo in un'unica lista, sempre per data decrescente.
  return merged.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
})

async function loadGroupFeed(groupId) {
  loading.value = true
  loadError.value = ''
  group.value = null
  groupRecipes.value = []

  try {
    const groupSnap = await getDoc(doc(db, 'groups', groupId))
    group.value = groupSnap.exists() ? { id: groupSnap.id, ...groupSnap.data() } : null

    const q = query(
      collection(db, 'recipes'),
      where('source', '==', 'group'),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc')
    )
    const snap = await getDocs(q)
    groupRecipes.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (err) {
    handleLoadError(err)
    return
  }
  loading.value = false
}

async function loadHomeFeed() {
  loading.value = true
  loadError.value = ''

  try {
    // 1. Ricette brand: sempre visibili a tutti, ordinate per data di pubblicazione
    const brandQuery = query(
      collection(db, 'recipes'),
      where('source', '==', 'brand'),
      orderBy('createdAt', 'desc')
    )
    const brandSnap = await getDocs(brandQuery)
    brandRecipes.value = brandSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

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
      const groupSnap = await getDocs(groupRecipesQuery)
      groupRecipes.value = groupSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    }
  } catch (err) {
    handleLoadError(err)
    return
  }
  loading.value = false
}

function load() {
  if (props.groupId) {
    loadGroupFeed(props.groupId)
  } else {
    loadHomeFeed()
  }
}

onMounted(load)
watch(() => props.groupId, load)
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

.uc-group-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 2px 16px;
  text-decoration: none;
  color: inherit;
}

.uc-group-icon {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.uc-group-icon-photo {
  object-fit: cover;
}

.uc-group-header-text {
  flex: 1;
  min-width: 0;
}

.uc-group-name {
  font-size: 17px;
  font-weight: 700;
  color: var(--uc-text);
}

.uc-group-meta {
  font-size: 12px;
  color: var(--uc-text-muted);
}

.uc-empty {
  text-align: center;
  color: var(--uc-text-muted);
  font-size: 13.5px;
  padding: 24px 0;
}
</style>
