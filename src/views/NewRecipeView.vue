<template>
  <div class="uc-form-page">
    <h1 class="uc-page-title">Nuova ricetta</h1>

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
        <p class="uc-label">Immagine (URL, opzionale)</p>
        <v-text-field v-model="imageUrl" placeholder="https://..." variant="outlined" density="comfortable" hide-details />
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
        Pubblica
      </v-btn>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { collection, addDoc, query, where, getDocs, documentId, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId, getNickname, getJoinedGroupIds } from '@/identity.js'

const router = useRouter()

const myGroups = ref([])
const groupId = ref(null)
const title = ref('')
const imageUrl = ref('')
const ingredientsRaw = ref('')
const stepsRaw = ref('')
const saving = ref(false)

onMounted(async () => {
  const ids = getJoinedGroupIds().slice(0, 10) // limite della clausola 'in' di Firestore
  if (!ids.length) return
  const snap = await getDocs(query(collection(db, 'groups'), where(documentId(), 'in', ids)))
  myGroups.value = snap.docs.map((d) => ({ id: d.id, name: d.data().name }))
  if (!groupId.value && myGroups.value.length) groupId.value = myGroups.value[0].id
})

async function submit() {
  if (!title.value.trim() || !groupId.value) return
  saving.value = true
  try {
    const docRef = await addDoc(collection(db, 'recipes'), {
      title: title.value.trim(),
      imageUrl: imageUrl.value.trim() || null,
      ingredients: ingredientsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean),
      steps: stepsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean),
      source: 'group',
      brandName: null,
      groupId: groupId.value,
      authorNickname: getNickname() || 'Anonimo',
      authorLocalId: getUserId(),
      reactionCounts: { cucinarlo: 0, mangiarlo: 0, nonMiPiace: 0 },
      createdAt: serverTimestamp()
    })
    router.push(`/ricetta/${docRef.id}`)
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

.uc-pill-btn {
  border-radius: var(--uc-radius-pill);
  text-transform: none;
  font-weight: 700;
  margin-top: 4px;
}
</style>
