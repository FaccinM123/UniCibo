<template>
  <div class="uc-backdrop">
    <div class="uc-column">
      <div class="uc-auth">
        <div class="uc-auth-header">
          <img src="@/assets/logo-icona.png" alt="UniCibo" class="uc-auth-logo" />
          <p class="uc-auth-tagline">Ricette che si cucinano davvero, tra amici e coinquilini.</p>
        </div>

        <div class="uc-auth-tabs">
          <button type="button" class="uc-tab" :class="{ 'uc-tab--active': mode === 'signin' }" @click="mode = 'signin'">Accedi</button>
          <button type="button" class="uc-tab" :class="{ 'uc-tab--active': mode === 'signup' }" @click="mode = 'signup'">Registrati</button>
        </div>

        <form class="uc-auth-form" @submit.prevent="submitEmail">
          <v-text-field v-model="email" type="email" label="Email" variant="outlined" density="comfortable" hide-details class="mb-3" />
          <v-text-field v-model="password" type="password" label="Password" variant="outlined" density="comfortable" hide-details class="mb-1" />
          <div class="uc-remember-row">
            <v-checkbox v-model="rememberMe" color="primary" density="compact" hide-details label="Resta connesso" />
            <button v-if="mode === 'signin'" type="button" class="uc-forgot-link" @click="sendReset">Password dimenticata?</button>
          </div>

          <p v-if="errorMessage" class="uc-error">{{ errorMessage }}</p>
          <p v-if="infoMessage" class="uc-info">{{ infoMessage }}</p>

          <v-btn
            type="submit"
            block
            variant="flat"
            color="primary"
            size="large"
            class="uc-pill-btn mt-3"
            :loading="loading === 'email'"
            :disabled="!email.trim() || !password.trim()"
          >
            {{ mode === 'signin' ? 'Accedi' : 'Crea account' }}
          </v-btn>
        </form>

        <div class="uc-auth-divider"><span>oppure</span></div>

        <v-btn block variant="outlined" size="large" class="uc-pill-btn mb-2" :loading="loading === 'google'" @click="withGoogle">
          <v-icon icon="mdi-google" start size="18" /> Continua con Google
        </v-btn>
        <v-btn block variant="outlined" size="large" class="uc-pill-btn" :loading="loading === 'apple'" @click="withApple">
          <v-icon icon="mdi-apple" start size="18" /> Continua con Apple
        </v-btn>

        <p class="uc-legal-note">
          Continuando accetti i <a href="https://unicibo.web.app/terms.html" target="_blank" rel="noopener">Termini di Servizio</a>
          e l'<a href="https://unicibo.web.app/privacy.html" target="_blank" rel="noopener">Informativa Privacy</a>.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { signUpWithEmail, signInWithEmail, signInWithGoogle, signInWithApple, resetPassword } from '@/identity.js'

const mode = ref('signin')
const email = ref('')
const password = ref('')
const rememberMe = ref(true)
const loading = ref(false)
const errorMessage = ref('')
const infoMessage = ref('')

function friendlyError(err) {
  const map = {
    'auth/invalid-email': 'Email non valida.',
    'auth/user-not-found': 'Nessun account con questa email.',
    'auth/wrong-password': 'Password errata.',
    'auth/invalid-credential': 'Email o password errati.',
    'auth/email-already-in-use': 'Esiste già un account con questa email.',
    'auth/weak-password': 'Password troppo corta (minimo 6 caratteri).'
  }
  return map[err.code] || 'Errore, riprova.'
}

async function submitEmail() {
  errorMessage.value = ''
  infoMessage.value = ''
  loading.value = 'email'
  try {
    if (mode.value === 'signin') {
      await signInWithEmail(email.value.trim(), password.value, rememberMe.value)
    } else {
      await signUpWithEmail(email.value.trim(), password.value, rememberMe.value)
    }
  } catch (err) {
    console.error('Errore di autenticazione:', err)
    errorMessage.value = friendlyError(err)
  } finally {
    loading.value = false
  }
}

async function sendReset() {
  if (!email.value.trim()) {
    errorMessage.value = 'Scrivi la tua email, poi tocca di nuovo "Password dimenticata".'
    return
  }
  try {
    await resetPassword(email.value.trim())
    infoMessage.value = 'Email di recupero inviata, controlla la posta.'
  } catch (err) {
    console.error('Errore nel reset password:', err)
    errorMessage.value = friendlyError(err)
  }
}

async function withGoogle() {
  errorMessage.value = ''
  loading.value = 'google'
  try {
    await signInWithGoogle(rememberMe.value)
  } catch (err) {
    console.error('Errore Google Sign-In:', err)
    errorMessage.value = `[debug] ${err.code || ''} ${err.message || err}`
  } finally {
    loading.value = false
  }
}

async function withApple() {
  errorMessage.value = ''
  loading.value = 'apple'
  try {
    await signInWithApple(rememberMe.value)
  } catch (err) {
    console.error('Errore Apple Sign-In:', err)
    errorMessage.value = `[debug] ${err.code || ''} ${err.message || err}`
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* Stesso pattern responsive di AppShell.vue: colonna centrata ~480px su
   mobile (edge-to-edge), sfondo sfumato decorativo + colonna con ombra su
   schermi larghi (desktop/tablet), a partire da 560px. */
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
.uc-auth {
  max-width: 380px;
  margin: 0 auto;
  padding: 48px 24px;
  width: 100%;
  box-sizing: border-box;
}
.uc-auth-header { text-align: center; margin-bottom: 20px; }
.uc-auth-logo { height: 56px; object-fit: contain; }
.uc-auth-tagline { font-size: 13px; color: var(--uc-text-muted); margin: 10px 0 0; }
.uc-auth-tabs { display: flex; margin-bottom: 18px; border-bottom: 1px solid var(--uc-border); }
.uc-tab {
  flex: 1; text-align: center; padding: 10px 0; font-size: 14px; font-weight: 700;
  cursor: pointer; color: var(--uc-text-muted); background: transparent; border: none;
  border-bottom: 2.5px solid transparent; font-family: inherit;
}
.uc-tab--active { color: var(--uc-primary); border-bottom-color: var(--uc-primary); }
.uc-remember-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}
.uc-remember-row :deep(.v-selection-control) {
  min-height: auto;
}
.uc-remember-row :deep(.v-label) {
  font-size: 13px;
  color: var(--uc-text);
  opacity: 1;
}
.uc-forgot-link {
  margin: 0; font-size: 12px; color: var(--uc-primary);
  background: transparent; border: none; cursor: pointer; font-family: inherit;
}
.uc-error { color: #b3261e; font-size: 12.5px; margin: 10px 0 0; }
.uc-info { color: var(--uc-secondary); font-size: 12.5px; margin: 10px 0 0; }
.uc-pill-btn { border-radius: var(--uc-radius-pill); text-transform: none; font-weight: 700; }
.uc-auth-divider {
  display: flex; align-items: center; gap: 10px; margin: 20px 0 14px;
  color: var(--uc-text-muted); font-size: 12px;
}
.uc-auth-divider::before, .uc-auth-divider::after {
  content: ''; flex: 1; height: 1px; background: var(--uc-border);
}
.uc-legal-note {
  font-size: 11px;
  color: var(--uc-text-muted);
  text-align: center;
  margin: 16px 0 0;
  line-height: 1.5;
}
.uc-legal-note a {
  color: var(--uc-text-muted);
  text-decoration: underline;
}
</style>
