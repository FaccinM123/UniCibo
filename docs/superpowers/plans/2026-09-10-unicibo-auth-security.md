# UniCibo — Autenticazione reale e sicurezza — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire l'identità anonima `localStorage` di UniCibo con un vero login Firebase Auth (email/password + Google + Apple), un profilo utente reale su Firestore, e regole di sicurezza che impediscono davvero a un utente di impersonarne un altro o leggere contenuti privati che non gli spettano.

**Architecture:** Due nuovi moduli di basso livello (`src/auth.js` per la sessione Firebase Auth, `src/services/userProfile.js` per il documento `users/{uid}`) vengono combinati in `src/identity.js`, che resta il punto d'ingresso unico usato da tutte le view/componenti (stessa API pubblica di oggi dove possibile, per minimizzare il diff nei consumatori). `App.vue` diventa un gate: mostra login → setup nickname → app vera, in base allo stato reattivo di `identity.js`. Le `firestore.rules` passano da "verificano solo la forma dei dati" a "verificano anche chi sta scrivendo" via `request.auth.uid`.

**Tech Stack:** Vue 3 (Composition API) + Vuetify 3 + Firebase Auth (web SDK, provider email/password + Google + Apple) + Cloud Firestore. Nessuna nuova dipendenza npm: `firebase/auth` è già incluso nel pacchetto `firebase` già installato.

**Spec:** [docs/superpowers/specs/2026-09-10-unicibo-auth-security-design.md](../specs/2026-09-10-unicibo-auth-security-design.md)

## Global Constraints

- Nessun vincolo del corso resta in vigore: si può usare qualunque tecnica Firestore/Firebase utile (questo piano comunque non ha bisogno di `onSnapshot`/`runTransaction`, che restano un sotto-progetto separato).
- **Approccio ai test**: questo repo non ha un framework di test automatico (nessun `vitest`/`jest` in `package.json`, nessun test esistente) — tutta l'app è sempre stata verificata manualmente via `npm run dev` nel browser. Questo piano segue la stessa convenzione: ogni task si chiude con una verifica manuale concreta (passi precisi da eseguire nel browser), non con `pytest`/`vitest`. Non introdurre un test runner: sarebbe un progetto a sé, non richiesto.
- Si evolve `sfamati` direttamente (l'esame è già stato consegnato, confermato dall'utente). Stesso progetto Firebase già configurato in `.env`/`firebase.json`/`.firebaserc`.
- Login social implementato con `signInWithPopup` (SDK web di Firebase Auth) — funziona nel browser/dev server. Lo scambio con il plugin nativo Capacitor (`@capacitor-firebase/authentication`) per iOS/Android è un sotto-progetto separato (pacchettizzazione store), fuori scope qui.
- Rinomina di campo: `authorLocalId` → `authorId` su `recipes` e `recipes/{id}/comments/{id}`. Non tocca `recipes/{id}/reactions/{authorId}` (lì l'id del documento è già l'uid, nessun campo da rinominare) né `groups` (usa già `createdBy`/`memberIds`, non `authorLocalId`).
- `scripts/import-brand-recipes.mjs` **non** viene modificato: le ricette `source:'brand'` restano identificate solo da quel campo, senza `visibility`/`authorId` — tutte le regole/query di questo piano trattano `source == 'brand'` come "sempre pubblico" a prescindere.

## File Structure

Nuovi file:
- `src/auth.js` — stato reattivo della sessione Firebase Auth + azioni (signUp/signIn/signOut/reset/delete).
- `src/services/userProfile.js` — CRUD del documento `users/{uid}` (profilo, gruppi a cui si è aderito, post salvati).
- `src/views/AuthView.vue` — schermata login/registrazione.
- `src/views/NicknameSetupView.vue` — step "scegli nickname" al primo accesso.
- `scripts/reset-test-data.mjs` — script una tantum (Admin SDK) per svuotare i dati di test prima del lancio reale.

File modificati (in ordine di dipendenza):
- `src/firebase.js` — esporta anche l'istanza Auth.
- `src/identity.js` — riscritto come facciata su `auth.js` + `userProfile.js`.
- `src/App.vue` — gate login → nickname → app.
- `firestore.rules` — regole basate su `request.auth.uid`.
- `firestore.indexes.json` — nuovo indice composito per il feed pubblico.
- `src/components/ProfileDialog.vue` — profilo via Firestore, + Esci/Elimina account.
- `src/views/GroupsView.vue`, `src/views/GroupDetailsView.vue` — `await` sulle mutazioni profilo ora asincrone.
- `src/views/NewRecipeView.vue` — destinazione "Pubblico" + `visibility` + `authorId`.
- `src/views/FeedView.vue` — feed pubblico oltre a brand/gruppo.
- `src/components/RecipeCard.vue`, `src/components/CommentList.vue` — `authorId` al posto di `authorLocalId`.
- `src/views/PostManagementView.vue`, `src/views/MemberView.vue` — `authorId` + risoluzione nickname reale via `users/{uid}`.

Non serve toccare `src/components/AppShell.vue` (non usa `identity.js`) né `src/components/ReactionBar.vue` (usa già solo `getUserId()`, che resta con la stessa firma sincrona — vedi Task 4).

---

### Task 1: Abilitare Firebase Auth (console) + esportare l'istanza Auth

**Files:**
- Modify: `src/firebase.js`

**Interfaces:**
- Produces: `export const auth` — istanza `Auth` di Firebase, usata da `src/auth.js` (Task 2).

- [ ] **Step 1: Configurazione manuale in Firebase Console (azione dell'utente, non automatizzabile da qui)**

  1. Apri [Firebase Console](https://console.firebase.google.com/) → progetto `sfamati` → **Authentication** → **Sign-in method**.
  2. Abilita **Email/Password**.
  3. Abilita **Google** (Firebase configura da solo un client OAuth web di default — non serve altro per il web).
  4. Abilita **Apple**: richiede un **Apple Developer Program** attivo (99$/anno). Servono un Service ID e una chiave privata generati nel portale Apple Developer, poi incollati nella console Firebase. Finché non è configurato, il pulsante "Continua con Apple" nell'app darà errore — accettabile per ora, è un limite noto già segnalato nello spec.

- [ ] **Step 2: Esportare l'istanza Auth**

Sostituisci il contenuto di `src/firebase.js`:

```js
// Inizializzazione Firebase + esportazione delle istanze Firestore/Auth
// usate da tutte le view/componenti dell'app.
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
```

- [ ] **Step 3: Verifica manuale**

Avvia `npm run dev`, apri l'app nel browser, apri la console del browser: nessun errore relativo a `firebase/auth` o a inizializzazione. (L'app non "fa" ancora nulla con l'Auth: questo task prepara solo la base per il Task 2.)

- [ ] **Step 4: Commit**

```bash
git add src/firebase.js
git commit -m "feat(auth): export Firebase Auth instance"
```

---

### Task 2: `src/auth.js` — sessione Firebase Auth

**Files:**
- Create: `src/auth.js`

**Interfaces:**
- Consumes: `auth` da `src/firebase.js` (Task 1).
- Produces: `authUser` (ref, `User|null`), `authReady` (ref, `boolean`), `signUpWithEmail(email, password)`, `signInWithEmail(email, password)`, `signInWithGoogle()`, `signInWithApple()`, `signOutUser()`, `resetPassword(email)`, `deleteAuthAccount()` — tutte consumate da `src/identity.js` (Task 4).

- [ ] **Step 1: Scrivere il modulo**

```js
// Wrapper attorno a Firebase Auth: stato reattivo della sessione + azioni.
// Nessun dato di profilo qui (nickname/bio/...): quello vive in
// src/services/userProfile.js, questo modulo si occupa solo di "chi sei".
import { ref } from 'vue'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, OAuthProvider, signInWithPopup,
  signOut, sendPasswordResetEmail, deleteUser
} from 'firebase/auth'
import { auth } from '@/firebase.js'

// authReady diventa true una sola volta, alla prima risposta di Firebase
// Auth (che sia "nessuna sessione" o "sessione trovata"). Finché è false,
// l'app non sa ancora se mostrare login o contenuto: vedi App.vue (Task 6).
export const authUser = ref(null)
export const authReady = ref(false)

onAuthStateChanged(auth, (user) => {
  authUser.value = user
  authReady.value = true
})

export async function signUpWithEmail(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function signInWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function signInWithGoogle() {
  const cred = await signInWithPopup(auth, new GoogleAuthProvider())
  return cred.user
}

export async function signInWithApple() {
  const cred = await signInWithPopup(auth, new OAuthProvider('apple.com'))
  return cred.user
}

export async function signOutUser() {
  await signOut(auth)
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email)
}

// Va chiamata DOPO aver cancellato users/{uid} su Firestore (vedi
// deleteUserProfile in userProfile.js): una volta eliminata l'utenza Auth,
// request.auth non esiste più e le regole non autorizzerebbero più la
// cancellazione del proprio profilo.
export async function deleteAuthAccount() {
  if (!auth.currentUser) return
  await deleteUser(auth.currentUser)
}
```

- [ ] **Step 2: Verifica manuale**

Nella console del browser (dev server acceso), esegui temporaneamente:
```js
const m = await import('/src/auth.js')
console.log(m.authReady.value, m.authUser.value)
```
Atteso: `true null` (nessuno ha ancora fatto login). Nessun errore.

- [ ] **Step 3: Commit**

```bash
git add src/auth.js
git commit -m "feat(auth): add Firebase Auth session wrapper"
```

---

### Task 3: `src/services/userProfile.js` — profilo `users/{uid}`

**Files:**
- Create: `src/services/userProfile.js`

**Interfaces:**
- Consumes: `db` da `src/firebase.js`.
- Produces: `profile` (ref, oggetto profilo o `null`), `loadUserProfile(uid)`, `createUserProfile(uid, nickname)`, `getUserProfileById(uid)`, `updateOwnProfile(uid, fields)`, `addJoinedGroupId(uid, groupId)`, `removeJoinedGroupId(uid, groupId)`, `toggleSavedRecipeId(uid, recipeId)`, `deleteUserProfile(uid)` — tutte consumate da `src/identity.js` (Task 4).

- [ ] **Step 1: Scrivere il modulo**

```js
// users/{uid}: profilo Firestore che sostituisce localStorage (nickname,
// bio, foto profilo, gruppi a cui si è aderito, post salvati). Letture/
// scritture singole (niente onSnapshot, stesso pattern già in uso nel
// resto dell'app): dopo ogni scrittura aggiorniamo `profile` a mano.
import { ref } from 'vue'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { db } from '@/firebase.js'

export const profile = ref(null)

function profileRef(uid) {
  return doc(db, 'users', uid)
}

export async function loadUserProfile(uid) {
  const snap = await getDoc(profileRef(uid))
  profile.value = snap.exists() ? { id: snap.id, ...snap.data() } : null
  return profile.value
}

export async function createUserProfile(uid, nickname) {
  const data = {
    nickname: nickname.trim(),
    bio: '',
    avatarPhoto: '',
    joinedGroupIds: [],
    savedRecipeIds: [],
    createdAt: new Date()
  }
  await setDoc(profileRef(uid), data)
  profile.value = { id: uid, ...data }
  return profile.value
}

export async function getUserProfileById(uid) {
  const snap = await getDoc(profileRef(uid))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function updateOwnProfile(uid, fields) {
  await updateDoc(profileRef(uid), fields)
  profile.value = { ...profile.value, ...fields }
}

export async function addJoinedGroupId(uid, groupId) {
  await updateDoc(profileRef(uid), { joinedGroupIds: arrayUnion(groupId) })
  profile.value = {
    ...profile.value,
    joinedGroupIds: [...(profile.value?.joinedGroupIds || []), groupId]
  }
}

export async function removeJoinedGroupId(uid, groupId) {
  await updateDoc(profileRef(uid), { joinedGroupIds: arrayRemove(groupId) })
  profile.value = {
    ...profile.value,
    joinedGroupIds: (profile.value?.joinedGroupIds || []).filter((id) => id !== groupId)
  }
}

export async function toggleSavedRecipeId(uid, recipeId) {
  const current = profile.value?.savedRecipeIds || []
  const isSaved = current.includes(recipeId)
  if (isSaved) {
    await updateDoc(profileRef(uid), { savedRecipeIds: arrayRemove(recipeId) })
    profile.value = { ...profile.value, savedRecipeIds: current.filter((id) => id !== recipeId) }
  } else {
    await updateDoc(profileRef(uid), { savedRecipeIds: arrayUnion(recipeId) })
    profile.value = { ...profile.value, savedRecipeIds: [...current, recipeId] }
  }
  return !isSaved
}

export async function deleteUserProfile(uid) {
  await deleteDoc(profileRef(uid))
  profile.value = null
}
```

- [ ] **Step 2: Verifica manuale**

Non testabile in isolamento senza una sessione Auth valida (le regole Firestore del Task 7 richiederanno `request.auth`): la verifica reale avviene nel Task 5 (creazione profilo dopo il nickname setup). Per ora verifica solo che il file non abbia errori di sintassi: `npm run build` deve completare senza errori.

- [ ] **Step 3: Commit**

```bash
git add src/services/userProfile.js
git commit -m "feat(auth): add Firestore users/{uid} profile service"
```

---

### Task 4: Riscrivere `src/identity.js` come facciata

**Files:**
- Modify: `src/identity.js` (riscrittura completa)

**Interfaces:**
- Consumes: tutto da `src/auth.js` (Task 2) e `src/services/userProfile.js` (Task 3).
- Produces (API pubblica usata da tutte le view — invariata rispetto a oggi dove possibile): `getUserId()`, `getNickname()`, `getBio()`, `getAvatarPhoto()`, `getJoinedGroupIds()`, `getSavedRecipeIds()`, `isRecipeSaved(id)` — sincrone come oggi. **Nuove/cambiate**: `authUser`, `authReady`, `profile`, `profileReady` (refs), `isSignedIn`, `needsNickname` (computed), `completeNickname(nickname)`, `updateProfile({nickname,bio,avatarPhoto})`, `addJoinedGroupId(id)`, `removeJoinedGroupId(id)`, `toggleSavedRecipeId(id)` (ora **asincrone**, richiedono `await`), `resolveNickname(uid)`, `signUpWithEmail`, `signInWithEmail`, `signInWithGoogle`, `signInWithApple`, `signOutUser`, `resetPassword`, `deleteAccount`. **Rimosso**: `hasIdentity()`, `setNickname(nickname)` diretto (sostituito da `completeNickname`/`updateProfile`), `setBio`, `setAvatarPhoto` (dentro `updateProfile`).

- [ ] **Step 1: Sostituire tutto il contenuto di `src/identity.js`**

```js
// Facciata identità: combina la sessione Firebase Auth (src/auth.js) e il
// profilo Firestore (src/services/userProfile.js). Sostituisce la vecchia
// identità "leggera" basata solo su localStorage. Le view continuano a
// importare da qui, così il diff nei consumatori resta minimo.
import { ref, computed, watch } from 'vue'
import {
  authUser, authReady,
  signUpWithEmail, signInWithEmail, signInWithGoogle, signInWithApple,
  signOutUser, resetPassword, deleteAuthAccount
} from '@/auth.js'
import {
  profile, loadUserProfile, createUserProfile, getUserProfileById,
  updateOwnProfile,
  addJoinedGroupId as addJoinedGroupIdOnProfile,
  removeJoinedGroupId as removeJoinedGroupIdFromProfile,
  toggleSavedRecipeId as toggleSavedRecipeIdOnProfile,
  deleteUserProfile
} from '@/services/userProfile.js'

export { authUser, authReady, profile }
export { signUpWithEmail, signInWithEmail, signInWithGoogle, signInWithApple, signOutUser, resetPassword }

// true solo dopo che il PRIMO caricamento del profilo (o la sua assenza,
// per un utente sloggato) si è concluso. Senza questo flag, subito dopo un
// reload authReady/isSignedIn diventano true un istante prima che
// loadUserProfile(uid) risolva: needsNickname leggerebbe profile.value
// ancora a null e mostrerebbe un lampo di NicknameSetupView anche per un
// utente che un profilo ce l'ha già.
export const profileReady = ref(false)

// Ogni volta che cambia la sessione, ricarica il profilo corrispondente
// (o lo svuota se l'utente esce). `immediate: true` lo esegue anche subito
// all'avvio dell'app, non solo sui cambi successivi.
watch(authUser, async (user) => {
  profileReady.value = false
  if (user) {
    await loadUserProfile(user.uid)
  } else {
    profile.value = null
  }
  profileReady.value = true
}, { immediate: true })

export const isSignedIn = computed(() => !!authUser.value)
// Un utente autenticato, col profilo già (ri)caricato, ma senza ancora un
// documento users/{uid}: deve passare dallo step "scegli nickname" prima
// di vedere il resto dell'app.
export const needsNickname = computed(() => authReady.value && profileReady.value && isSignedIn.value && profile.value === null)

export function getUserId() {
  return authUser.value?.uid || null
}

export function getNickname() {
  return profile.value?.nickname || ''
}

export function getBio() {
  return profile.value?.bio || ''
}

export function getAvatarPhoto() {
  return profile.value?.avatarPhoto || ''
}

export function getJoinedGroupIds() {
  return profile.value?.joinedGroupIds || []
}

export function getSavedRecipeIds() {
  return profile.value?.savedRecipeIds || []
}

export function isRecipeSaved(recipeId) {
  return getSavedRecipeIds().includes(recipeId)
}

export async function completeNickname(nickname) {
  await createUserProfile(authUser.value.uid, nickname)
}

export async function updateProfile({ nickname, bio, avatarPhoto }) {
  await updateOwnProfile(authUser.value.uid, {
    nickname: nickname.trim(),
    bio: bio.trim(),
    avatarPhoto: avatarPhoto || ''
  })
}

export async function addJoinedGroupId(groupId) {
  await addJoinedGroupIdOnProfile(authUser.value.uid, groupId)
}

export async function removeJoinedGroupId(groupId) {
  await removeJoinedGroupIdFromProfile(authUser.value.uid, groupId)
}

export async function toggleSavedRecipeId(recipeId) {
  return toggleSavedRecipeIdOnProfile(authUser.value.uid, recipeId)
}

// Risolve il nickname di un QUALSIASI utente (non solo il proprio) leggendo
// il suo users/{uid} — sostituisce la vecchia euristica "prendi il nickname
// dall'ultimo post pubblicato", ora che un vero profilo esiste sempre.
export async function resolveNickname(uid) {
  const p = await getUserProfileById(uid)
  return p?.nickname || 'Utente'
}

export async function deleteAccount() {
  const uid = authUser.value?.uid
  if (!uid) return
  await deleteUserProfile(uid)
  await deleteAuthAccount()
}
```

- [ ] **Step 2: Verifica manuale**

**Attenzione**: `npm run build` a questo punto FALLISCE, e questo è atteso — non un difetto di questo task. `src/App.vue` e `src/components/ProfileDialog.vue` (non ancora aggiornati: succede nei Task 6 e 8) importano ancora `hasIdentity`, `setNickname`, `setBio`, `setAvatarPhoto` da `@/identity.js`, funzioni che questa riscrittura rimuove del tutto (sostituite da `isSignedIn`/`needsNickname`, `completeNickname`, `updateProfile`). Rollup fallisce la build su un import con nome che non esiste più — a differenza di una funzione che è ancora esportata ma è diventata asincrona, che non causa errori di build. **Non aggiungere funzioni "ponte"/di compatibilità per far passare la build**: verrebbero ignorate dai Task 6/8, che riscrivono `App.vue`/`ProfileDialog.vue` assumendo che quei nomi non esistano più in `identity.js`. La verifica corretta per QUESTO task è: l'errore di build riportato da Vite nomina solo `App.vue`/`ProfileDialog.vue` e solo quei quattro nomi — nessun altro errore, nessun errore di sintassi dentro `identity.js` stesso. La verifica funzionale reale (build che torna a passare) arriva a fine Task 6 (per `App.vue`) e fine Task 8 (per `ProfileDialog.vue`).

- [ ] **Step 3: Commit**

```bash
git add src/identity.js
git commit -m "feat(auth): rewrite identity.js as facade over real auth+profile"
```

---

### Task 5: `AuthView.vue` (login/registrazione) + `NicknameSetupView.vue`

**Files:**
- Create: `src/views/AuthView.vue`
- Create: `src/views/NicknameSetupView.vue`

**Interfaces:**
- Consumes: `signUpWithEmail`, `signInWithEmail`, `signInWithGoogle`, `signInWithApple`, `resetPassword`, `completeNickname` da `@/identity.js` (Task 4).
- Produces: due componenti montati direttamente da `App.vue` (Task 6), non route del router (non serve navigazione: `App.vue` decide quale mostrare in base allo stato di auth).

- [ ] **Step 1: Creare `src/views/AuthView.vue`**

```vue
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
          <button v-if="mode === 'signin'" type="button" class="uc-forgot-link" @click="sendReset">Password dimenticata?</button>

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
      await signInWithEmail(email.value.trim(), password.value)
    } else {
      await signUpWithEmail(email.value.trim(), password.value)
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
    await signInWithGoogle()
  } catch (err) {
    console.error('Errore Google Sign-In:', err)
    errorMessage.value = 'Errore con l\'accesso Google, riprova.'
  } finally {
    loading.value = false
  }
}

async function withApple() {
  errorMessage.value = ''
  loading.value = 'apple'
  try {
    await signInWithApple()
  } catch (err) {
    console.error('Errore Apple Sign-In:', err)
    errorMessage.value = 'Errore con l\'accesso Apple, riprova.'
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
.uc-tab--active { color: var(--uc-primary-strong); border-bottom-color: var(--uc-primary); }
.uc-forgot-link {
  display: block; margin: 6px 0 0; font-size: 12px; color: var(--uc-primary-strong);
  background: transparent; border: none; cursor: pointer; font-family: inherit; text-align: right; width: 100%;
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
</style>
```

- [ ] **Step 2: Creare `src/views/NicknameSetupView.vue`**

```vue
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
```

- [ ] **Step 3: Verifica manuale**

`npm run build` continua a fallire a questo punto della sequenza — **stesso motivo già spiegato nel Task 4 Step 2**: `App.vue`/`ProfileDialog.vue` non ancora aggiornati (Task 6/8) importano ancora nomi rimossi da `identity.js`. Non è causato da questi due componenti nuovi, che non sono ancora montati da nessuna parte. Verifica qui solo che l'errore di build non nomini `AuthView.vue`/`NicknameSetupView.vue` — se lo fa, è un problema reale di questo task; se nomina solo `App.vue`/`ProfileDialog.vue`, è il fallimento atteso e si risolve nei Task 6/8. La verifica funzionale reale (build che torna a passare, e verifica desktop responsive) arriva a fine Task 6: vedi Task 6 Step 2.

- [ ] **Step 4: Commit**

```bash
git add src/views/AuthView.vue src/views/NicknameSetupView.vue
git commit -m "feat(auth): add login/signup and nickname setup screens"
```

---

### Task 6: `App.vue` — gate login → nickname → app

**Files:**
- Modify: `src/App.vue` (riscrittura completa)

**Interfaces:**
- Consumes: `authReady`, `profileReady`, `isSignedIn`, `needsNickname` da `@/identity.js` (Task 4); `AuthView`, `NicknameSetupView` (Task 5).

- [ ] **Step 1: Sostituire tutto il contenuto di `src/App.vue`**

```vue
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
```

Nota: tutto il vecchio dialog "Benvenuto" (nickname-only, `v-dialog persistent`) e le relative classi CSS (`.uc-welcome-*`, `.uc-info-box`, `.uc-label`, `.uc-pill-btn`) vengono rimossi da qui — la stessa logica ora vive in `AuthView.vue`/`NicknameSetupView.vue` (Task 5).

- [ ] **Step 2: Verifica manuale**

1. `npm run dev`, apri l'app nel browser con `localStorage` pulito.
2. Atteso: breve barra di caricamento, poi la schermata `AuthView` (tab Accedi/Registrati).
3. Tab "Registrati" → inserisci una email di test e una password di almeno 6 caratteri → "Crea account". Atteso: dopo un istante appare `NicknameSetupView`.
4. Inserisci un nickname → "Continua". Atteso: appare l'app vera (top bar + feed + bottom nav), esattamente come prima ma ora dietro login.
5. Ricarica la pagina (F5). Atteso: **niente** schermata di login — la sessione Firebase Auth persiste, si entra direttamente nel feed (dopo il breve loader).
6. Controlla nella Firebase Console → Authentication che l'utente compaia, e in Firestore che esista `users/{quel-uid}` con `nickname` corretto.
7. **Verifica desktop responsive**: esci (o pulisci `localStorage`), poi allarga la finestra del browser oltre 560px di larghezza. Atteso su `AuthView` e su `NicknameSetupView` (durante la registrazione): stesso trattamento già presente in `AppShell.vue` per il resto dell'app — sfondo sfumato decorativo, colonna centrata a ~480px con angoli arrotondati e ombra, non il form semplicemente disteso a tutta larghezza. Restringi di nuovo sotto 560px: torna edge-to-edge come su mobile.

- [ ] **Step 3: Commit**

```bash
git add src/App.vue
git commit -m "feat(auth): gate app behind real login and nickname setup"
```

---

### Task 7: Riscrivere `firestore.rules` e `firestore.indexes.json`

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Nessuna interfaccia JS: regole lato server. Da qui in poi ogni scrittura Firestore dell'app deve rispettare `authorId == request.auth.uid` (recipes/comments) o `request.auth.uid` nel punto giusto di `memberIds` (groups).

- [ ] **Step 1: Sostituire tutto `firestore.rules`**

```
rules_version = '2';

// Autenticazione reale via Firebase Auth (email/password, Google, Apple).
// Ogni scrittura sensibile verifica request.auth.uid: non è più possibile
// scrivere/modificare/cancellare contenuti a nome di un altro utente.
//
// LIMITE CONSAPEVOLE ANCORA PRESENTE (gruppi): l'adesione a un gruppo resta
// basata solo su un "codice invito" leggibile da chiunque sia loggato (serve
// per validarlo prima di entrare) — le regole non possono verificare che chi
// scrive memberIds "conoscesse per davvero" il codice, quindi un utente
// autenticato che elenca tutti i gruppi può unirsi a uno qualsiasi senza
// avere il codice. Una vera barriera richiederebbe una Cloud Function (fuori
// dallo stack di questo progetto); va dichiarato come limite, non risolto qui.

service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function isOwner(uid) {
      return isSignedIn() && request.auth.uid == uid;
    }

    // --- USERS ---
    match /users/{uid} {
      // Il profilo (nickname, avatar) è leggibile da chiunque sia loggato:
      // serve per mostrare autori/membri di gruppo ovunque nell'app.
      // NOTA: questo espone anche joinedGroupIds/savedRecipeIds a chiunque
      // sia loggato (Firestore non ha sicurezza a livello di singolo campo
      // dentro un documento) — limite consapevole, non affrontato in questo
      // task; un'eventuale correzione sposterebbe savedRecipeIds in una
      // sotto-collezione privata a parte.
      allow read: if isSignedIn();
      allow create: if isOwner(uid)
                    && request.resource.data.keys().hasAll(
                         ['nickname', 'bio', 'avatarPhoto', 'joinedGroupIds', 'savedRecipeIds', 'createdAt']
                       )
                    && request.resource.data.nickname is string
                    && request.resource.data.bio is string
                    && request.resource.data.avatarPhoto is string
                    && request.resource.data.joinedGroupIds is list
                    && request.resource.data.savedRecipeIds is list
                    && request.resource.data.createdAt is timestamp;
      // Le stesse verifiche di tipo del create si applicano anche
      // all'update: request.resource.data rappresenta sempre il documento
      // risultante completo (non solo i campi toccati), quindi ricontrollarle
      // qui impedisce di corrompere il profilo con un update parziale.
      allow update: if isOwner(uid)
                    && request.resource.data.nickname is string
                    && request.resource.data.bio is string
                    && request.resource.data.avatarPhoto is string
                    && request.resource.data.joinedGroupIds is list
                    && request.resource.data.savedRecipeIds is list;
      allow delete: if isOwner(uid);
    }

    // --- GROUPS ---
    match /groups/{groupId} {
      // Leggibile da chiunque sia loggato (serve a validare un codice
      // invito prima di essere membro — vedi limite dichiarato in cima al
      // file: questa stessa apertura è ciò che rende il codice invito non
      // davvero segreto).
      allow read: if isSignedIn();

      allow create: if isSignedIn()
                    && request.resource.data.memberIds is list
                    && request.resource.data.memberIds.size() == 1
                    && request.resource.data.memberIds[0] == request.auth.uid
                    && request.resource.data.createdBy == request.auth.uid
                    && request.resource.data.keys().hasAll(
                         ['name', 'inviteCode', 'createdBy', 'memberIds', 'description', 'photoUrl', 'memberNicknames', 'createdAt']
                       )
                    && request.resource.data.name is string
                    && request.resource.data.inviteCode is string
                    && request.resource.data.description is string
                    && (request.resource.data.photoUrl is string || request.resource.data.photoUrl == null)
                    && request.resource.data.memberNicknames is map
                    && request.resource.data.createdAt is timestamp;

      allow update: if isSignedIn() && (
        // Adesione: SOLO aggiungere se stessi a memberIds/memberNicknames,
        // senza perdere nessuno dei membri già presenti (il confronto è tra
        // il documento NUOVO e quello VECCHIO, non il vecchio con se stesso).
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['memberIds', 'memberNicknames'])
          && request.resource.data.memberIds.size() == resource.data.memberIds.size() + 1
          && request.resource.data.memberIds.hasAll(resource.data.memberIds)
          && !resource.data.memberIds.hasAny([request.auth.uid])
          && request.resource.data.memberIds.hasAny([request.auth.uid]))
        ||
        // Uscita/espulsione: te stesso che esci, oppure l'admin che espelle.
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['memberIds', 'memberNicknames'])
          && request.resource.data.memberIds.size() == resource.data.memberIds.size() - 1
          && resource.data.memberIds.hasAll(request.resource.data.memberIds)
          && (
               (resource.data.memberIds.hasAny([request.auth.uid]) && !request.resource.data.memberIds.hasAny([request.auth.uid]))
               || resource.data.createdBy == request.auth.uid
             ))
        ||
        // Modifica dati gruppo: solo l'admin (createdBy).
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name', 'description', 'photoUrl'])
          && resource.data.createdBy == request.auth.uid
          && request.resource.data.name is string
          && request.resource.data.description is string
          && (request.resource.data.photoUrl is string || request.resource.data.photoUrl == null))
      );

      allow delete: if false;
    }

    // --- RECIPES ---
    match /recipes/{recipeId} {
      function isGroupMember(gid) {
        return isSignedIn()
               && request.auth.uid in get(/databases/$(database)/documents/groups/$(gid)).data.memberIds;
      }

      // Lettura: ricette brand e post pubblici a chi è loggato; post di
      // gruppo solo ai membri di quel gruppo (verificato via get()); e in
      // più, sempre al proprio autore anche se nel frattempo ha lasciato il
      // gruppo (altrimenti "Gestione post" smetterebbe di funzionare per i
      // post lasciati indietro — Firestore nega l'intera query se anche un
      // solo documento restituito fallisce la regola, non filtra in
      // silenzio). L'ordine dei rami sfrutta lo short-circuit di && / ||
      // (documentato e affidabile in Firestore Rules): per un documento
      // brand il primo ramo è già vero e "visibility"/"groupId" (che i
      // documenti brand non hanno) non vengono mai letti.
      allow read: if isSignedIn() && (
        resource.data.source == 'brand'
        || resource.data.visibility == 'public'
        || (resource.data.visibility == 'group' && isGroupMember(resource.data.groupId))
        || resource.data.authorId == request.auth.uid
      );

      // Creazione: solo ricette 'group' dal client (le 'brand' arrivano
      // solo dallo script di import, Admin SDK, bypassa le regole).
      allow create: if isSignedIn()
                    && request.resource.data.source == 'group'
                    && request.resource.data.brandName == null
                    && request.resource.data.authorId == request.auth.uid
                    && request.resource.data.visibility in ['public', 'group']
                    && (request.resource.data.visibility == 'public'
                        ? request.resource.data.groupId == null
                        : isGroupMember(request.resource.data.groupId))
                    && request.resource.data.keys().hasAll(
                         ['title', 'imageUrl', 'ingredients', 'steps', 'source', 'brandName',
                          'visibility', 'groupId', 'authorNickname', 'authorId', 'reactionCounts', 'createdAt']
                       )
                    && request.resource.data.title is string
                    && request.resource.data.ingredients is list
                    && request.resource.data.steps is list
                    && request.resource.data.authorNickname is string
                    && request.resource.data.reactionCounts == {'cucinarlo': 0, 'mangiarlo': 0, 'nonMiPiace': 0}
                    && request.resource.data.createdAt is timestamp;

      allow update: if
        // Reazioni: chiunque possa leggere il post può aggiornarne i conteggi.
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reactionCounts'])
          && (resource.data.source == 'brand'
              || resource.data.visibility == 'public'
              || (resource.data.visibility == 'group' && isGroupMember(resource.data.groupId))))
        ||
        // Modifica contenuti (Gestione post): solo l'autore, e se cambia la
        // destinazione deve restare valida (stessa regola della creazione:
        // pubblico richiede groupId nullo, gruppo richiede esserne membro) —
        // altrimenti un autore potrebbe spostare un post in un gruppo privato
        // di cui non fa parte semplicemente modificandolo dopo la creazione.
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(
           ['title', 'imageUrl', 'ingredients', 'steps', 'groupId', 'visibility']
         )
          && isSignedIn() && resource.data.authorId == request.auth.uid
          && (request.resource.data.visibility == 'public'
              ? request.resource.data.groupId == null
              : isGroupMember(request.resource.data.groupId)));

      // Eliminazione: solo l'autore. Le ricette brand non hanno authorId
      // (restano null), quindi non sono mai eliminabili dal client.
      allow delete: if isSignedIn() && resource.data.authorId == request.auth.uid;

      // Verifica se chi chiama può accedere alla ricetta "genitore" di
      // questa sotto-collezione: stessa logica della regola di lettura qui
      // sopra, riletta con get() perché qui {recipeId} è nel path, non nel
      // resource.data. get() sullo stesso path è messo in cache da Firestore
      // per tutta la valutazione della richiesta, quindi chiamarlo più volte
      // (nei tre rami sotto) non costa letture aggiuntive.
      function canAccessParentRecipe() {
        return isSignedIn() && (
          get(/databases/$(database)/documents/recipes/$(recipeId)).data.source == 'brand'
          || get(/databases/$(database)/documents/recipes/$(recipeId)).data.visibility == 'public'
          || (get(/databases/$(database)/documents/recipes/$(recipeId)).data.visibility == 'group'
              && request.auth.uid in get(/databases/$(database)/documents/groups/$(
                   get(/databases/$(database)/documents/recipes/$(recipeId)).data.groupId
                 )).data.memberIds)
          || get(/databases/$(database)/documents/recipes/$(recipeId)).data.authorId == request.auth.uid
        );
      }

      // --- REACTIONS (sotto-collezione) ---
      match /reactions/{authorId} {
        // Prima erano leggibili/scrivibili da chiunque a prescindere dal
        // post: per un post di un gruppo privato questo avrebbe reso le
        // reazioni (e chi le ha messe) visibili anche a chi non fa parte del
        // gruppo. Ora si applica la stessa regola di accesso del post.
        allow read: if canAccessParentRecipe();
        // L'id del documento DEVE combaciare con chi sta scrivendo.
        allow create, update: if canAccessParentRecipe() && request.auth.uid == authorId
                               && request.resource.data.type in ['cucinarlo', 'mangiarlo', 'nonMiPiace']
                               && request.resource.data.updatedAt is timestamp;
        allow delete: if isSignedIn() && request.auth.uid == authorId;
      }

      // --- COMMENTS (sotto-collezione) ---
      match /comments/{commentId} {
        // Stessa correzione di privacy della sotto-collezione reactions qui
        // sopra: i commenti di un post di gruppo privato erano leggibili e
        // scrivibili da chiunque, ora richiedono lo stesso accesso al post.
        allow read: if canAccessParentRecipe();
        allow create: if canAccessParentRecipe()
                      && request.resource.data.authorId == request.auth.uid
                      && request.resource.data.keys().hasAll(['text', 'authorNickname', 'authorId', 'createdAt'])
                      && request.resource.data.text is string
                      && request.resource.data.text.size() > 0
                      && request.resource.data.text.size() < 2000
                      && request.resource.data.authorNickname is string
                      && request.resource.data.createdAt is timestamp;
        allow update, delete: if false;
      }
    }
  }
}
```

- [ ] **Step 2: Aggiungere l'indice composito per il feed pubblico**

Sostituisci `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "recipes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "source", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "recipes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "source", "order": "ASCENDING" },
        { "fieldPath": "groupId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "recipes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "visibility", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 3: Deploy**

```bash
npx firebase deploy --only firestore:rules,firestore:indexes
```

Attendi che la console confermi il deploy delle regole (istantaneo) e che l'indice risulti "Building" poi "Enabled" nella Firebase Console → Firestore → Indexes (può richiedere qualche minuto).

- [ ] **Step 4: Verifica manuale**

Nella Firebase Console → Firestore → Rules, il testo mostrato deve combaciare col nuovo file. Nella tab Indexes deve comparire il terzo indice `visibility ASC, createdAt DESC` con stato "Enabled" prima di procedere al Task 11 (che lo userà).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules firestore.indexes.json
git commit -m "feat(auth): enforce real ownership and group privacy in security rules"
```

---

### Task 8: `ProfileDialog.vue` — profilo via Firestore + Esci + Elimina account

**Files:**
- Modify: `src/components/ProfileDialog.vue`

**Interfaces:**
- Consumes: `getUserId`, `getNickname`, `getBio`, `getAvatarPhoto`, `updateProfile`, `signOutUser`, `deleteAccount` da `@/identity.js` (Task 4).

- [ ] **Step 1: Sostituire il blocco `<script setup>`**

```js
import { ref, watch } from 'vue'
import { getUserId, getNickname, getBio, getAvatarPhoto, updateProfile, signOutUser, deleteAccount } from '@/identity.js'
import { avatarColor, avatarInitial } from '@/utils/avatar.js'
import { fileToCompressedDataUrl } from '@/utils/image.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const userId = getUserId()
const nickname = ref(getNickname())
const bio = ref(getBio())
const avatarPhoto = ref(getAvatarPhoto())
const imageError = ref('')
const fileInput = ref(null)
const saving = ref(false)
const deleting = ref(false)

watch(() => props.modelValue, (open) => {
  if (open) {
    nickname.value = getNickname()
    bio.value = getBio()
    avatarPhoto.value = getAvatarPhoto()
    imageError.value = ''
  }
})

async function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  imageError.value = ''
  try {
    avatarPhoto.value = await fileToCompressedDataUrl(file)
  } catch (err) {
    console.error('Errore nel caricare la foto profilo:', err)
    imageError.value = err.message || 'Errore nel caricare la foto.'
  } finally {
    e.target.value = ''
  }
}

function close() {
  emit('update:modelValue', false)
}

async function save() {
  if (!nickname.value.trim()) return
  saving.value = true
  try {
    await updateProfile({ nickname: nickname.value, bio: bio.value, avatarPhoto: avatarPhoto.value })
    close()
  } catch (err) {
    console.error('Errore nel salvare il profilo:', err)
  } finally {
    saving.value = false
  }
}

async function logout() {
  await signOutUser()
  close()
}

async function removeAccount() {
  if (!confirm('Eliminare definitivamente il tuo account? Non potrai annullare questa azione.')) return
  deleting.value = true
  try {
    await deleteAccount()
  } catch (err) {
    console.error('Errore nell\'eliminare l\'account:', err)
    deleting.value = false
  }
}
```

- [ ] **Step 2: Aggiungere Esci/Elimina account al template**

Nel `<template>`, subito dopo il blocco `<RouterLink to="/gestione-post" ...>` (dentro `<v-card-text>`, prima della sua chiusura), aggiungi:

```html
        <div class="uc-account-actions">
          <button type="button" class="uc-account-btn" @click="logout">
            <v-icon icon="mdi-logout" size="18" />
            Esci
          </button>
          <button type="button" class="uc-account-btn uc-account-btn--danger" :disabled="deleting" @click="removeAccount">
            <v-icon icon="mdi-account-remove-outline" size="18" />
            {{ deleting ? 'Eliminazione...' : 'Elimina account' }}
          </button>
        </div>
```

- [ ] **Step 3: Aggiungere lo stile corrispondente**

Nel blocco `<style scoped>`, aggiungi (riusa la stessa palette "danger" già definita in `GroupDetailsView.vue`):

```css
.uc-account-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.uc-account-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--uc-bg);
  border: none;
  color: var(--uc-text);
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.uc-account-btn--danger {
  color: var(--uc-delete-fg);
  background: var(--uc-delete-bg);
}

.uc-account-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
```

- [ ] **Step 4: Verifica manuale**

1. Accedi all'app, apri il profilo (icona in alto a destra), cambia nickname/bio/foto → Salva. Ricarica la pagina: le modifiche persistono (lette da Firestore, non più da `localStorage`).
2. Riapri il profilo, tocca "Esci". Atteso: torni alla schermata di login (`AuthView`).
3. Accedi di nuovo con le stesse credenziali, apri il profilo, tocca "Elimina account", conferma. Atteso: torni alla schermata di login; in Firebase Console → Authentication l'utente non compare più, e `users/{quel-uid}` non esiste più su Firestore.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProfileDialog.vue
git commit -m "feat(auth): edit profile via Firestore, add sign out and account deletion"
```

---

### Task 9: `GroupsView.vue` + `GroupDetailsView.vue` — `await` sulle mutazioni profilo

**Files:**
- Modify: `src/views/GroupsView.vue`
- Modify: `src/views/GroupDetailsView.vue`

**Interfaces:**
- Consumes: `getUserId`, `getNickname`, `getJoinedGroupIds` (invariate, sincrone), `addJoinedGroupId`, `removeJoinedGroupId` (ora **asincrone**) da `@/identity.js` (Task 4).

- [ ] **Step 1: `GroupsView.vue` — rendere asincrone le due chiamate a `addJoinedGroupId`**

In `createGroup()`, la riga:
```js
addJoinedGroupId(docRef.id)
```
diventa:
```js
await addJoinedGroupId(docRef.id)
```

In `joinGroup()`, la riga:
```js
addJoinedGroupId(groupDoc.id)
```
diventa:
```js
await addJoinedGroupId(groupDoc.id)
```

Nessun altro cambiamento in questo file: `getUserId()`/`getNickname()` restano sincrone e funzionano identiche a prima (ora restituiscono dati reali invece che da `localStorage`).

- [ ] **Step 2: `GroupDetailsView.vue` — rendere asincrona la chiamata a `removeJoinedGroupId`**

In `leaveGroup()`, la riga:
```js
removeJoinedGroupId(props.groupId)
```
diventa:
```js
await removeJoinedGroupId(props.groupId)
```

Nessun altro cambiamento: `getUserId()` resta sincrona, `isAdmin`/`members` computed restano identici (ora confrontano uid reali).

- [ ] **Step 3: Verifica manuale**

1. Crea un nuovo gruppo dalla tab "Crea gruppo": compare subito nella lista "I tuoi gruppi", e in Firestore `groups/{id}.memberIds` contiene il tuo uid reale.
2. Con un secondo account (altra finestra in incognito, registrati con un'altra email), unisciti al gruppo con il codice invito: compare nella sua lista gruppi.
3. Da "Dettagli gruppo", il creatore vede il badge "Amministratore" sul primo account e può espellere il secondo membro; il secondo membro può "Lascia gruppo" da solo. Dopo ogni azione, `groups/{id}.memberIds` su Firestore riflette il cambiamento.

- [ ] **Step 4: Commit**

```bash
git add src/views/GroupsView.vue src/views/GroupDetailsView.vue
git commit -m "feat(auth): await now-async profile mutations in group flows"
```

---

### Task 10: `NewRecipeView.vue` — destinazione "Pubblico" + `visibility` + `authorId`

**Files:**
- Modify: `src/views/NewRecipeView.vue`

**Interfaces:**
- Consumes: `getUserId`, `getNickname`, `getJoinedGroupIds` da `@/identity.js` (invariate).
- Produces: scrive/legge `recipes.authorId` (rinominato da `authorLocalId`) e il nuovo campo `recipes.visibility`, consumati da `FeedView.vue` (Task 11), `RecipeCard.vue`/`CommentList.vue` (Task 12), `PostManagementView.vue`/`MemberView.vue` (Task 13), e dalle regole del Task 7.

- [ ] **Step 1: Rimuovere il blocco che nasconde il form senza gruppi**

Nel `<template>`, elimina questo blocco (con "Pubblico" sempre disponibile, non serve più bloccare il form):
```html
    <v-alert v-if="!myGroups.length" type="warning" variant="tonal" class="mb-4">
      Devi far parte di almeno un gruppo per pubblicare una ricetta.
      <RouterLink to="/gruppi">Vai a Gruppi</RouterLink>.
    </v-alert>

    <form v-else class="uc-form" @submit.prevent="submit">
```
e la sua chiusura `</form>` resta, ma il tag apertura form diventa semplicemente:
```html
    <form class="uc-form" @submit.prevent="submit">
```
(cioè: il form si vede sempre, non più condizionato da `myGroups.length`).

- [ ] **Step 2: Aggiornare il `v-select` della destinazione**

Sostituisci:
```html
      <div>
        <p class="uc-label">Destinazione</p>
        <v-select
          v-model="groupId"
          :items="myGroups"
          item-title="name"
          item-value="id"
          variant="outlined"
          density="comfortable"
          hide-details
        />
      </div>
```
con:
```html
      <div>
        <p class="uc-label">Destinazione</p>
        <v-select
          v-model="destination"
          :items="destinationItems"
          item-title="name"
          item-value="id"
          variant="outlined"
          density="comfortable"
          hide-details
        />
      </div>
```

- [ ] **Step 3: Aggiornare il pulsante di invio**

```html
      <v-btn
        type="submit"
        variant="flat"
        color="secondary"
        size="large"
        class="uc-pill-btn"
        :loading="saving"
        :disabled="!title.trim() || !destination"
      >
        {{ editingId ? 'Salva modifiche' : 'Pubblica' }}
      </v-btn>
```

- [ ] **Step 4: Sostituire tutto il blocco `<script setup>`**

```js
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  collection, addDoc, updateDoc, doc, getDoc,
  query, where, getDocs, documentId, serverTimestamp
} from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId, getNickname, getJoinedGroupIds } from '@/identity.js'
import { fileToCompressedDataUrl } from '@/utils/image.js'

const PUBLIC_OPTION = { id: '__public__', name: 'Pubblico (visibile a tutti)' }

const router = useRouter()
const route = useRoute()

const myGroups = ref([])
const destination = ref(PUBLIC_OPTION.id)
const title = ref('')
const imageUrl = ref('')
const imageError = ref('')
const ingredientsRaw = ref('')
const stepsRaw = ref('')
const saving = ref(false)
const fileInput = ref(null)
const editingId = ref(route.query.edit || null)

const destinationItems = computed(() => [PUBLIC_OPTION, ...myGroups.value])

onMounted(async () => {
  const ids = getJoinedGroupIds().slice(0, 10) // limite della clausola 'in' di Firestore
  if (ids.length) {
    const snap = await getDocs(query(collection(db, 'groups'), where(documentId(), 'in', ids)))
    myGroups.value = snap.docs.map((d) => ({ id: d.id, name: d.data().name }))
  }

  if (editingId.value) {
    const snapRecipe = await getDoc(doc(db, 'recipes', editingId.value))
    if (snapRecipe.exists()) {
      const r = snapRecipe.data()
      title.value = r.title || ''
      imageUrl.value = r.imageUrl || ''
      ingredientsRaw.value = (r.ingredients || []).join('\n')
      stepsRaw.value = (r.steps || []).join('\n')
      destination.value = r.visibility === 'public' ? PUBLIC_OPTION.id : r.groupId
    }
    return
  }

  const preselected = route.query.groupId
  if (preselected && myGroups.value.some((g) => g.id === preselected)) {
    destination.value = preselected
  }
})

async function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  imageError.value = ''
  try {
    imageUrl.value = await fileToCompressedDataUrl(file)
  } catch (err) {
    console.error('Errore nel caricare la foto:', err)
    imageError.value = err.message || 'Errore nel caricare la foto.'
  } finally {
    e.target.value = ''
  }
}

async function submit() {
  if (!title.value.trim() || !destination.value) return
  saving.value = true
  try {
    const isPublic = destination.value === PUBLIC_OPTION.id
    const content = {
      title: title.value.trim(),
      imageUrl: imageUrl.value || null,
      ingredients: ingredientsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean),
      steps: stepsRaw.value.split('\n').map((s) => s.trim()).filter(Boolean),
      visibility: isPublic ? 'public' : 'group',
      groupId: isPublic ? null : destination.value
    }
    if (editingId.value) {
      await updateDoc(doc(db, 'recipes', editingId.value), content)
      router.push(`/ricetta/${editingId.value}`)
    } else {
      const docRef = await addDoc(collection(db, 'recipes'), {
        ...content,
        source: 'group',
        brandName: null,
        authorNickname: getNickname() || 'Anonimo',
        authorId: getUserId(),
        reactionCounts: { cucinarlo: 0, mangiarlo: 0, nonMiPiace: 0 },
        createdAt: serverTimestamp()
      })
      router.push(`/ricetta/${docRef.id}`)
    }
  } catch (err) {
    console.error('Errore nel pubblicare la ricetta:', err)
  } finally {
    saving.value = false
  }
}
</script>
```

(Il tag di chiusura `</script>` sopra è quello già presente nel file: stai sostituendo solo il contenuto tra `<script setup>` e `</script>`.)

- [ ] **Step 5: Verifica manuale**

1. Da "Nuova ricetta" senza far parte di nessun gruppo: il form è comunque visibile, la destinazione di default è "Pubblico". Pubblica: la ricetta compare in Firestore con `visibility: 'public'`, `groupId: null`, `authorId: <tuo uid>`.
2. Unisciti a un gruppo, crea una ricetta scegliendolo come destinazione: `visibility: 'group'`, `groupId` valorizzato.
3. Modifica una ricetta tua esistente (link "Modifica" da Gestione post, Task 13): il `v-select` preseleziona correttamente "Pubblico" o il gruppo giusto.

- [ ] **Step 6: Commit**

```bash
git add src/views/NewRecipeView.vue
git commit -m "feat(auth): add public destination and rename authorLocalId to authorId"
```

---

### Task 11: `FeedView.vue` — includere i post pubblici

**Files:**
- Modify: `src/views/FeedView.vue`

**Interfaces:**
- Consumes: indice composito `visibility ASC, createdAt DESC` (Task 7, deve già essere "Enabled").

- [ ] **Step 1: Aggiungere il ref e la query per i post pubblici**

Dopo la riga `const groupRecipes = ref([])`, aggiungi:
```js
const publicRecipes = ref([])
```

- [ ] **Step 2: Aggiornare il merge in `recipes` (computed)**

Sostituisci:
```js
  const merged = [
    ...brandRecipes.value,
    ...groupRecipes.value.map((r) => ({ ...r, groupName: groupNamesById.value[r.groupId] || '' }))
  ]
```
con:
```js
  const merged = [
    ...brandRecipes.value,
    ...publicRecipes.value,
    ...groupRecipes.value.map((r) => ({ ...r, groupName: groupNamesById.value[r.groupId] || '' }))
  ]
```

- [ ] **Step 3: Caricare i post pubblici in `loadHomeFeed()`**

Subito dopo il blocco che carica `brandRecipes.value` (dopo `brandRecipes.value = brandSnap.docs.map(...)`), aggiungi:
```js
    // 1b. Ricette di gruppo pubblicate come "Pubblico": visibili a tutti
    // come le ricette brand, ma scritte da utenti reali.
    const publicQuery = query(
      collection(db, 'recipes'),
      where('visibility', '==', 'public'),
      orderBy('createdAt', 'desc')
    )
    const publicSnap = await getDocs(publicQuery)
    publicRecipes.value = publicSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
```

- [ ] **Step 4: Verifica manuale**

1. Pubblica una ricetta con destinazione "Pubblico" (da un account, vedi Task 10).
2. Con un secondo account (che NON fa parte di nessun gruppo in comune col primo), apri il Feed home: la ricetta pubblica del primo account compare comunque.
3. Pubblica una ricetta di gruppo (destinazione = un gruppo specifico) col primo account: il secondo account, se non è membro di quel gruppo, NON la vede nel feed home, e se prova ad aprirla direttamente via URL (`/ricetta/<id>`) ottiene un errore di permessi (le regole del Task 7 bloccano la lettura) — verificabile nella console del browser (`FirebaseError: Missing or insufficient permissions`).

- [ ] **Step 5: Commit**

```bash
git add src/views/FeedView.vue
git commit -m "feat(auth): show public group posts in the home feed"
```

---

### Task 12: `RecipeCard.vue` + `CommentList.vue` — `authorId`

**Files:**
- Modify: `src/components/RecipeCard.vue`
- Modify: `src/components/CommentList.vue`

**Interfaces:**
- Consumes: `recipe.authorId` (rinominato, Task 10), `toggleSavedRecipeId` da `@/identity.js` (ora asincrona).
- Nota: `src/components/ReactionBar.vue` **non** viene toccato — usa solo `getUserId()` (invariata) come id del documento reazione, nessun campo `authorLocalId` coinvolto.

- [ ] **Step 1: `RecipeCard.vue` — rinominare `authorLocalId` in `authorId` (3 punti)**

Nel `<template>`, sostituisci:
```html
      <div v-else class="uc-avatar" :style="{ background: avatarColor(recipe.authorLocalId || recipe.authorNickname) }">
```
con:
```html
      <div v-else class="uc-avatar" :style="{ background: avatarColor(recipe.authorId || recipe.authorNickname) }">
```

Sostituisci:
```html
        <RouterLink
          v-if="recipe.authorLocalId"
          :to="{ path: `/membro/${recipe.authorLocalId}`, query: { nickname: recipe.authorNickname } }"
          class="uc-card-author"
        >
```
con:
```html
        <RouterLink
          v-if="recipe.authorId"
          :to="{ path: `/membro/${recipe.authorId}`, query: { nickname: recipe.authorNickname } }"
          class="uc-card-author"
        >
```

Nello `<script setup>`, sostituisci:
```js
const myAvatarPhoto = computed(() => {
  return props.recipe.authorLocalId === getUserId() ? getAvatarPhoto() : ''
})
```
con:
```js
const myAvatarPhoto = computed(() => {
  return props.recipe.authorId === getUserId() ? getAvatarPhoto() : ''
})
```

- [ ] **Step 2: `RecipeCard.vue` — rendere asincrono `toggleSave`**

Sostituisci:
```js
function toggleSave() {
  saved.value = toggleSavedRecipeId(props.recipe.id)
}
```
con:
```js
async function toggleSave() {
  saved.value = await toggleSavedRecipeId(props.recipe.id)
}
```

- [ ] **Step 3: `CommentList.vue` — rinominare `authorLocalId` in `authorId`**

Sostituisci:
```js
    const authorLocalId = getUserId()
    const authorNickname = getNickname() || 'Anonimo'
    const docRef = await addDoc(commentsRef, {
      text,
      authorLocalId,
      authorNickname,
      createdAt: serverTimestamp()
    })
    comments.value.push({ id: docRef.id, text, authorLocalId, authorNickname })
```
con:
```js
    const authorId = getUserId()
    const authorNickname = getNickname() || 'Anonimo'
    const docRef = await addDoc(commentsRef, {
      text,
      authorId,
      authorNickname,
      createdAt: serverTimestamp()
    })
    comments.value.push({ id: docRef.id, text, authorId, authorNickname })
```

- [ ] **Step 4: Verifica manuale**

1. Nel feed, apri una ricetta di un altro account (secondo account di test): il nickname è cliccabile e porta a `/membro/<uid>`.
2. Sulla tua stessa ricetta, il tuo nome NON è un link (comportamento invariato, `authorId` combacia col tuo uid ma la card mostra comunque il link se `authorId` è presente — verifica solo che il link porti al profilo corretto, non che sparisca).
3. Salva/de-salva una ricetta con l'icona segnalibro: lo stato persiste dopo un reload (letto da `users/{uid}.savedRecipeIds` invece che da `localStorage`).
4. Scrivi un commento: compare subito nella lista; ricarica la pagina, il commento è ancora lì con `authorId` corretto (verifica in Firestore Console).

- [ ] **Step 5: Commit**

```bash
git add src/components/RecipeCard.vue src/components/CommentList.vue
git commit -m "feat(auth): rename authorLocalId to authorId in card and comments"
```

---

### Task 13: `PostManagementView.vue` + `MemberView.vue` — `authorId` + nickname reale

**Files:**
- Modify: `src/views/PostManagementView.vue`
- Modify: `src/views/MemberView.vue`

**Interfaces:**
- Consumes: `resolveNickname(uid)` (nuova, Task 4) al posto della vecchia euristica "nickname dall'ultimo post".

- [ ] **Step 1: `PostManagementView.vue` — rinominare il campo nella query**

Sostituisci:
```js
async function loadMine() {
  loadingMine.value = true
  const q = query(collection(db, 'recipes'), where('authorLocalId', '==', getUserId()))
```
con:
```js
async function loadMine() {
  loadingMine.value = true
  const q = query(collection(db, 'recipes'), where('authorId', '==', getUserId()))
```

Nessun altro cambiamento in questo file: `getUserId()` e `getSavedRecipeIds()` restano sincrone e invariate.

- [ ] **Step 2: `MemberView.vue` — query + risoluzione nickname reale**

Sostituisci tutto il blocco `<script setup>`:
```js
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/firebase.js'
import { getUserId, getAvatarPhoto, resolveNickname } from '@/identity.js'
import { avatarColor, avatarInitial } from '@/utils/avatar.js'

const props = defineProps({
  memberId: { type: String, required: true }
})

const route = useRoute()
const posts = ref([])
const loading = ref(true)
const nickname = ref(route.query.nickname || 'Utente')

const isMe = computed(() => props.memberId === getUserId())
const avatarPhoto = computed(() => (isMe.value ? getAvatarPhoto() : ''))
const displayNickname = computed(() => nickname.value)

onMounted(async () => {
  // Il vero profilo esiste sempre ora (users/{uid}): niente più bisogno di
  // indovinare il nickname dall'ultimo post pubblicato.
  resolveNickname(props.memberId).then((n) => { nickname.value = n })

  const q = query(collection(db, 'recipes'), where('authorId', '==', props.memberId))
  const snap = await getDocs(q)
  posts.value = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
  loading.value = false
})

function formatDate(ts) {
  const date = ts?.toDate ? ts.toDate() : null
  if (!date) return ''
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
}
```

- [ ] **Step 3: Verifica manuale**

1. Vai su `/membro/<uid-di-un-account-senza-post>` (es. un account appena creato che non ha ancora pubblicato nulla): il nickname mostrato è quello vero del profilo (non più "Utente" per mancanza di post) — questo è il bug che la vecchia euristica aveva e che ora è risolto.
2. "I miei post" in Gestione post mostra correttamente solo i tuoi post (query su `authorId`).

- [ ] **Step 4: Commit**

```bash
git add src/views/PostManagementView.vue src/views/MemberView.vue
git commit -m "feat(auth): rename authorLocalId to authorId, resolve real nickname"
```

---

### Task 14: `scripts/reset-test-data.mjs` — pulizia dati di test

**Files:**
- Create: `scripts/reset-test-data.mjs`

**Interfaces:**
- Consumes: `scripts/serviceAccountKey.json` (Admin SDK, già usato da `scripts/import-brand-recipes.mjs`, stesso pattern).

- [ ] **Step 1: Scrivere lo script**

```js
// Script una tantum (Admin SDK, bypassa le security rules): svuota i dati
// di test creati durante lo sviluppo prima del lancio reale. Cancella
// TUTTI i documenti di `groups` e le ricette con source:'group' (con le
// loro sottocollezioni reactions/comments). Le ricette source:'brand'
// NON vengono toccate.
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'

const serviceAccount = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

async function deleteSubcollection(docRef, subcollectionName) {
  const snap = await docRef.collection(subcollectionName).get()
  await Promise.all(snap.docs.map((d) => d.ref.delete()))
}

async function resetGroupRecipes() {
  const snap = await db.collection('recipes').where('source', '==', 'group').get()
  for (const doc of snap.docs) {
    await deleteSubcollection(doc.ref, 'reactions')
    await deleteSubcollection(doc.ref, 'comments')
    await doc.ref.delete()
  }
  console.log(`Cancellate ${snap.size} ricette di gruppo (+ reazioni/commenti).`)
}

async function resetGroups() {
  const snap = await db.collection('groups').get()
  await Promise.all(snap.docs.map((d) => d.ref.delete()))
  console.log(`Cancellati ${snap.size} gruppi.`)
}

async function main() {
  await resetGroupRecipes()
  await resetGroups()
  console.log('Reset completato. Le ricette source:"brand" non sono state toccate.')
}

main().catch((err) => {
  console.error('Errore nel reset:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Aggiungere lo script a `package.json`**

In `package.json`, dentro `"scripts"`, aggiungi (dopo `"import-brand-recipes"`):
```json
    "reset-test-data": "node scripts/reset-test-data.mjs"
```

- [ ] **Step 3: Eseguirlo (azione manuale, quando si è pronti a "svuotare" prima del lancio reale — NON eseguirlo ancora se si vuole continuare a testare con i gruppi/ricette creati durante lo sviluppo di questo piano)**

```bash
npm run reset-test-data
```

- [ ] **Step 4: Verifica manuale**

Dopo l'esecuzione, in Firestore Console: `groups` è vuota, `recipes` contiene solo documenti con `source:'brand'`.

- [ ] **Step 5: Commit**

```bash
git add scripts/reset-test-data.mjs package.json
git commit -m "feat(auth): add one-time script to reset test data before launch"
```

---

### Task 15: Verifica end-to-end manuale

**Files:** nessuno (solo verifica).

- [ ] **Step 1: Percorso completo con due account**

Con `npm run dev` acceso e due account di test (finestra normale + incognito):

1. Registrazione email/password su entrambi gli account, scelta nickname.
2. Reload pagina su entrambi: sessione persiste, niente re-login.
3. Account A crea un gruppo, si segna il codice invito.
4. Account B si unisce col codice.
5. Account A pubblica una ricetta destinata al gruppo: compare nel feed del gruppo per entrambi gli account, ma NON nel feed home di un terzo account (o dello stesso A/B fuori dal gruppo) né è raggiungibile via URL diretto da un account non membro (permission-denied atteso).
6. Account A pubblica una ricetta "Pubblico": compare nel feed home di **entrambi**, anche per un account che non è nel gruppo.
7. Account B reagisce e commenta sulla ricetta di gruppo di A; il conteggio reazioni e il commento sono corretti e persistono dopo reload.
8. Account A modifica ed elimina un proprio post da "Gestione post"; verifica che account B **non veda** pulsanti di modifica/eliminazione sui post di A.
9. Account B tenta (via console browser, chiamando direttamente `updateDoc`/`deleteDoc` su un ID di post di A) di modificare/eliminare un post di A: atteso `permission-denied`.
10. Account A espelle Account B dal gruppo (da Dettagli gruppo); Account B non vede più i post di quel gruppo nel proprio feed.
11. Account B elimina il proprio account dal profilo; verifica sparizione da Firebase Auth + Firestore `users/{uid}`.

- [ ] **Step 2: Login sociale (se già configurato in Console, Task 1)**

Se Google è abilitato: "Continua con Google" apre il popup, completa il login, crea `users/{uid}` al primo accesso. Se Apple non è ancora configurato (manca l'Apple Developer Program), verifica solo che il pulsante mostri un errore leggibile invece di rompere l'app.

- [ ] **Step 3: Nessun'azione da fare se tutto passa — questo task è puramente di verifica, senza commit.**
