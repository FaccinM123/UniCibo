<template>
  <div class="uc-comments">
    <div class="uc-comment-list" v-if="comments.length">
      <p v-for="c in comments" :key="c.id" class="uc-comment">
        <span class="uc-comment-author">{{ c.authorNickname }}</span>
        <span>{{ c.text }}</span>
      </p>
    </div>
    <p v-else class="uc-comment-empty">Ancora nessun commento. Sii il primo.</p>

    <form class="uc-comment-form" @submit.prevent="postComment">
      <input
        v-model="newComment"
        type="text"
        placeholder="Scrivi un commento..."
        class="uc-comment-input"
      />
      <button type="submit" class="uc-comment-send" :disabled="!newComment.trim() || posting" aria-label="Invia commento">
        <v-icon icon="mdi-send" size="18" color="white" />
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId, getNickname } from '@/identity.js'

const props = defineProps({
  recipeId: { type: String, required: true }
})

const comments = ref([])
const newComment = ref('')
const posting = ref(false)
let unsub = null

onMounted(() => {
  const commentsRef = collection(db, 'recipes', props.recipeId, 'comments')
  const q = query(commentsRef, orderBy('createdAt', 'asc'))
  // onSnapshot: va oltre le API viste a lezione, usato per mostrare i nuovi
  // commenti di altri utenti senza dover ricaricare la pagina.
  unsub = onSnapshot(q, (snap) => {
    comments.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  })
})

onUnmounted(() => {
  unsub && unsub()
})

async function postComment() {
  if (!newComment.value.trim()) return
  posting.value = true
  try {
    const commentsRef = collection(db, 'recipes', props.recipeId, 'comments')
    await addDoc(commentsRef, {
      text: newComment.value.trim(),
      authorLocalId: getUserId(),
      authorNickname: getNickname() || 'Anonimo',
      createdAt: serverTimestamp()
    })
    newComment.value = ''
  } catch (err) {
    console.error('Errore nel pubblicare il commento:', err)
  } finally {
    posting.value = false
  }
}
</script>

<style scoped>
.uc-comment-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.uc-comment {
  font-size: 13px;
  margin: 0;
  color: var(--uc-text);
}

.uc-comment-author {
  font-weight: 700;
  margin-right: 6px;
}

.uc-comment-empty {
  font-size: 13px;
  color: var(--uc-text-muted);
  margin: 0;
}

.uc-comment-form {
  display: flex;
  gap: 8px;
  padding-top: 10px;
}

.uc-comment-input {
  flex: 1;
  border: 1px solid var(--uc-border);
  border-radius: var(--uc-radius-pill);
  padding: 8px 14px;
  font-size: 13px;
  font-family: inherit;
  background: #ffffff;
  color: var(--uc-text);
}

.uc-comment-input:focus {
  outline: 2px solid var(--uc-primary);
  outline-offset: 1px;
}

.uc-comment-send {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: var(--uc-primary);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.uc-comment-send:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
