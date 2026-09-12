<template>
  <div v-if="group" class="uc-details">
    <div class="uc-details-header">
      <input ref="fileInput" type="file" accept="image/*" class="uc-hidden-input" @change="onFileChange" />
      <div class="uc-photo-wrap" :class="{ 'uc-photo-wrap--editable': editing }" @click="editing && fileInput.click()">
        <img v-if="editForm.photoUrl" :src="editForm.photoUrl" alt="" class="uc-photo" />
        <div v-else class="uc-photo uc-photo-fallback" :style="{ background: avatarColor(groupId) }">
          <v-icon icon="mdi-account-group" size="34" color="white" />
        </div>
        <div v-if="editing" class="uc-photo-edit-badge">
          <v-icon icon="mdi-camera-outline" size="14" color="white" />
        </div>
      </div>

      <template v-if="!editing">
        <h1 class="uc-group-name">{{ group.name }}</h1>
        <p v-if="group.description" class="uc-group-description">{{ group.description }}</p>
        <p class="uc-invite-code">Codice invito <strong>{{ group.inviteCode }}</strong></p>
        <button v-if="isAdmin" type="button" class="uc-edit-link" @click="startEditing">
          <v-icon icon="mdi-pencil-outline" size="15" />
          Modifica gruppo
        </button>
      </template>
      <template v-else>
        <v-text-field v-model="editForm.name" variant="outlined" density="comfortable" hide-details class="mt-3 mb-3" />
        <v-textarea v-model="editForm.description" placeholder="Descrizione del gruppo..." variant="outlined" rows="2" hide-details class="mb-3" />
        <div class="uc-edit-actions">
          <v-btn variant="text" @click="editing = false">Annulla</v-btn>
          <v-btn variant="flat" color="primary" class="uc-pill-btn" :disabled="!editForm.name.trim()" :loading="saving" @click="saveEdits">
            Salva
          </v-btn>
        </div>
      </template>
    </div>

    <div class="uc-actions-row">
      <button type="button" class="uc-action-btn uc-action-btn--danger" @click="leaveGroup">
        <v-icon icon="mdi-logout" size="18" />
        Lascia gruppo
      </button>
    </div>

    <h2 class="uc-label">Partecipanti</h2>
    <div class="uc-member-list">
      <div v-for="m in members" :key="m.id" class="uc-member-row">
        <RouterLink :to="{ path: `/membro/${m.id}`, query: { nickname: m.nickname } }" class="uc-member-link">
          <div class="uc-member-avatar" :style="{ background: avatarColor(m.id) }">{{ avatarInitial(m.nickname) }}</div>
          <div class="uc-member-name">{{ m.nickname }}</div>
        </RouterLink>
        <span v-if="m.isAdmin" class="uc-admin-badge">Amministratore</span>
        <button v-if="isAdmin && !m.isSelf" type="button" class="uc-remove-btn" aria-label="Espelli membro" @click="removeMember(m.id)">
          <v-icon icon="mdi-account-remove-outline" size="18" />
        </button>
      </div>
    </div>
  </div>

  <v-progress-linear v-else indeterminate />
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { doc, getDoc, updateDoc, arrayRemove, deleteField } from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId, removeJoinedGroupId } from '@/identity.js'
import { avatarColor, avatarInitial } from '@/utils/avatar.js'
import { fileToCompressedDataUrl } from '@/utils/image.js'

const props = defineProps({
  groupId: { type: String, required: true }
})

const router = useRouter()
const userId = getUserId()

const group = ref(null)
const editing = ref(false)
const saving = ref(false)
const editForm = ref({ name: '', description: '', photoUrl: '' })
const fileInput = ref(null)

onMounted(async () => {
  const snap = await getDoc(doc(db, 'groups', props.groupId))
  group.value = snap.exists() ? { id: snap.id, ...snap.data() } : null
})

const isAdmin = computed(() => group.value?.createdBy === userId)

const members = computed(() => {
  if (!group.value) return []
  const nicknames = group.value.memberNicknames || {}
  return group.value.memberIds.map((id) => ({
    id,
    nickname: nicknames[id] || 'Membro',
    isAdmin: id === group.value.createdBy,
    isSelf: id === userId
  }))
})

function startEditing() {
  editForm.value = {
    name: group.value.name,
    description: group.value.description || '',
    photoUrl: group.value.photoUrl || ''
  }
  editing.value = true
}

async function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    editForm.value.photoUrl = await fileToCompressedDataUrl(file)
  } catch (err) {
    console.error('Errore nel caricare la foto del gruppo:', err)
  } finally {
    e.target.value = ''
  }
}

async function saveEdits() {
  if (!editForm.value.name.trim()) return
  saving.value = true
  try {
    const updated = {
      name: editForm.value.name.trim(),
      description: editForm.value.description.trim(),
      photoUrl: editForm.value.photoUrl || null
    }
    await updateDoc(doc(db, 'groups', props.groupId), updated)
    // Niente onSnapshot: aggiorniamo lo stato locale a mano invece di
    // aspettare un ascoltatore che ce lo rifletta indietro.
    group.value = { ...group.value, ...updated }
    editing.value = false
  } catch (err) {
    console.error('Errore nel modificare il gruppo:', err)
  } finally {
    saving.value = false
  }
}

// arrayRemove/deleteField: come arrayUnion, vanno oltre le slide del corso.
// Tolgono l'id (e il suo nickname) da memberIds/memberNicknames senza dover
// prima leggere l'intero documento gruppo.
async function leaveGroup() {
  if (!confirm(`Lasciare il gruppo "${group.value.name}"?`)) return
  try {
    await updateDoc(doc(db, 'groups', props.groupId), {
      memberIds: arrayRemove(userId),
      [`memberNicknames.${userId}`]: deleteField()
    })
    await removeJoinedGroupId(props.groupId)
    router.push('/gruppi')
  } catch (err) {
    console.error('Errore nel lasciare il gruppo:', err)
  }
}

async function removeMember(memberId) {
  const nickname = group.value.memberNicknames?.[memberId] || 'questo membro'
  if (!confirm(`Espellere ${nickname} dal gruppo?`)) return
  try {
    await updateDoc(doc(db, 'groups', props.groupId), {
      memberIds: arrayRemove(memberId),
      [`memberNicknames.${memberId}`]: deleteField()
    })
    const nicknames = { ...group.value.memberNicknames }
    delete nicknames[memberId]
    group.value = {
      ...group.value,
      memberIds: group.value.memberIds.filter((id) => id !== memberId),
      memberNicknames: nicknames
    }
  } catch (err) {
    console.error('Errore nell\'espellere il membro:', err)
  }
}
</script>

<style scoped>
.uc-details {
  padding: 8px 16px 24px;
}

.uc-details-header {
  text-align: center;
  padding: 16px 4px 20px;
  border-bottom: 1px solid var(--uc-border);
  margin-bottom: 8px;
}

.uc-hidden-input {
  display: none;
}

.uc-photo-wrap {
  position: relative;
  width: 88px;
  height: 88px;
  margin: 0 auto 12px;
}

.uc-photo-wrap--editable {
  cursor: pointer;
}

.uc-photo {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  object-fit: cover;
  display: block;
}

.uc-photo-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
}

.uc-photo-edit-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: var(--uc-primary);
  border: 2px solid var(--uc-surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.uc-group-name {
  font-size: 19px;
  font-weight: 700;
  margin: 0;
  color: var(--uc-text);
}

.uc-group-description {
  font-size: 13px;
  color: var(--uc-text-muted);
  line-height: 1.5;
  max-width: 280px;
  margin: 8px auto 0;
}

.uc-invite-code {
  font-size: 12.5px;
  color: var(--uc-text-muted);
  margin: 10px 0 0;
}

.uc-invite-code strong {
  color: var(--uc-text);
  letter-spacing: 0.04em;
}

.uc-edit-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  color: var(--uc-primary-strong);
  font-size: 13px;
  font-weight: 600;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
}

.uc-edit-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.uc-pill-btn {
  border-radius: var(--uc-radius-pill);
  text-transform: none;
  font-weight: 700;
}

.uc-actions-row {
  display: flex;
  padding: 12px 0;
}

.uc-action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 11px 0;
  border-radius: var(--uc-radius-input);
  background: var(--uc-bg);
  border: 1px solid var(--uc-border);
  color: var(--uc-text);
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}

.uc-action-btn--danger {
  color: var(--uc-delete-fg);
  background: var(--uc-delete-bg);
  border-color: transparent;
}

.uc-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--uc-text-muted);
  letter-spacing: 0.03em;
  margin: 12px 0 8px;
  text-transform: uppercase;
}

.uc-member-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.uc-member-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--uc-surface);
  border-radius: 12px;
  box-shadow: var(--uc-shadow-card);
}

.uc-member-link {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
}

.uc-member-avatar {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 15px;
  flex-shrink: 0;
}

.uc-member-name {
  flex: 1;
  min-width: 0;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--uc-text);
}

.uc-admin-badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--uc-primary-strong);
  background: var(--uc-primary-container);
  padding: 4px 9px;
  border-radius: 999px;
  flex-shrink: 0;
}

.uc-remove-btn {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--uc-text-muted);
  background: transparent;
  border: none;
  flex-shrink: 0;
}
</style>
