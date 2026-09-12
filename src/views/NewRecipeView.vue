<template>
  <div class="uc-form-page">
    <h1 class="uc-page-title">{{ editingId ? 'Modifica ricetta' : 'Nuova ricetta' }}</h1>

    <v-alert v-if="groupsLoaded && !myGroups.length" type="info" variant="tonal" class="mb-4">
      Non fai ancora parte di nessun gruppo: serve almeno un gruppo per pubblicare.
      <RouterLink to="/gruppi">Crea o unisciti a un gruppo</RouterLink>.
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
        <p class="uc-label">Tag</p>
        <v-chip-group v-model="selectedTags" multiple column>
          <v-chip
            v-for="opt in TAG_OPTIONS"
            :key="opt.id"
            :value="opt.id"
            variant="outlined"
            filter
          >
            {{ opt.label }}
          </v-chip>
        </v-chip-group>
      </div>

      <div>
        <p class="uc-label">Destinazione</p>
        <v-select
          v-model="selectedGroupIds"
          :items="myGroups"
          item-title="name"
          item-value="id"
          multiple
          chips
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
        :disabled="!title.trim() || !selectedGroupIds.length"
      >
        {{ editingId ? 'Salva modifiche' : 'Pubblica' }}
      </v-btn>
      <p v-if="publishError" class="uc-error">{{ publishError }}</p>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, getDocs, documentId, limit, serverTimestamp
} from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId, getNickname, getJoinedGroupIds } from '@/identity.js'
import { fileToCompressedDataUrl } from '@/utils/image.js'
import { TAG_OPTIONS } from '@/utils/tags.js'

const router = useRouter()
const route = useRoute()

const myGroups = ref([])
const selectedGroupIds = ref([])
const selectedTags = ref([])
const publishError = ref('')
const pendingBatchId = ref(null)
const groupsLoaded = ref(false)
const title = ref('')
const imageUrl = ref('')
const imageError = ref('')
const ingredientsRaw = ref('')
const stepsRaw = ref('')
const saving = ref(false)
const fileInput = ref(null)
const editingId = ref(route.query.edit || null)
// Posizione originale del post in modifica (dove si trova ORA su Firestore),
// per capire se salvare è un semplice updateDoc sul posto o se la
// destinazione è cambiata e serve spostare il documento (vedi submit()).
const editingGroupId = ref(route.query.groupId || null)
// Stato solo per la modifica: destinazioni attuali (prima di ogni modifica
// dell'utente al v-select) e mappa gruppo -> id del documento esistente lì,
// così submit() sa quali copie aggiornare/creare/eliminare. Vedi onMounted.
const originalGroupIds = ref([])
const copyIdByGroup = ref({})
const existingBatchId = ref(null)
// Un vecchio post "pubblico" (prima dell'introduzione dei gruppi come unica
// destinazione) non vive in nessuna sotto-collezione di gruppo: va sempre
// eliminato dalla collezione in cima una volta ricreato nei gruppi scelti.
const hadLegacyTopLevelCopy = ref(false)

function recipeDocRef(id, groupId) {
  return groupId ? doc(db, 'groups', groupId, 'recipes', id) : doc(db, 'recipes', id)
}

onMounted(async () => {
  const ids = getJoinedGroupIds().slice(0, 10) // limite della clausola 'in' di Firestore
  if (ids.length) {
    const snap = await getDocs(query(collection(db, 'groups'), where(documentId(), 'in', ids), limit(10)))
    myGroups.value = snap.docs.map((d) => ({ id: d.id, name: d.data().name }))
  }
  groupsLoaded.value = true

  if (editingId.value) {
    const snapRecipe = await getDoc(recipeDocRef(editingId.value, editingGroupId.value))
    if (snapRecipe.exists()) {
      const r = snapRecipe.data()
      title.value = r.title || ''
      imageUrl.value = r.imageUrl || ''
      ingredientsRaw.value = (r.ingredients || []).join('\n')
      stepsRaw.value = (r.steps || []).join('\n')
      selectedTags.value = r.tags || []
      existingBatchId.value = r.batchId || null

      if (editingGroupId.value) {
        copyIdByGroup.value[editingGroupId.value] = editingId.value
      } else {
        // Vecchio post "pubblico" (prima dei gruppi come unica destinazione):
        // nessuna destinazione valida da portare avanti, l'autore deve
        // sceglierne una o più; il vecchio documento va comunque eliminato
        // dopo aver ricreato il post nei gruppi scelti (vedi submit()).
        hadLegacyTopLevelCopy.value = true
      }

      if (r.batchId) {
        // Post multi-gruppo: cerca le copie gemelle nei gruppi a cui
        // appartieni, per far partire il multi-select con TUTTE le
        // destinazioni attuali già spuntate, non solo quella da cui sei
        // entrato in modifica.
        const groupIds = getJoinedGroupIds().slice(0, 10)
        const snaps = await Promise.all(
          groupIds.map((gid) =>
            getDocs(query(collection(db, 'groups', gid, 'recipes'), where('batchId', '==', r.batchId)))
          )
        )
        snaps.forEach((snap, i) => {
          if (!snap.empty) copyIdByGroup.value[groupIds[i]] = snap.docs[0].id
        })
      }

      selectedGroupIds.value = Object.keys(copyIdByGroup.value)
      originalGroupIds.value = [...selectedGroupIds.value]
    }
    return
  }

  const preselected = route.query.groupId
  if (preselected && myGroups.value.some((g) => g.id === preselected)) {
    selectedGroupIds.value = [preselected]
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
  if (!title.value.trim()) return
  if (!selectedGroupIds.value.length) return
  saving.value = true
  publishError.value = ''
  try {
    const fields = {
      title: title.value.trim(),
      imageUrl: imageUrl.value || null,
      ingredients: ingredientsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean),
      steps: stepsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean),
      tags: selectedTags.value
    }

    if (editingId.value) {
      const newGroupIds = selectedGroupIds.value
      const oldGroupIds = originalGroupIds.value
      const toKeep = newGroupIds.filter((gid) => oldGroupIds.includes(gid))
      const toAdd = newGroupIds.filter((gid) => !oldGroupIds.includes(gid))
      const toRemove = oldGroupIds.filter((gid) => !newGroupIds.includes(gid))

      if (toRemove.length) {
        const names = toRemove.map((gid) => myGroups.value.find((g) => g.id === gid)?.name || gid).join(', ')
        const proceed = confirm(
          `Rimuovendo il post da ${names} perderai le reazioni e i commenti ricevuti lì, in modo permanente. Continuare?`
        )
        if (!proceed) {
          saving.value = false
          return
        }
      }

      // Un post che passa da un solo gruppo a più gruppi ottiene un batchId
      // nuovo (se non ne aveva già uno); uno che si riduce a un solo gruppo
      // rimasto lo lascia com'è — non causa più il raggruppamento nel feed/
      // gestione-post (vedi src/utils/mergeBatch.js), quindi è innocuo.
      // Tenuto in existingBatchId.value (non ricalcolato da zero) così un
      // eventuale retry dopo un fallimento parziale riusa lo stesso valore.
      if (newGroupIds.length > 1 && !existingBatchId.value) {
        existingBatchId.value = crypto.randomUUID()
      } else if (newGroupIds.length <= 1) {
        existingBatchId.value = null
      }
      const batchId = existingBatchId.value

      // allSettled, non allSettled/all: un fallimento su un gruppo non deve
      // bloccare gli altri, e soprattutto un retry successivo non deve
      // ripetere un'aggiunta già riuscita (duplicherebbe il post in quel
      // gruppo) né una rimozione già riuscita. Per questo copyIdByGroup e
      // originalGroupIds vengono aggiornati in base a cosa è VERAMENTE
      // riuscito, non a cosa era stato richiesto.
      const keepResults = await Promise.allSettled(
        toKeep.map((gid) => updateDoc(recipeDocRef(copyIdByGroup.value[gid], gid), { ...fields, batchId }))
      )
      const addResults = await Promise.allSettled(
        toAdd.map((gid) =>
          addDoc(collection(db, 'groups', gid, 'recipes'), {
            ...fields,
            source: 'group',
            brandName: null,
            visibility: 'group',
            groupId: gid,
            authorNickname: getNickname() || 'Anonimo',
            authorId: getUserId(),
            reactionCounts: { cucinarlo: 0, mangiarlo: 0, nonMiPiace: 0 },
            batchId,
            createdAt: serverTimestamp()
          })
        )
      )
      const removeResults = await Promise.allSettled(
        toRemove.map((gid) => deleteDoc(recipeDocRef(copyIdByGroup.value[gid], gid)))
      )

      addResults.forEach((r, i) => {
        if (r.status === 'fulfilled') copyIdByGroup.value[toAdd[i]] = r.value.id
      })
      removeResults.forEach((r, i) => {
        if (r.status === 'fulfilled') delete copyIdByGroup.value[toRemove[i]]
      })
      originalGroupIds.value = Object.keys(copyIdByGroup.value)

      const anyFailed = [...keepResults, ...addResults, ...removeResults].some((r) => r.status === 'rejected')
      if (anyFailed) {
        console.error('Errore nel salvare le destinazioni:', keepResults, addResults, removeResults)
        publishError.value = 'Alcune modifiche non sono state salvate. Riprova.'
      } else {
        if (hadLegacyTopLevelCopy.value) {
          await deleteDoc(recipeDocRef(editingId.value, null))
          hadLegacyTopLevelCopy.value = false
        }
        router.push('/gestione-post')
      }
    } else {
      // Copie indipendenti, una per gruppo selezionato: stesso schema di
      // scrittura di sempre, ripetuto. allSettled invece di Promise.all,
      // così un fallimento su un gruppo non annulla le copie già create
      // con successo negli altri. batchId condiviso tra le copie SOLO
      // quando la destinazione era più di un gruppo: permette a feed e
      // gestione-post di mostrarle come un unico post (vedi
      // src/utils/mergeBatch.js) senza cambiare nulla per le pubblicazioni
      // a singolo gruppo, il caso più comune. Generato una sola volta e
      // tenuto in pendingBatchId.value: un retry dopo un fallimento
      // parziale può ridurre selectedGroupIds a un solo gruppo rimasto,
      // ma deve restare collegato alle copie già create con successo nel
      // tentativo precedente, non ripartire con un batchId nuovo (o nullo).
      if (selectedGroupIds.value.length > 1 && !pendingBatchId.value) {
        pendingBatchId.value = crypto.randomUUID()
      }
      const batchId = pendingBatchId.value
      const results = await Promise.allSettled(
        selectedGroupIds.value.map((gid) =>
          addDoc(collection(db, 'groups', gid, 'recipes'), {
            ...fields,
            source: 'group',
            brandName: null,
            visibility: 'group',
            groupId: gid,
            authorNickname: getNickname() || 'Anonimo',
            authorId: getUserId(),
            reactionCounts: { cucinarlo: 0, mangiarlo: 0, nonMiPiace: 0 },
            batchId,
            createdAt: serverTimestamp()
          })
        )
      )
      const gids = selectedGroupIds.value
      const failedGids = gids.filter((_, i) => results[i].status === 'rejected')
      if (failedGids.length) {
        const failures = results.filter((r) => r.status === 'rejected')
        console.error('Errore nel pubblicare nei gruppi:', failedGids, failures)
        selectedGroupIds.value = failedGids
        const succeeded = gids.length - failedGids.length
        publishError.value = succeeded > 0
          ? `Pubblicato in ${succeeded} di ${gids.length} gruppi. Riprova per i rimanenti.`
          : `Errore: non è stato possibile pubblicare in nessuno dei ${gids.length} gruppi selezionati.`
      } else {
        pendingBatchId.value = null
        router.push('/gestione-post')
      }
    }
  } catch (err) {
    console.error('Errore nel pubblicare la ricetta:', err)
    publishError.value = 'Errore nel salvare la ricetta. Riprova.'
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
