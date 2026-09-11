<template>
  <div class="uc-member">
    <div class="uc-member-header">
      <img v-if="isMe && avatarPhoto" :src="avatarPhoto" alt="" class="uc-member-avatar uc-member-avatar-photo" />
      <div v-else class="uc-member-avatar" :style="{ background: avatarColor(memberId) }">
        {{ avatarInitial(displayNickname) }}
      </div>
      <h1 class="uc-member-name">{{ displayNickname }}</h1>
      <p v-if="bio" class="uc-member-bio">{{ bio }}</p>
    </div>

    <h2 class="uc-label">Post pubblicati</h2>
    <v-progress-linear v-if="loading" indeterminate class="mb-2" />
    <div class="uc-post-list">
      <RouterLink v-for="p in posts" :key="p.id" :to="p.groupId ? `/gruppi/${p.groupId}/ricetta/${p.id}` : `/ricetta/${p.id}`" class="uc-post-row">
        <div class="uc-post-thumb" :class="{ 'uc-post-thumb--placeholder': !p.imageUrl }">
          <img v-if="p.imageUrl" :src="p.imageUrl" :alt="p.title" />
        </div>
        <div class="uc-post-row-text">
          <div class="uc-post-title">{{ p.title }}</div>
          <div class="uc-post-meta">{{ formatDate(p.createdAt) }}</div>
        </div>
      </RouterLink>
      <p v-if="!loading && !posts.length" class="uc-empty">Nessun post pubblicato.</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId, getAvatarPhoto, resolveProfile, getJoinedGroupIds } from '@/identity.js'
import { avatarColor, avatarInitial } from '@/utils/avatar.js'

const props = defineProps({
  memberId: { type: String, required: true }
})

const route = useRoute()
const posts = ref([])
const loading = ref(true)
const nickname = ref(route.query.nickname || 'Utente')
const bio = ref('')

const isMe = computed(() => props.memberId === getUserId())
const avatarPhoto = computed(() => (isMe.value ? getAvatarPhoto() : ''))
const displayNickname = computed(() => nickname.value)

onMounted(async () => {
  // Il vero profilo esiste sempre ora (users/{uid}): niente più bisogno di
  // indovinare il nickname dall'ultimo post pubblicato.
  resolveProfile(props.memberId).then((p) => { nickname.value = p.nickname; bio.value = p.bio })

  const topSnap = await getDocs(query(collection(db, 'recipes'), where('authorId', '==', props.memberId)))
  let groupDocs = []
  // I post di gruppo sono ora in sotto-collezioni per gruppo (vedi
  // firestore.rules): l'accesso a ciascuna è vincolato all'appartenenza a
  // QUEL gruppo, quindi possiamo mostrare i post di gruppo di questo membro
  // solo quando è "te stesso" — interrogando i gruppi a cui appartieni,
  // esattamente come in Gestione post. Non esiste un modo sicuro per un
  // profilo pubblico di mostrare i post di gruppo di UN ALTRO membro: una
  // query che attraversi gruppi arbitrari non è dimostrabile da Firestore
  // (stesso limite descritto in firestore.rules) e fallirebbe sempre.
  if (props.memberId === getUserId()) {
    const groupIds = getJoinedGroupIds().slice(0, 10)
    const groupSnaps = await Promise.all(
      groupIds.map((gid) => getDocs(query(collection(db, 'groups', gid, 'recipes'), where('authorId', '==', props.memberId))))
    )
    groupDocs = groupSnaps.flatMap((snap) => snap.docs)
  }
  posts.value = [...topSnap.docs, ...groupDocs]
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
  loading.value = false
})

function formatDate(ts) {
  const date = ts?.toDate ? ts.toDate() : null
  if (!date) return ''
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}
</script>

<style scoped>
.uc-member {
  padding: 8px 16px 24px;
}

.uc-member-header {
  text-align: center;
  padding: 20px 4px 24px;
}

.uc-member-avatar {
  width: 76px;
  height: 76px;
  margin: 0 auto 12px;
  border-radius: 999px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 28px;
}

.uc-member-avatar-photo {
  object-fit: cover;
}

.uc-member-name {
  font-size: 19px;
  font-weight: 700;
  margin: 0;
  color: var(--uc-text);
}

.uc-member-bio {
  font-size: 13.5px;
  color: var(--uc-text-muted);
  margin: 6px auto 0;
  max-width: 320px;
  line-height: 1.4;
}

.uc-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--uc-text-muted);
  letter-spacing: 0.03em;
  margin: 0 0 10px;
  text-transform: uppercase;
}

.uc-post-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.uc-post-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--uc-surface);
  border-radius: 12px;
  box-shadow: var(--uc-shadow-card);
  text-decoration: none;
  color: inherit;
}

.uc-post-thumb {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.uc-post-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.uc-post-thumb--placeholder {
  background: repeating-linear-gradient(
    135deg,
    var(--uc-primary-container) 0 8px,
    oklch(89% 0.035 58) 8px 16px
  );
}

.uc-post-row-text {
  flex: 1;
  min-width: 0;
}

.uc-post-title {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--uc-text);
}

.uc-post-meta {
  font-size: 12px;
  color: var(--uc-text-muted);
}

.uc-empty {
  text-align: center;
  color: var(--uc-text-muted);
  font-size: 13.5px;
  padding: 20px 0;
}
</style>
