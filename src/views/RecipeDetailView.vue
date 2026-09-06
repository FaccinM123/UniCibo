<template>
  <div v-if="recipe" class="uc-detail">
    <div class="uc-detail-hero" :class="{ 'uc-detail-hero--placeholder': !recipe.imageUrl }">
      <img v-if="recipe.imageUrl" :src="recipe.imageUrl" :alt="recipe.title" />
    </div>

    <h1 class="uc-detail-title">{{ recipe.title }}</h1>

    <div class="uc-detail-author">
      <div class="uc-avatar" :style="{ background: avatarColor(recipe.authorLocalId || recipe.authorNickname) }">
        {{ avatarInitial(recipe.authorNickname) }}
      </div>
      <span class="uc-detail-author-name">{{ recipe.authorNickname || 'UniCibo' }}</span>
      <span class="uc-detail-meta">· {{ formattedDate }}</span>
    </div>

    <span v-if="originLabel" class="uc-chip">{{ originLabel }}</span>

    <ReactionBar :recipe-id="id" class="uc-detail-reactions" />

    <section v-if="recipe.ingredients?.length" class="uc-detail-section">
      <h2 class="uc-label">Ingredienti</h2>
      <ul class="uc-ingredient-list">
        <li v-for="(ing, i) in recipe.ingredients" :key="i">{{ ing }}</li>
      </ul>
    </section>

    <section v-if="recipe.steps?.length" class="uc-detail-section">
      <h2 class="uc-label">Procedimento</h2>
      <ol class="uc-steps-list">
        <li v-for="(step, i) in recipe.steps" :key="i">{{ step }}</li>
      </ol>
    </section>

    <section class="uc-detail-section">
      <h2 class="uc-label">Commenti</h2>
      <CommentList :recipe-id="id" />
    </section>
  </div>

  <v-progress-linear v-else indeterminate />
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase.js'
import ReactionBar from '@/components/ReactionBar.vue'
import CommentList from '@/components/CommentList.vue'
import { avatarColor, avatarInitial } from '@/utils/avatar.js'

const props = defineProps({
  id: { type: String, required: true }
})

const recipe = ref(null)
let unsub = null

onMounted(() => {
  const ref_ = doc(db, 'recipes', props.id)
  // onSnapshot: va oltre le slide del corso, tiene il dettaglio aggiornato se
  // qualcun altro reagisce/commenta mentre la pagina è aperta.
  unsub = onSnapshot(ref_, (snap) => {
    recipe.value = snap.exists() ? { id: snap.id, ...snap.data() } : null
  })
})

onUnmounted(() => {
  unsub && unsub()
})

const originLabel = computed(() => {
  if (!recipe.value) return ''
  return recipe.value.source === 'brand' ? recipe.value.brandName : null
})

const formattedDate = computed(() => {
  const ts = recipe.value?.createdAt
  const date = ts?.toDate ? ts.toDate() : null
  if (!date) return ''
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
})
</script>

<style scoped>
.uc-detail {
  padding-bottom: 8px;
}

.uc-detail-hero {
  height: 220px;
  margin: 0 0 4px;
  overflow: hidden;
}

.uc-detail-hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.uc-detail-hero--placeholder {
  background: repeating-linear-gradient(
    135deg,
    var(--uc-primary-container) 0 10px,
    oklch(89% 0.035 58) 10px 20px
  );
}

.uc-detail-title {
  font-size: 21px;
  font-weight: 700;
  line-height: 1.25;
  padding: 18px 16px 4px;
  margin: 0;
  color: var(--uc-text);
}

.uc-detail-author {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
}

.uc-avatar {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}

.uc-detail-author-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--uc-text);
}

.uc-detail-meta {
  font-size: 12.5px;
  color: var(--uc-text-muted);
}

.uc-chip {
  display: inline-flex;
  margin: 0 16px 12px;
  padding: 5px 12px;
  background: var(--uc-secondary-container);
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--uc-text);
}

.uc-detail-reactions {
  padding: 0 16px 12px;
}

.uc-detail-section {
  padding: 8px 16px 12px;
}

.uc-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--uc-text-muted);
  letter-spacing: 0.03em;
  margin: 0 0 8px;
  text-transform: uppercase;
}

.uc-ingredient-list,
.uc-steps-list {
  margin: 0;
  padding-left: 20px;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--uc-text);
}

.uc-ingredient-list li,
.uc-steps-list li {
  margin-bottom: 4px;
}
</style>
