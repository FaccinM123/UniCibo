<template>
  <div class="uc-backdrop">
    <div class="uc-column">
      <div class="uc-nickname-setup">
        <img src="@/assets/logo-icona.png" alt="UniCibo" class="uc-logo" />
        <h1 class="uc-title">Scegli un nickname</h1>
        <p class="uc-subtitle">È così che gli altri ti vedranno nei gruppi e nei post.</p>

        <v-text-field
          v-model="nickname"
          placeholder="Es. Marco89"
          variant="outlined"
          density="comfortable"
          autofocus
          hide-details
          class="mb-4"
          @keyup.enter="save"
        />

        <v-btn block variant="flat" color="primary" size="large" class="uc-pill-btn" :loading="saving" :disabled="!nickname.trim()" @click="save">
          Continua
        </v-btn>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { completeNickname } from '@/identity.js'

const nickname = ref('')
const saving = ref(false)

async function save() {
  if (!nickname.value.trim()) return
  saving.value = true
  try {
    await completeNickname(nickname.value)
  } catch (err) {
    console.error('Errore nel salvare il nickname:', err)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
/* Stesso pattern responsive di AppShell.vue/AuthView.vue: colonna centrata
   su mobile, sfondo sfumato decorativo + colonna con ombra da 560px in su. */
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
  justify-content: center;
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
.uc-nickname-setup {
  max-width: 360px;
  margin: 0 auto;
  padding: 64px 24px;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
}
.uc-logo { height: 56px; object-fit: contain; margin-bottom: 16px; }
.uc-title { font-size: 20px; font-weight: 700; margin: 0 0 6px; color: var(--uc-text); }
.uc-subtitle { font-size: 13px; color: var(--uc-text-muted); margin: 0 0 24px; }
.uc-pill-btn { border-radius: var(--uc-radius-pill); text-transform: none; font-weight: 700; }
</style>
