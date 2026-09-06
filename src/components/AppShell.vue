<template>
  <div class="uc-backdrop">
    <div class="uc-column">
      <header class="uc-topbar">
        <button
          v-if="showBack"
          type="button"
          class="uc-icon-btn"
          aria-label="Indietro"
          @click="router.back()"
        >
          <v-icon icon="mdi-arrow-left" size="22" />
        </button>
        <span v-else class="uc-icon-btn-spacer" />

        <RouterLink to="/" class="uc-logo" aria-label="UniCibo — torna alla home">
          <img src="@/assets/logo-icona.png" alt="UniCibo" class="uc-logo-img" />
        </RouterLink>

        <span class="uc-icon-btn-spacer" />
      </header>

      <p v-if="screenLabel" class="uc-screen-label">{{ screenLabel }}</p>

      <main class="uc-content">
        <slot />
      </main>

      <nav class="uc-bottom-nav">
        <RouterLink to="/gruppi" class="uc-nav-item" active-class="uc-nav-item--active">
          <v-icon icon="mdi-account-group-outline" size="23" />
          <span>Gruppi</span>
        </RouterLink>
        <RouterLink to="/" class="uc-nav-item" active-class="uc-nav-item--active">
          <v-icon icon="mdi-home-outline" size="23" />
          <span>Home</span>
        </RouterLink>
        <RouterLink to="/nuova-ricetta" class="uc-nav-item" active-class="uc-nav-item--active">
          <v-icon icon="mdi-plus-circle-outline" size="23" />
          <span>Nuova ricetta</span>
        </RouterLink>
      </nav>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const showBack = computed(() => route.name !== 'feed')
const screenLabel = computed(() => route.meta?.label ?? null)
</script>

<style scoped>
.uc-backdrop {
  min-height: 100vh;
}

.uc-column {
  max-width: 480px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--uc-bg);
  display: flex;
  flex-direction: column;
}

@media (min-width: 560px) {
  .uc-backdrop {
    background: var(--uc-backdrop-gradient);
    padding: 48px 24px;
    box-sizing: border-box;
  }
  .uc-column {
    min-height: calc(100vh - 96px);
    border-radius: 24px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  }
}

.uc-topbar {
  display: grid;
  grid-template-columns: 40px 1fr 40px;
  align-items: center;
  padding: 14px 12px 10px;
  flex-shrink: 0;
  background: var(--uc-topbar-bg);
  position: sticky;
  top: 0;
  z-index: 5;
}

.uc-icon-btn,
.uc-icon-btn-spacer {
  width: 40px;
  height: 40px;
}

.uc-icon-btn {
  border: none;
  background: transparent;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--uc-text);
}

.uc-icon-btn:hover {
  background: var(--uc-border);
}

.uc-logo {
  justify-self: center;
  grid-column: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}

.uc-logo-img {
  height: 40px;
  width: auto;
  object-fit: contain;
}

.uc-screen-label {
  text-align: center;
  padding: 0 12px 8px;
  margin: 0;
  flex-shrink: 0;
  font-size: 12.5px;
  color: var(--uc-text-muted);
  background: var(--uc-topbar-bg);
}

.uc-content {
  flex: 1;
  min-height: 0;
  background: var(--uc-bg);
  padding-bottom: 96px;
}

.uc-bottom-nav {
  display: flex;
  background: #ffffff;
  flex-shrink: 0;
  margin: 0 14px 14px;
  padding: 10px 4px;
  border-radius: 20px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14);
  position: sticky;
  bottom: 14px;
  z-index: 5;
}

.uc-nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 2px 0;
  text-decoration: none;
  color: var(--uc-text-muted);
}

.uc-nav-item span {
  font-size: 11px;
  font-weight: 600;
}

.uc-nav-item--active {
  color: var(--uc-primary-strong);
}
</style>
