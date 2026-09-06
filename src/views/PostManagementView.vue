<template>
  <div class="uc-management">
    <div class="uc-tabs">
      <button type="button" class="uc-tab" :class="{ 'uc-tab--active': tab === 'miei' }" @click="tab = 'miei'">
        I miei post
      </button>
      <button type="button" class="uc-tab" :class="{ 'uc-tab--active': tab === 'salvati' }" @click="tab = 'salvati'">
        Salvati
      </button>
    </div>

    <div v-if="tab === 'miei'" class="uc-grid">
      <div v-for="p in myPosts" :key="p.id" class="uc-post-card">
        <RouterLink :to="`/ricetta/${p.id}`" class="uc-post-thumb" :class="{ 'uc-post-thumb--placeholder': !p.imageUrl }">
          <img v-if="p.imageUrl" :src="p.imageUrl" :alt="p.title" />
        </RouterLink>
        <div class="uc-post-body">
          <RouterLink :to="`/ricetta/${p.id}`" class="uc-post-title">{{ p.title }}</RouterLink>
          <div class="uc-post-actions">
            <RouterLink :to="`/nuova-ricetta?edit=${p.id}`" class="uc-post-edit">
              <v-icon icon="mdi-pencil-outline" size="14" />
              Modifica
            </RouterLink>
            <button type="button" class="uc-post-delete" aria-label="Elimina post" @click="deletePost(p.id)">
              <v-icon icon="mdi-delete-outline" size="15" />
            </button>
          </div>
        </div>
      </div>
      <p v-if="!loadingMine && !myPosts.length" class="uc-empty">Non hai ancora pubblicato post.</p>
    </div>

    <div v-else class="uc-grid">
      <RouterLink v-for="p in savedPosts" :key="p.id" :to="`/ricetta/${p.id}`" class="uc-post-card uc-post-card--link">
        <div class="uc-post-thumb" :class="{ 'uc-post-thumb--placeholder': !p.imageUrl }">
          <img v-if="p.imageUrl" :src="p.imageUrl" :alt="p.title" />
        </div>
        <div class="uc-post-body">
          <div class="uc-post-title">{{ p.title }}</div>
          <div class="uc-post-meta">{{ p.authorNickname }}</div>
        </div>
      </RouterLink>
      <p v-if="!loadingSaved && !savedPosts.length" class="uc-empty">Nessun post salvato.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { collection, query, where, onSnapshot, doc, getDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId, getSavedRecipeIds } from '@/identity.js'

const tab = ref('miei')
const myPosts = ref([])
const savedPosts = ref([])
const loadingMine = ref(true)
const loadingSaved = ref(true)
let unsubMine = null

function sortByDateDesc(list) {
  return list.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
}

onMounted(() => {
  const q = query(collection(db, 'recipes'), where('authorLocalId', '==', getUserId()))
  // onSnapshot: va oltre le slide del corso, così "I miei post" si aggiorna
  // subito dopo una modifica o un'eliminazione.
  unsubMine = onSnapshot(q, (snap) => {
    myPosts.value = sortByDateDesc(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    loadingMine.value = false
  })
  loadSaved()
})

onUnmounted(() => {
  unsubMine && unsubMine()
})

async function loadSaved() {
  loadingSaved.value = true
  const ids = getSavedRecipeIds()
  const docs = await Promise.all(ids.map((id) => getDoc(doc(db, 'recipes', id))))
  savedPosts.value = sortByDateDesc(
    docs.filter((d) => d.exists()).map((d) => ({ id: d.id, ...d.data() }))
  )
  loadingSaved.value = false
}

watch(tab, (t) => {
  if (t === 'salvati') loadSaved()
})

async function deletePost(id) {
  if (!confirm('Eliminare definitivamente questo post?')) return
  try {
    await deleteDoc(doc(db, 'recipes', id))
  } catch (err) {
    console.error('Errore nell\'eliminare il post:', err)
  }
}
</script>

<style scoped>
.uc-management {
  padding-bottom: 8px;
}

.uc-tabs {
  display: flex;
  background: var(--uc-surface);
  border-bottom: 1px solid var(--uc-border);
}

.uc-tab {
  flex: 1;
  text-align: center;
  padding: 14px 0;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  color: var(--uc-text-muted);
  background: transparent;
  border: none;
  border-bottom: 2.5px solid transparent;
  font-family: inherit;
}

.uc-tab--active {
  color: var(--uc-primary-strong);
  border-bottom-color: var(--uc-primary);
}

.uc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 14px 16px;
}

.uc-post-card {
  background: var(--uc-surface);
  border-radius: 12px;
  box-shadow: var(--uc-shadow-card);
  overflow: hidden;
}

.uc-post-card--link {
  text-decoration: none;
  color: inherit;
  display: block;
}

.uc-post-thumb {
  display: block;
  height: 96px;
  overflow: hidden;
}

.uc-post-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.uc-post-thumb--placeholder {
  background: repeating-linear-gradient(
    135deg,
    var(--uc-primary-container) 0 10px,
    oklch(89% 0.035 58) 10px 20px
  );
}

.uc-post-body {
  padding: 8px 10px;
}

.uc-post-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--uc-text);
  text-decoration: none;
}

.uc-post-meta {
  font-size: 11px;
  color: var(--uc-text-muted);
  margin-top: 4px;
}

.uc-post-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}

.uc-post-edit {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px 0;
  border-radius: 8px;
  background: var(--uc-primary-container);
  color: var(--uc-primary-strong);
  font-size: 11.5px;
  font-weight: 600;
  text-decoration: none;
}

.uc-post-delete {
  width: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--uc-delete-bg);
  color: var(--uc-delete-fg);
  border: none;
  cursor: pointer;
}

.uc-empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--uc-text-muted);
  font-size: 13.5px;
  padding: 30px 0;
}
</style>
