<template>
  <div class="uc-form-page">
    <h1 class="uc-page-title">{{ editingId ? 'Modifica ricetta' : 'Nuova ricetta' }}</h1>

    <v-alert v-if="!myGroups.length" type="warning" variant="tonal" class="mb-4">
      Devi far parte di almeno un gruppo per pubblicare una ricetta.
      <RouterLink to="/gruppi">Vai a Gruppi</RouterLink>.
    </v-alert>

    <form v-else class="uc-form" @submit.prevent="submit">
      <div>
        <p class="uc-label">Titolo</p>
        <v-text-field v-model="title" placeholder="Es. Pasta alla carbonara" variant="outlined" density="comfortable" hide-details required />
      </div>

      <div>
        <p class="uc-label">Foto ricetta</p>
        <input ref="fileInput" type="file" accept="image/*" class="uc-hidden-input" @change="onFileChange" />
        <div v-if="!imageUrl" class="uc-image-picker" @click="fileInput.click()">
          <v-icon icon="mdi-image-plus-outline" size="26" />
          <span>carica foto dalla galleria</span>
        </div>
        <div v-else class="uc-image-preview">
          <img :src="imageUrl" alt="Anteprima foto ricetta" />
          <button type="button" class="uc-image-remove" @click="imageUrl = ''">
            <v-icon icon="mdi-close" size="16" color="white" />
          </button>
        </div>
        <p v-if="imageError" class="uc-error">{{ imageError }}</p>
      </div>

      <div>
        <p class="uc-label">Ingredienti</p>
        <v-textarea v-model="ingredientsRaw" placeholder="Un ingrediente per riga" variant="outlined" rows="4" hide-details />
      </div>

      <div>
        <p class="uc-label">Descrizione e procedimento</p>
        <v-textarea v-model="stepsRaw" placeholder="Due righe sul piatto, poi i passaggi: uno per riga" variant="outlined" rows="5" hide-details />
      </div>

      <div>
        <p class="uc-label">Destinazione</p>
        <v-select
          v-model="groupId"
          :items="myGroups"
          item-title="name"
          item-value="id"
          variant="outlined"
          density="comfortable"
          hide-details
        />
      </div>

      <v-btn
        type="submit"
        variant="flat"
        color="secondary"
        size="large"
        class="uc-pill-btn"
        :loading="saving"
        :disabled="!title.trim() || !groupId"
      >
        {{ editingId ? 'Salva modifiche' : 'Pubblica' }}
      </v-btn>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  collection, addDoc, updateDoc, doc, getDoc,
  query, where, getDocs, documentId, serverTimestamp
} from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId, getNickname, getJoinedGroupIds } from '@/identity.js'
import { fileToCompressedDataUrl } from '@/utils/image.js'

const router = useRouter()
const route = useRoute()

const myGroups = ref([])
const groupId = ref(null)
const title = ref('')
const imageUrl = ref('')
const imageError = ref('')
const ingredientsRaw = ref('')
const stepsRaw = ref('')
const saving = ref(false)
const fileInput = ref(null)
const editingId = ref(route.query.edit || null)

onMounted(async () => {
  const ids = getJoinedGroupIds().slice(0, 10) // limite della clausola 'in' di Firestore
  if (!ids.length) return
  const snap = await getDocs(query(collection(db, 'groups'), where(documentId(), 'in', ids)))
  myGroups.value = snap.docs.map((d) => ({ id: d.id, name: d.data().name }))

  if (editingId.value) {
    const snapRecipe = await getDoc(doc(db, 'recipes', editingId.value))
    if (snapRecipe.exists()) {
      const r = snapRecipe.data()
      title.value = r.title || ''
      imageUrl.value = r.imageUrl || ''
      ingredientsRaw.value = (r.ingredients || []).join('\n')
      stepsRaw.value = (r.steps || []).join('\n')
      groupId.value = r.groupId
    }
    return
  }

  const preselected = route.query.groupId
  if (preselected && myGroups.value.some((g) => g.id === preselected)) {
    groupId.value = preselected
  } else if (!groupId.value && myGroups.value.length) {
    groupId.value = myGroups.value[0].id
  }
})

async function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  imageError.value = ''
  try {
    imageUrl.value = await fileToCompressedDataUrl(file)
  } catch (err) {
    console.error('Errore nel caricare la foto:', err)
    imageError.value = err.message || 'Errore nel caricare la foto.'
  } finally {
    e.target.value = ''
  }
}

async function submit() {
  if (!title.value.trim() || !groupId.value) return
  saving.value = true
  try {
    const content = {
      title: title.value.trim(),
      imageUrl: imageUrl.value || null,
      ingredients: ingredientsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean),
      steps: stepsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean),
      groupId: groupId.value
    }
    if (editingId.value) {
      await updateDoc(doc(db, 'recipes', editingId.value), content)
      router.push(`/ricetta/${editingId.value}`)
    } else {
      const docRef = await addDoc(collection(db, 'recipes'), {
        ...content,
        source: 'group',
        brandName: null,
        authorNickname: getNickname() || 'Anonimo',
        authorLocalId: getUserId(),
        reactionCounts: { cucinarlo: 0, mangiarlo: 0, nonMiPiace: 0 },
        createdAt: serverTimestamp()
      })
      router.push(`/ricetta/${docRef.id}`)
    }
  } catch (err) {
    console.error('Errore nel pubblicare la ricetta:', err)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.uc-form-page {
  padding: 14px 16px 24px;
}

.uc-page-title {
  font-size: 20px;
  font-weight: 700;
  margin: 4px 0 14px;
  color: var(--uc-text);
}

.uc-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.uc-label {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--uc-text-muted);
  letter-spacing: 0.03em;
  margin: 0 0 6px;
  text-transform: uppercase;
}

.uc-hidden-input {
  display: none;
}

.uc-image-picker {
  height: 110px;
  border: 1.5px dashed var(--uc-border);
  border-radius: var(--uc-radius-input);
  background: var(--uc-surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  color: var(--uc-text-muted);
}

.uc-image-picker span {
  font-size: 11px;
}

.uc-image-preview {
  position: relative;
  height: 160px;
  border-radius: var(--uc-radius-input);
  overflow: hidden;
}

.uc-image-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.uc-image-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.uc-pill-btn {
  border-radius: var(--uc-radius-pill);
  text-transform: none;
  font-weight: 700;
  margin-top: 4px;
}

.uc-error {
  color: #b3261e;
  font-size: 12.5px;
  margin: 6px 0 0;
}
</style>
