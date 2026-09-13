<template>
  <v-app>
    <div v-if="updateAvailable" class="uc-update-banner">
      <span>Nuova versione disponibile.</span>
      <a :href="updateDownloadUrl" target="_blank" rel="noopener">Scarica</a>
      <button type="button" aria-label="Chiudi" @click="updateAvailable = false">
        <v-icon icon="mdi-close" size="16" />
      </button>
    </div>

    <v-progress-linear v-if="!authReady || !profileReady" indeterminate class="uc-boot-loader" />

    <AuthView v-else-if="!isSignedIn" />

    <NicknameSetupView v-else-if="needsNickname" />

    <template v-else>
      <AppShell @open-profile="showProfileDialog = true">
        <router-view />
      </AppShell>
      <ProfileDialog v-model="showProfileDialog" />
    </template>
  </v-app>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import AppShell from '@/components/AppShell.vue'
import ProfileDialog from '@/components/ProfileDialog.vue'
import AuthView from '@/views/AuthView.vue'
import NicknameSetupView from '@/views/NicknameSetupView.vue'
import { authReady, profileReady, isSignedIn, needsNickname } from '@/identity.js'
import { updateAvailable, updateDownloadUrl, checkForUpdate } from '@/utils/updateCheck.js'

const showProfileDialog = ref(false)

onMounted(checkForUpdate)
</script>

<style scoped>
.uc-boot-loader {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
}

.uc-update-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 101;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--uc-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.uc-update-banner a {
  color: #fff;
  text-decoration: underline;
  font-weight: 700;
}

.uc-update-banner button {
  position: absolute;
  right: 10px;
  background: transparent;
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
}
</style>
