<template>
  <div class="uc-feed">
    <PullToRefresh :refreshing="loading" @refresh="load">
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

      <div v-if="!loading && !loadError && hasAnyTaggedRecipe" class="uc-tag-filter">
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

      <RecipeCard v-for="recipe in filteredRecipes" :key="recipe.id" :recipe="recipe" />

      <p v-if="!loading && !filteredRecipes.length" class="uc-empty">
        Nessuna ricetta da mostrare per ora.
      </p>
    </PullToRefresh>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import {
  collection, query, where, orderBy, getDocs, getDoc, doc, documentId, limit
} from 'firebase/firestore'

import { db } from '@/firebase.js'
import { getJoinedGroupIds } from '@/identity.js'
import { avatarColor } from '@/utils/avatar.js'
import { TAG_OPTIONS } from '@/utils/tags.js'
import { mergeByBatch } from '@/utils/mergeBatch.js'
import RecipeCard from '@/components/RecipeCard.vue'
import PullToRefresh from '@/components/PullToRefresh.vue'

const props = defineProps({
  groupId: { type: String, default: null }
})

const loading = ref(true)
const loadError = ref('')
const brandRecipes = ref([])
const groupRecipes = ref([])
const groupNamesById = ref({})
const group = ref(null)
const filterTags = ref([])
const filterMode = ref('or')

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
  // Un post pubblicato in più gruppi a cui appartieni comparirebbe qui una
  // volta per gruppo: mergeByBatch lo riduce a una sola card (vedi
  // src/utils/mergeBatch.js). Il feed di un singolo gruppo, sopra, non ne
  // ha bisogno: mostra sempre e solo la copia di quel gruppo.
  const deduped = mergeByBatch(merged)
  // Le due query arrivano già ordinate per data (orderBy('createdAt','desc') su
  // Firestore); qui le intercalo in un'unica lista, sempre per data decrescente.
  return deduped.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
})

const hasAnyTaggedRecipe = computed(() => recipes.value.some((r) => r.tags?.length))

const filteredRecipes = computed(() => {
  if (!filterTags.value.length) return recipes.value
  return recipes.value.filter((r) => {
    const rt = r.tags || []
    return filterMode.value === 'and'
      ? filterTags.value.every((t) => rt.includes(t))
      : filterTags.value.some((t) => rt.includes(t))
  })
})

async function loadGroupFeed(groupId) {
  loading.value = true
  loadError.value = ''
  group.value = null
  groupRecipes.value = []

  try {
    const groupSnap = await getDoc(doc(db, 'groups', groupId))
    group.value = groupSnap.exists() ? { id: groupSnap.id, ...groupSnap.data() } : null

    // Sotto-collezione del gruppo (vedi firestore.rules): niente più where()
    // su 'groupId', il percorso stesso fa già da filtro, e serve anche
    // meno indice composito.
    const q = query(
      collection(db, 'groups', groupId, 'recipes'),
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
        query(collection(db, 'groups'), where(documentId(), 'in', ids), limit(10))
      )
      groupNamesById.value = Object.fromEntries(
        groupsSnap.docs.map((d) => [d.id, d.data().name])
      )

      // Una sotto-collezione per gruppo (vedi firestore.rules): niente più
      // una singola query 'in', una lettura parallela per gruppo unito.
      const perGroupSnaps = await Promise.all(
        ids.map((gid) => getDocs(query(collection(db, 'groups', gid, 'recipes'), orderBy('createdAt', 'desc'))))
      )
      groupRecipes.value = perGroupSnaps.flatMap((snap) =>
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      )
    }
  } catch (err) {
    handleLoadError(err)
    return
  }
  loading.value = false
}

function load() {
  filterTags.value = []
  filterMode.value = 'or'
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

.uc-tag-filter {
  margin-bottom: 12px;
}
</style>
