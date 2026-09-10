<template>
  <v-app>
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
import { ref } from 'vue'
import AppShell from '@/components/AppShell.vue'
import ProfileDialog from '@/components/ProfileDialog.vue'
import AuthView from '@/views/AuthView.vue'
import NicknameSetupView from '@/views/NicknameSetupView.vue'
import { authReady, profileReady, isSignedIn, needsNickname } from '@/identity.js'

const showProfileDialog = ref(false)
</script>

<style scoped>
.uc-boot-loader {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
}
</style>
