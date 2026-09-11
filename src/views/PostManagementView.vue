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
        <RouterLink :to="detailPath(p)" class="uc-post-thumb" :class="{ 'uc-post-thumb--placeholder': !p.imageUrl }">
          <img v-if="p.imageUrl" :src="p.imageUrl" :alt="p.title" />
        </RouterLink>
        <div class="uc-post-body">
          <RouterLink :to="detailPath(p)" class="uc-post-title">{{ p.title }}</RouterLink>
          <div class="uc-post-actions">
            <RouterLink :to="editPath(p)" class="uc-post-edit">
              <v-icon icon="mdi-pencil-outline" size="14" />
              Modifica
            </RouterLink>
            <button type="button" class="uc-post-delete" aria-label="Elimina post" @click="deletePost(p)">
              <v-icon icon="mdi-delete-outline" size="15" />
            </button>
          </div>
        </div>
      </div>
      <p v-if="!loadingMine && !myPosts.length" class="uc-empty">Non hai ancora pubblicato post.</p>
    </div>

    <div v-else class="uc-grid">
      <RouterLink v-for="p in savedPosts" :key="p.id" :to="detailPath(p)" class="uc-post-card uc-post-card--link">
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
import { ref, watch, onMounted } from 'vue'
import { collection, query, where, getDocs, doc, getDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId, getSavedRecipeIds, getJoinedGroupIds } from '@/identity.js'

const tab = ref('miei')
const myPosts = ref([])
const savedPosts = ref([])
const loadingMine = ref(true)
const loadingSaved = ref(true)

function sortByDateDesc(list) {
  return list.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
}

function detailPath(p) {
  return p.groupId ? `/gruppi/${p.groupId}/ricetta/${p.id}` : `/ricetta/${p.id}`
}

function editPath(p) {
  return p.groupId ? `/nuova-ricetta?edit=${p.id}&groupId=${p.groupId}` : `/nuova-ricetta?edit=${p.id}`
}

async function loadMine() {
  loadingMine.value = true
  // I post pubblici/brand restano nella collezione in cima; quelli di gruppo
  // vivono ora in sotto-collezioni per gruppo (vedi firestore.rules). Niente
  // query "collection group" qui: l'accesso a quella sotto-collezione è
  // vincolato all'appartenenza al gruppo (variabile da un gruppo all'altro),
  // quindi una query che ne attraversa tanti insieme non è dimostrabile per
  // Firestore e fallisce sempre con permission-denied. Interroghiamo invece
  // un gruppo alla volta, solo quelli a cui si appartiene ora (un post
  // lasciato in un gruppo abbandonato nel frattempo non comparirà più qui).
  const groupIds = getJoinedGroupIds().slice(0, 10)
  const [topSnap, ...groupSnaps] = await Promise.all([
    getDocs(query(collection(db, 'recipes'), where('authorId', '==', getUserId()))),
    ...groupIds.map((gid) =>
      getDocs(query(collection(db, 'groups', gid, 'recipes'), where('authorId', '==', getUserId())))
    )
  ])
  const all = [
    ...topSnap.docs,
    ...groupSnaps.flatMap((snap) => snap.docs)
  ].map((d) => ({ id: d.id, ...d.data() }))
  myPosts.value = sortByDateDesc(all)
  loadingMine.value = false
}

onMounted(() => {
  loadMine()
  loadSaved()
})

async function loadSaved() {
  loadingSaved.value = true
  const ids = getSavedRecipeIds()
  const groupIds = getJoinedGroupIds().slice(0, 10)

  const topDocs = await Promise.all(ids.map((id) => getDoc(doc(db, 'recipes', id))))
  const found = new Map()
  topDocs.forEach((snap, i) => {
    if (snap.exists()) found.set(ids[i], { id: snap.id, ...snap.data() })
  })

  // Un id salvato non trovato in cima è probabilmente un post di gruppo: lo
  // cerchiamo nelle sotto-collezioni dei gruppi a cui l'utente appartiene
  // (gli stessi limiti di visibilità delle regole di sicurezza si applicano
  // comunque: un post di un gruppo lasciato non sarà più raggiungibile).
  const missingIds = ids.filter((id) => !found.has(id))
  if (missingIds.length && groupIds.length) {
    await Promise.all(missingIds.map(async (id) => {
      for (const groupId of groupIds) {
        const snap = await getDoc(doc(db, 'groups', groupId, 'recipes', id))
        if (snap.exists()) {
          found.set(id, { id: snap.id, ...snap.data() })
          return
        }
      }
    }))
  }

  savedPosts.value = sortByDateDesc(ids.filter((id) => found.has(id)).map((id) => found.get(id)))
  loadingSaved.value = false
}

watch(tab, (t) => {
  if (t === 'salvati') loadSaved()
})

async function deletePost(p) {
  if (!confirm('Eliminare definitivamente questo post?')) return
  try {
    const ref = p.groupId
      ? doc(db, 'groups', p.groupId, 'recipes', p.id)
      : doc(db, 'recipes', p.id)
    await deleteDoc(ref)
    // Niente onSnapshot: togliamo subito il post dalla lista locale invece
    // di aspettare un ascoltatore che rilevi la cancellazione.
    myPosts.value = myPosts.value.filter((post) => post.id !== p.id)
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
