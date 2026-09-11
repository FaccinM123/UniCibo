<template>
  <div class="uc-reactions">
    <button
      v-for="opt in options"
      :key="opt.type"
      type="button"
      class="uc-reaction-btn"
      :class="{ 'uc-reaction-btn--active': myReaction === opt.type }"
      :style="myReaction === opt.type ? { background: opt.containerColor, color: opt.strongColor } : null"
      :disabled="loading === opt.type"
      @click="toggleReaction(opt.type)"
    >
      <v-icon :icon="myReaction === opt.type ? opt.iconActive : opt.icon" size="16" />
      <span>{{ opt.label }}</span>
      <span class="uc-reaction-count">{{ counts[opt.type] || 0 }}</span>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId } from '@/identity.js'

const props = defineProps({
  recipeId: { type: String, required: true },
  groupId: { type: String, default: null }
})

function recipeRef() {
  return props.groupId
    ? doc(db, 'groups', props.groupId, 'recipes', props.recipeId)
    : doc(db, 'recipes', props.recipeId)
}

function reactionRef(uid) {
  return props.groupId
    ? doc(db, 'groups', props.groupId, 'recipes', props.recipeId, 'reactions', uid)
    : doc(db, 'recipes', props.recipeId, 'reactions', uid)
}

const options = [
  {
    type: 'cucinarlo', label: 'Voglio cucinarlo',
    icon: 'mdi-pot-steam-outline', iconActive: 'mdi-pot-steam',
    containerColor: 'var(--uc-primary-container)', strongColor: 'var(--uc-primary-strong)'
  },
  {
    type: 'mangiarlo', label: 'Voglio mangiarlo',
    icon: 'mdi-food-outline', iconActive: 'mdi-food',
    containerColor: 'var(--uc-secondary-container)', strongColor: 'var(--uc-secondary)'
  },
  {
    type: 'nonMiPiace', label: 'Non mi piace',
    icon: 'mdi-thumb-down-outline', iconActive: 'mdi-thumb-down',
    containerColor: 'var(--uc-border)', strongColor: 'var(--uc-text)'
  }
]

const userId = getUserId()
const counts = ref({})
const myReaction = ref(null)
const loading = ref(null)

onMounted(async () => {
  const recipeSnap = await getDoc(recipeRef())
  counts.value = recipeSnap.data()?.reactionCounts || {}

  const myReactionSnap = await getDoc(reactionRef(userId))
  myReaction.value = myReactionSnap.exists() ? myReactionSnap.data().type : null
})

// Una sola reazione per utente per ricetta. Cliccare di nuovo la stessa
// reazione la rimuove (toggle off). Lettura + scrittura separate (non una
// transazione atomica): per un prototipo con un solo account attivo il
// rischio di due reazioni concorrenti che si sovrascrivono è accettabile;
// resta comunque il conteggio denormalizzato (recipes/{id}.reactionCounts)
// sincronizzato con il documento reactions/{authorLocalId} ad ogni click.
async function toggleReaction(type) {
  loading.value = type
  const recipeDoc = recipeRef()
  const myReactionDoc = reactionRef(userId)

  try {
    const recipeSnap = await getDoc(recipeDoc)
    const myReactionSnap = await getDoc(myReactionDoc)

    const currentCounts = recipeSnap.data()?.reactionCounts || {}
    const previousType = myReactionSnap.exists() ? myReactionSnap.data().type : null

    const newCounts = { ...currentCounts }
    if (previousType) {
      newCounts[previousType] = Math.max(0, (newCounts[previousType] || 0) - 1)
    }

    if (previousType === type) {
      await deleteDoc(myReactionDoc)
      myReaction.value = null
    } else {
      newCounts[type] = (newCounts[type] || 0) + 1
      await setDoc(myReactionDoc, { type, updatedAt: serverTimestamp() })
      myReaction.value = type
    }

    await updateDoc(recipeDoc, { reactionCounts: newCounts })
    counts.value = newCounts
  } catch (err) {
    console.error('Errore nel salvare la reazione:', err)
  } finally {
    loading.value = null
  }
}
</script>

<style scoped>
.uc-reactions {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.uc-reaction-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: var(--uc-radius-pill);
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 600;
  background: transparent;
  border: none;
  color: var(--uc-text-muted);
  font-family: inherit;
}

.uc-reaction-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.uc-reaction-count {
  font-variant-numeric: tabular-nums;
}
</style>
