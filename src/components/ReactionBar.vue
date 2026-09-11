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
import { doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId } from '@/identity.js'

const props = defineProps({
  recipeId: { type: String, required: true },
  groupId: { type: String, default: null },
  live: { type: Boolean, default: false }
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

let unsubscribeRecipe = null
let unsubscribeReaction = null

function stopListening() {
  if (unsubscribeRecipe) { unsubscribeRecipe(); unsubscribeRecipe = null }
  if (unsubscribeReaction) { unsubscribeReaction(); unsubscribeReaction = null }
}

async function loadOnce() {
  const recipeSnap = await getDoc(recipeRef())
  counts.value = recipeSnap.data()?.reactionCounts || {}

  const myReactionSnap = await getDoc(reactionRef(userId))
  myReaction.value = myReactionSnap.exists() ? myReactionSnap.data().type : null
}

function startListening() {
  unsubscribeRecipe = onSnapshot(recipeRef(), (snap) => {
    counts.value = snap.data()?.reactionCounts || {}
  }, (err) => console.error('Errore nell\'ascoltare i conteggi reazioni:', err))

  unsubscribeReaction = onSnapshot(reactionRef(userId), (snap) => {
    myReaction.value = snap.exists() ? snap.data().type : null
  }, (err) => console.error('Errore nell\'ascoltare la tua reazione:', err))
}

onMounted(() => {
  if (props.live) {
    startListening()
  } else {
    loadOnce()
  }
})

onUnmounted(stopListening)

// Reazione singola per utente per ricetta, dentro una transazione: lettura
// e scrittura di reactions/{uid} e recipes/{id}.reactionCounts avvengono
// atomicamente, così due reazioni concorrenti sulla stessa ricetta non si
// sovrascrivono più a vicenda (Firestore ritenta la transazione da sola se
// il documento cambia tra lettura e scrittura).
async function toggleReaction(type) {
  loading.value = type
  const recipeDoc = recipeRef()
  const myReactionDoc = reactionRef(userId)

  try {
    let nextReaction = null
    await runTransaction(db, async (tx) => {
      const recipeSnap = await tx.get(recipeDoc)
      const myReactionSnap = await tx.get(myReactionDoc)

      const currentCounts = recipeSnap.data()?.reactionCounts || {}
      const previousType = myReactionSnap.exists() ? myReactionSnap.data().type : null

      const newCounts = { ...currentCounts }
      if (previousType) {
        newCounts[previousType] = Math.max(0, (newCounts[previousType] || 0) - 1)
      }

      if (previousType === type) {
        tx.delete(myReactionDoc)
        nextReaction = null
      } else {
        newCounts[type] = (newCounts[type] || 0) + 1
        tx.set(myReactionDoc, { type, updatedAt: serverTimestamp() })
        nextReaction = type
      }

      tx.update(recipeDoc, { reactionCounts: newCounts })
    })

    myReaction.value = nextReaction
    // In modalità non-live non c'è un ascoltatore che aggiorni counts da
    // solo: lo rileggiamo a mano. In live arriva già dall'onSnapshot.
    if (!props.live) {
      const fresh = await getDoc(recipeDoc)
      counts.value = fresh.data()?.reactionCounts || {}
    }
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
