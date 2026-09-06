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
import { ref, onMounted, onUnmounted } from 'vue'
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId } from '@/identity.js'

const props = defineProps({
  recipeId: { type: String, required: true }
})

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

let unsubRecipe = null
let unsubMyReaction = null

onMounted(() => {
  const recipeRef = doc(db, 'recipes', props.recipeId)
  // onSnapshot: va oltre le API viste a lezione (getDoc/getDocs), usato qui per
  // tenere il contatore sincronizzato in tempo reale tra più utenti/tab.
  unsubRecipe = onSnapshot(recipeRef, (snap) => {
    counts.value = snap.data()?.reactionCounts || {}
  })

  const myReactionRef = doc(db, 'recipes', props.recipeId, 'reactions', userId)
  unsubMyReaction = onSnapshot(myReactionRef, (snap) => {
    myReaction.value = snap.exists() ? snap.data().type : null
  })
})

onUnmounted(() => {
  unsubRecipe && unsubRecipe()
  unsubMyReaction && unsubMyReaction()
})

// Una sola reazione per utente per ricetta. Cliccare di nuovo la stessa
// reazione la rimuove (toggle off). runTransaction (oltre le slide del corso)
// tiene sincronizzati in modo atomico il contatore denormalizzato
// (recipes/{id}.reactionCounts) e il documento reactions/{authorLocalId}.
async function toggleReaction(type) {
  loading.value = type
  const recipeRef = doc(db, 'recipes', props.recipeId)
  const myReactionRef = doc(db, 'recipes', props.recipeId, 'reactions', userId)

  try {
    await runTransaction(db, async (tx) => {
      const recipeSnap = await tx.get(recipeRef)
      const myReactionSnap = await tx.get(myReactionRef)

      const currentCounts = recipeSnap.data()?.reactionCounts || {}
      const previousType = myReactionSnap.exists() ? myReactionSnap.data().type : null

      const newCounts = { ...currentCounts }

      if (previousType) {
        newCounts[previousType] = Math.max(0, (newCounts[previousType] || 0) - 1)
      }

      if (previousType === type) {
        tx.delete(myReactionRef)
      } else {
        newCounts[type] = (newCounts[type] || 0) + 1
        tx.set(myReactionRef, { type, updatedAt: serverTimestamp() })
      }

      tx.update(recipeRef, { reactionCounts: newCounts })
    })
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
