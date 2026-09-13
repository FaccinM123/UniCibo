<template>
  <div class="uc-comments">
    <div class="uc-comment-list" v-if="comments.length">
      <p v-for="c in comments" :key="c.id" class="uc-comment">
        <span class="uc-comment-author">{{ c.authorNickname }}</span>
        <span>{{ c.text }}</span>
        <button
          v-if="c.authorId === userId"
          type="button"
          class="uc-comment-delete"
          aria-label="Elimina commento"
          @click="removeComment(c.id)"
        >
          <v-icon icon="mdi-delete-outline" size="14" />
        </button>
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
import { collection, addDoc, deleteDoc, doc, getDocs, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId, getNickname } from '@/identity.js'

const props = defineProps({
  recipeId: { type: String, required: true },
  groupId: { type: String, default: null },
  live: { type: Boolean, default: false }
})

function commentsRef() {
  return props.groupId
    ? collection(db, 'groups', props.groupId, 'recipes', props.recipeId, 'comments')
    : collection(db, 'recipes', props.recipeId, 'comments')
}

const comments = ref([])
const newComment = ref('')
const posting = ref(false)
const userId = getUserId()

let unsubscribeComments = null

onMounted(() => {
  if (props.live) {
    unsubscribeComments = onSnapshot(
      query(commentsRef(), orderBy('createdAt', 'asc')),
      (snap) => {
        comments.value = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.createdAt?.toMillis() ?? Infinity) - (b.createdAt?.toMillis() ?? Infinity))
      },
      (err) => console.error('Errore nell\'ascoltare i commenti:', err)
    )
  } else {
    getDocs(query(commentsRef(), orderBy('createdAt', 'asc'))).then((snap) => {
      comments.value = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    })
  }
})

onUnmounted(() => {
  if (unsubscribeComments) unsubscribeComments()
})

// In modalità live il commento appena pubblicato arriva già dall'ascoltatore
// onSnapshot (Step 2): niente push locale, altrimenti comparirebbe due volte
// (una dal push, una dall'ascoltatore). In modalità non-live (feed) non c'è
// un ascoltatore, quindi lo aggiungiamo a mano come prima.
async function postComment() {
  if (!newComment.value.trim()) return
  posting.value = true
  try {
    const text = newComment.value.trim()
    const authorId = getUserId()
    const authorNickname = getNickname() || 'Anonimo'
    const docRef = await addDoc(commentsRef(), {
      text,
      authorId,
      authorNickname,
      createdAt: serverTimestamp()
    })
    if (!props.live) {
      comments.value.push({ id: docRef.id, text, authorId, authorNickname })
    }
    newComment.value = ''
  } catch (err) {
    console.error('Errore nel pubblicare il commento:', err)
  } finally {
    posting.value = false
  }
}

async function removeComment(commentId) {
  if (!confirm('Eliminare questo commento?')) return
  try {
    await deleteDoc(doc(commentsRef(), commentId))
    // In modalità live l'ascoltatore rimuove già il commento da solo; in
    // modalità non-live (feed) lo togliamo subito a mano, come per postComment.
    if (!props.live) {
      comments.value = comments.value.filter((c) => c.id !== commentId)
    }
  } catch (err) {
    console.error('Errore nell\'eliminare il commento:', err)
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

.uc-comment-delete {
  float: right;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  color: var(--uc-text-muted);
  background: transparent;
  border: none;
  cursor: pointer;
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
  background: var(--uc-surface);
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
