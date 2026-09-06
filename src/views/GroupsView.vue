<template>
  <div class="uc-groups-page">
    <h1 class="uc-page-title">I tuoi gruppi</h1>

    <div v-if="myGroups.length" class="uc-group-list">
      <div v-for="g in myGroups" :key="g.id" class="uc-group-row">
        <div class="uc-group-icon" :style="{ background: avatarColor(g.id) }">
          <v-icon icon="mdi-account-group" size="20" color="white" />
        </div>
        <div class="uc-group-row-text">
          <div class="uc-group-name">{{ g.name }}</div>
          <div class="uc-group-meta">
            Codice invito <strong>{{ g.inviteCode }}</strong> · {{ g.memberIds.length }} partecipanti
          </div>
        </div>
      </div>
    </div>
    <p v-else class="uc-empty">Non fai ancora parte di nessun gruppo.</p>

    <div class="uc-tabs">
      <button type="button" class="uc-tab" :class="{ 'uc-tab--active': mode === 'crea' }" @click="mode = 'crea'">
        Crea gruppo
      </button>
      <button type="button" class="uc-tab" :class="{ 'uc-tab--active': mode === 'unisci' }" @click="mode = 'unisci'">
        Unisciti
      </button>
    </div>

    <div v-if="mode === 'crea'" class="uc-tab-panel">
      <p class="uc-label">Nome gruppo</p>
      <v-text-field v-model="newGroupName" placeholder="Es. Coinquilini Via Rosmini" variant="outlined" density="comfortable" hide-details />
      <v-btn variant="flat" color="primary" class="uc-pill-btn mt-3" :loading="creating" :disabled="!newGroupName.trim()" @click="createGroup">
        Crea gruppo
      </v-btn>
    </div>

    <div v-else class="uc-tab-panel">
      <p class="uc-label">Codice invito</p>
      <v-text-field v-model="joinCode" placeholder="Es. INF118" variant="outlined" density="comfortable" hide-details @keyup.enter="joinGroup" />
      <p class="uc-hint">
        Serve il codice esatto del gruppo per unirti: non c'è un vero controllo di
        sicurezza dietro, è solo una parola d'ordine condivisa tra chi ne fa parte.
      </p>
      <v-btn variant="flat" color="secondary" class="uc-pill-btn" :loading="joining" :disabled="!joinCode.trim()" @click="joinGroup">
        Unisciti al gruppo
      </v-btn>
      <p v-if="joinError" class="uc-error">{{ joinError }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import {
  collection, addDoc, query, where, getDocs, documentId,
  doc, updateDoc, arrayUnion, serverTimestamp
} from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId, getJoinedGroupIds, addJoinedGroupId } from '@/identity.js'
import { avatarColor } from '@/utils/avatar.js'

const myGroups = ref([])
const mode = ref('crea')
const newGroupName = ref('')
const joinCode = ref('')
const creating = ref(false)
const joining = ref(false)
const joinError = ref('')

onMounted(async () => {
  const ids = getJoinedGroupIds().slice(0, 10) // limite della clausola 'in' di Firestore
  if (!ids.length) return
  const snap = await getDocs(query(collection(db, 'groups'), where(documentId(), 'in', ids)))
  myGroups.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
})

function generateInviteCode() {
  // Codice leggibile a 6 caratteri (esclude 0/O/1/I per evitare ambiguità),
  // sufficiente per un gruppo di amici, non pensato per resistere a un
  // attacco mirato (vedi limite dichiarato in firestore.rules).
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

async function createGroup() {
  if (!newGroupName.value.trim()) return
  creating.value = true
  try {
    const userId = getUserId()
    const data = {
      name: newGroupName.value.trim(),
      inviteCode: generateInviteCode(),
      createdBy: userId,
      memberIds: [userId],
      createdAt: serverTimestamp()
    }
    const docRef = await addDoc(collection(db, 'groups'), data)
    addJoinedGroupId(docRef.id)
    myGroups.value.push({ id: docRef.id, ...data })
    newGroupName.value = ''
    mode.value = 'crea'
  } catch (err) {
    console.error('Errore nel creare il gruppo:', err)
  } finally {
    creating.value = false
  }
}

async function joinGroup() {
  joinError.value = ''
  const code = joinCode.value.trim().toUpperCase()
  if (!code) return
  joining.value = true
  try {
    const q = query(collection(db, 'groups'), where('inviteCode', '==', code))
    const snap = await getDocs(q)
    if (snap.empty) {
      joinError.value = 'Codice non valido.'
      return
    }
    const groupDoc = snap.docs[0]
    const userId = getUserId()
    await updateDoc(doc(db, 'groups', groupDoc.id), {
      memberIds: arrayUnion(userId)
    })
    addJoinedGroupId(groupDoc.id)
    myGroups.value.push({
      id: groupDoc.id,
      ...groupDoc.data(),
      memberIds: [...groupDoc.data().memberIds, userId]
    })
    joinCode.value = ''
  } catch (err) {
    console.error('Errore nell\'unirsi al gruppo:', err)
    joinError.value = 'Errore, riprova.'
  } finally {
    joining.value = false
  }
}
</script>

<style scoped>
.uc-groups-page {
  padding: 14px 16px 24px;
}

.uc-page-title {
  font-size: 20px;
  font-weight: 700;
  margin: 4px 0 14px;
  color: var(--uc-text);
}

.uc-group-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.uc-group-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--uc-surface);
  border-radius: 12px;
  box-shadow: var(--uc-shadow-card);
}

.uc-group-icon {
  width: 40px;
  height: 40px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.uc-group-row-text {
  flex: 1;
  min-width: 0;
}

.uc-group-name {
  font-size: 15.5px;
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
  padding: 16px 0;
}

.uc-tabs {
  display: flex;
  background: var(--uc-surface);
  border-radius: 12px 12px 0 0;
  overflow: hidden;
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

.uc-tab-panel {
  background: var(--uc-surface);
  border-radius: 0 0 12px 12px;
  padding: 18px 16px 20px;
}

.uc-label {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--uc-text-muted);
  letter-spacing: 0.03em;
  margin: 0 0 6px;
  text-transform: uppercase;
}

.uc-hint {
  font-size: 12px;
  color: var(--uc-text-muted);
  line-height: 1.4;
  margin: 8px 0 14px;
}

.uc-pill-btn {
  border-radius: var(--uc-radius-pill);
  text-transform: none;
  font-weight: 700;
}

.uc-error {
  color: #b3261e;
  font-size: 13px;
  margin-top: 10px;
}
</style>
