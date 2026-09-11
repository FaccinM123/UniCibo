<template>
  <article class="uc-card">
    <div class="uc-card-header">
      <img v-if="myAvatarPhoto" :src="myAvatarPhoto" alt="" class="uc-avatar uc-avatar-photo" />
      <div v-else class="uc-avatar" :style="{ background: avatarColor(recipe.authorId || recipe.authorNickname) }">
        {{ avatarInitial(recipe.authorNickname) }}
      </div>
      <div class="uc-card-header-text">
        <RouterLink
          v-if="recipe.authorId"
          :to="{ path: `/membro/${recipe.authorId}`, query: { nickname: recipe.authorNickname } }"
          class="uc-card-author"
        >
          {{ recipe.authorNickname || 'Anonimo' }}
        </RouterLink>
        <span v-else class="uc-card-author">{{ recipe.authorNickname || 'Anonimo' }}</span>
        <div class="uc-card-meta">
          {{ formattedDate }}
          <span v-if="originLabel"> · {{ originLabel }}</span>
        </div>
      </div>
    </div>

    <RouterLink :to="detailPath" class="uc-card-body-link">
      <h3 class="uc-card-title">{{ recipe.title }}</h3>
      <div class="uc-card-image" :class="{ 'uc-card-image--placeholder': !recipe.imageUrl }">
        <img v-if="recipe.imageUrl" :src="recipe.imageUrl" :alt="recipe.title" loading="lazy" />
      </div>
    </RouterLink>

    <div class="uc-card-actions">
      <ReactionBar :recipe-id="recipe.id" :group-id="recipe.groupId" />
      <span class="uc-card-spacer" />
      <button
        type="button"
        class="uc-save-toggle"
        :class="{ 'uc-save-toggle--active': saved }"
        aria-label="Salva ricetta"
        @click="toggleSave"
      >
        <v-icon :icon="saved ? 'mdi-bookmark' : 'mdi-bookmark-outline'" size="18" />
      </button>
      <button type="button" class="uc-comment-toggle" @click="expanded = !expanded">
        <v-icon icon="mdi-comment-outline" size="16" />
        <span>Commenti</span>
      </button>
    </div>

    <div v-if="expanded" class="uc-card-comments">
      <CommentList :recipe-id="recipe.id" :group-id="recipe.groupId" />
    </div>
  </article>
</template>

<script setup>
import { ref, computed } from 'vue'
import ReactionBar from '@/components/ReactionBar.vue'
import CommentList from '@/components/CommentList.vue'
import { avatarColor, avatarInitial } from '@/utils/avatar.js'
import { getUserId, getAvatarPhoto, isRecipeSaved, toggleSavedRecipeId } from '@/identity.js'

const props = defineProps({
  recipe: { type: Object, required: true }
})

const expanded = ref(false)
const saved = ref(isRecipeSaved(props.recipe.id))

const detailPath = computed(() => {
  return props.recipe.groupId
    ? `/gruppi/${props.recipe.groupId}/ricetta/${props.recipe.id}`
    : `/ricetta/${props.recipe.id}`
})

async function toggleSave() {
  saved.value = await toggleSavedRecipeId(props.recipe.id)
}

// Le ricette "brand" (source: 'brand', importate da Spoonacular — vedi
// scripts/import-brand-recipes.mjs) sono ora etichettate "Esempio": con
// "Pubblico" tolto dall'interfaccia di pubblicazione, restano l'unico
// contenuto nel feed non scritto da un utente reale, e vanno distinte
// chiaramente da un post di gruppo.
const originLabel = computed(() => {
  if (props.recipe.source === 'brand') return 'Esempio'
  return props.recipe.source === 'group' ? props.recipe.groupName : null
})

// La foto profilo resta solo su questo dispositivo (vedi identity.js): la
// mostriamo solo sui post pubblicati da "te", non su quelli di altri autori.
const myAvatarPhoto = computed(() => {
  return props.recipe.authorId === getUserId() ? getAvatarPhoto() : ''
})

const formattedDate = computed(() => {
  const ts = props.recipe.createdAt
  const date = ts?.toDate ? ts.toDate() : null
  if (!date) return ''
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
})
</script>

<style scoped>
.uc-card {
  background: var(--uc-surface);
  border-radius: var(--uc-radius-card);
  box-shadow: var(--uc-shadow-card);
  overflow: hidden;
  margin-bottom: 14px;
}

.uc-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 8px;
}

.uc-avatar {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}

.uc-avatar-photo {
  object-fit: cover;
}

.uc-card-header-text {
  flex: 1;
  min-width: 0;
}

.uc-card-author {
  font-size: 14px;
  font-weight: 600;
  color: var(--uc-text);
  text-decoration: none;
}

.uc-card-meta {
  font-size: 11.5px;
  color: var(--uc-text-muted);
}

.uc-card-body-link {
  display: block;
  text-decoration: none;
  color: inherit;
}

.uc-card-title {
  font-size: 16px;
  font-weight: 700;
  padding: 2px 14px 8px;
  margin: 0;
  color: var(--uc-text);
}

.uc-card-image {
  height: 170px;
  margin: 0 14px 10px;
  border-radius: 10px;
  overflow: hidden;
}

.uc-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.uc-card-image--placeholder {
  background: repeating-linear-gradient(
    135deg,
    var(--uc-primary-container) 0 10px,
    oklch(89% 0.035 58) 10px 20px
  );
}

.uc-card-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 12px;
}

.uc-card-spacer {
  flex: 1;
}

.uc-save-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--uc-radius-pill);
  cursor: pointer;
  color: var(--uc-text-muted);
  background: transparent;
  border: none;
}

.uc-save-toggle--active {
  color: var(--uc-primary-strong);
  background: var(--uc-primary-container);
}

.uc-comment-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: var(--uc-radius-pill);
  cursor: pointer;
  color: var(--uc-text-muted);
  font-size: 12.5px;
  font-weight: 600;
  background: transparent;
  border: none;
  font-family: inherit;
}

.uc-card-comments {
  padding: 0 14px 14px;
  border-top: 1px solid var(--uc-border);
}
</style>
