<template>
  <v-app>
    <AppShell>
      <router-view />
    </AppShell>

    <!-- Dialog di primo accesso: chiede solo il nickname, niente password.
         È il cuore della "identità leggera" dichiarata come limite. -->
    <v-dialog v-model="showIdentityDialog" persistent max-width="360">
      <v-card class="uc-welcome-card">
        <div class="uc-welcome-header">
          <img src="@/assets/logo-icona.png" alt="UniCibo" class="uc-welcome-logo" />
          <p class="uc-welcome-tagline">Ricette che si cucinano davvero, tra amici e coinquilini.</p>
        </div>

        <v-card-text class="pt-0">
          <p class="text-caption uc-label mb-1">Nickname</p>
          <v-text-field
            v-model="nicknameInput"
            placeholder="Es. Marco89"
            variant="outlined"
            density="comfortable"
            autofocus
            hide-details
            @keyup.enter="saveNickname"
          />

          <div class="uc-info-box">
            <v-icon icon="mdi-information-outline" size="20" />
            <span>
              Niente password: la tua identità è solo questo nickname, salvato sul
              tuo dispositivo. Per entrare in un gruppo o crearne uno serve un
              <strong>codice invito</strong>.
            </span>
          </div>
        </v-card-text>

        <v-card-actions class="pt-0">
          <v-btn
            block
            variant="flat"
            color="primary"
            size="large"
            class="uc-pill-btn"
            :disabled="!nicknameInput.trim()"
            @click="saveNickname"
          >
            Continua
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import AppShell from '@/components/AppShell.vue'
import { hasIdentity, setNickname } from '@/identity.js'

const showIdentityDialog = ref(false)
const nicknameInput = ref('')

onMounted(() => {
  showIdentityDialog.value = !hasIdentity()
})

function saveNickname() {
  if (!nicknameInput.value.trim()) return
  setNickname(nicknameInput.value)
  showIdentityDialog.value = false
}
</script>

<style scoped>
.uc-welcome-card {
  border-radius: var(--uc-radius-card);
  padding: 8px 4px 16px;
}

.uc-welcome-header {
  text-align: center;
  padding: 24px 20px 8px;
}

.uc-welcome-logo {
  height: 56px;
  object-fit: contain;
}

.uc-welcome-tagline {
  font-size: 13px;
  color: var(--uc-text-muted);
  margin: 10px 0 0;
}

.uc-label {
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--uc-text-muted);
  text-transform: uppercase;
}

.uc-info-box {
  display: flex;
  gap: 10px;
  background: var(--uc-secondary-container);
  border-radius: 12px;
  padding: 14px 16px;
  margin-top: 18px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--uc-text);
}

.uc-pill-btn {
  border-radius: var(--uc-radius-pill);
  text-transform: none;
  font-weight: 700;
}
</style>
