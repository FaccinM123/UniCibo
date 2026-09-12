<template>
  <v-dialog :model-value="modelValue" max-width="380" @update:model-value="(v) => emit('update:modelValue', v)">
    <v-card class="uc-profile-card">
      <div class="uc-profile-header">
        <input ref="fileInput" type="file" accept="image/*" class="uc-hidden-input" @change="onFileChange" />
        <div class="uc-avatar-picker" @click="fileInput.click()">
          <img v-if="avatarPhoto" :src="avatarPhoto" alt="" class="uc-avatar-photo" />
          <div v-else class="uc-avatar-fallback" :style="{ background: avatarColor(userId) }">
            {{ avatarInitial(nickname) }}
          </div>
          <div class="uc-avatar-edit-badge">
            <v-icon icon="mdi-camera-outline" size="14" color="white" />
          </div>
        </div>
        <p class="uc-avatar-hint">Tocca per cambiare foto</p>
        <p v-if="imageError" class="uc-error">{{ imageError }}</p>
      </div>

      <v-card-text class="pt-0">
        <p class="uc-label">Nickname</p>
        <v-text-field v-model="nickname" variant="outlined" density="comfortable" hide-details class="mb-4" />

        <p class="uc-label">Descrizione</p>
        <v-textarea v-model="bio" placeholder="Racconta qualcosa di te..." variant="outlined" rows="3" hide-details class="mb-4" />

        <RouterLink to="/gestione-post" class="uc-management-link" @click="close">
          <v-icon icon="mdi-view-grid-outline" size="20" color="var(--uc-primary-strong)" />
          <div class="uc-management-link-text">
            <div class="uc-management-link-title">Gestione post</div>
            <div class="uc-management-link-subtitle">I tuoi post e i post salvati</div>
          </div>
          <v-icon icon="mdi-chevron-right" size="20" color="var(--uc-text-muted)" />
        </RouterLink>

        <a :href="FEEDBACK_FORM_URL" target="_blank" rel="noopener" class="uc-management-link mt-2">
          <v-icon icon="mdi-message-alert-outline" size="20" color="var(--uc-primary-strong)" />
          <div class="uc-management-link-text">
            <div class="uc-management-link-title">Invia feedback</div>
            <div class="uc-management-link-subtitle">Segnala un problema o un consiglio</div>
          </div>
          <v-icon icon="mdi-open-in-new" size="18" color="var(--uc-text-muted)" />
        </a>

        <div class="uc-account-actions">
          <button type="button" class="uc-account-btn" @click="logout">
            <v-icon icon="mdi-logout" size="18" />
            Esci
          </button>
          <button type="button" class="uc-account-btn uc-account-btn--danger" :disabled="deleting" @click="removeAccount">
            <v-icon icon="mdi-account-remove-outline" size="18" />
            {{ deleting ? 'Eliminazione...' : 'Elimina account' }}
          </button>
        </div>
      </v-card-text>

      <v-card-actions class="pt-0">
        <v-btn variant="text" @click="close">Annulla</v-btn>
        <v-spacer />
        <v-btn variant="flat" color="primary" class="uc-pill-btn" :disabled="!nickname.trim()" @click="save">
          Salva
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { getUserId, getNickname, getBio, getAvatarPhoto, updateProfile, signOutUser, deleteAccount } from '@/identity.js'
import { avatarColor, avatarInitial } from '@/utils/avatar.js'
import { fileToCompressedDataUrl } from '@/utils/image.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const FEEDBACK_FORM_URL = 'https://forms.gle/3GoTKMMjqXZAMcaT9'

const userId = getUserId()
const nickname = ref(getNickname())
const bio = ref(getBio())
const avatarPhoto = ref(getAvatarPhoto())
const imageError = ref('')
const fileInput = ref(null)
const saving = ref(false)
const deleting = ref(false)

watch(() => props.modelValue, (open) => {
  if (open) {
    nickname.value = getNickname()
    bio.value = getBio()
    avatarPhoto.value = getAvatarPhoto()
    imageError.value = ''
  }
})

async function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  imageError.value = ''
  try {
    avatarPhoto.value = await fileToCompressedDataUrl(file)
  } catch (err) {
    console.error('Errore nel caricare la foto profilo:', err)
    imageError.value = err.message || 'Errore nel caricare la foto.'
  } finally {
    e.target.value = ''
  }
}

function close() {
  emit('update:modelValue', false)
}

async function save() {
  if (!nickname.value.trim()) return
  saving.value = true
  try {
    await updateProfile({ nickname: nickname.value, bio: bio.value, avatarPhoto: avatarPhoto.value })
    close()
  } catch (err) {
    console.error('Errore nel salvare il profilo:', err)
  } finally {
    saving.value = false
  }
}

async function logout() {
  await signOutUser()
  close()
}

async function removeAccount() {
  if (!confirm('Eliminare definitivamente il tuo account? Non potrai annullare questa azione.')) return
  deleting.value = true
  try {
    await deleteAccount()
  } catch (err) {
    console.error('Errore nell\'eliminare l\'account:', err)
    deleting.value = false
  }
}
</script>

<style scoped>
.uc-profile-card {
  border-radius: var(--uc-radius-card);
}

.uc-profile-header {
  text-align: center;
  padding: 28px 20px 8px;
}

.uc-hidden-input {
  display: none;
}

.uc-avatar-picker {
  position: relative;
  width: 76px;
  height: 76px;
  margin: 0 auto;
  cursor: pointer;
}

.uc-avatar-photo {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  object-fit: cover;
  display: block;
}

.uc-avatar-fallback {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 28px;
}

.uc-avatar-edit-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--uc-primary);
  border: 2px solid var(--uc-surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.uc-avatar-hint {
  font-size: 12px;
  color: var(--uc-text-muted);
  margin: 10px 0 0;
}

.uc-label {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--uc-text-muted);
  letter-spacing: 0.03em;
  margin: 0 0 6px;
  text-transform: uppercase;
}

.uc-pill-btn {
  border-radius: var(--uc-radius-pill);
  text-transform: none;
  font-weight: 700;
}

.uc-error {
  color: #b3261e;
  font-size: 12.5px;
  margin: 8px 0 0;
}

.uc-management-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--uc-bg);
  border-radius: 12px;
  text-decoration: none;
}

.uc-management-link-text {
  flex: 1;
  min-width: 0;
}

.uc-management-link-title {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--uc-text);
}

.uc-management-link-subtitle {
  font-size: 11.5px;
  color: var(--uc-text-muted);
}

.uc-account-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.uc-account-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--uc-bg);
  border: none;
  color: var(--uc-text);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.uc-account-btn--danger {
  color: var(--uc-delete-fg);
  background: var(--uc-delete-bg);
}

.uc-account-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
