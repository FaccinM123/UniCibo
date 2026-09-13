// Facciata identità: combina la sessione Firebase Auth (src/auth.js) e il
// profilo Firestore (src/services/userProfile.js). Sostituisce la vecchia
// identità "leggera" basata solo su localStorage. Le view continuano a
// importare da qui, così il diff nei consumatori resta minimo.
import { ref, computed, watch } from 'vue'
import {
  authUser, authReady, redirectSignInError, isIosStandalone,
  signUpWithEmail, signInWithEmail, signInWithGoogle, signInWithApple,
  signOutUser, resetPassword, deleteAuthAccount
} from '@/auth.js'
import {
  profile, savedRecipeIds, loadUserProfile, createUserProfile, getUserProfileById,
  updateOwnProfile,
  addJoinedGroupId as addJoinedGroupIdOnProfile,
  removeJoinedGroupId as removeJoinedGroupIdFromProfile,
  toggleSavedRecipeId as toggleSavedRecipeIdOnProfile,
  deleteUserProfile
} from '@/services/userProfile.js'

export { authUser, authReady, profile, redirectSignInError, isIosStandalone }
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
    savedRecipeIds.value = []
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
  return savedRecipeIds.value || []
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

// Risolve nickname + bio di un QUALSIASI utente (non solo il proprio)
// leggendo il suo users/{uid} in un'unica lettura — sostituisce la vecchia
// euristica "prendi il nickname dall'ultimo post pubblicato", ora che un
// vero profilo esiste sempre.
export async function resolveProfile(uid) {
  const p = await getUserProfileById(uid)
  return { nickname: p?.nickname || 'Utente', bio: p?.bio || '' }
}

export async function deleteAccount() {
  const uid = authUser.value?.uid
  if (!uid) return
  await deleteUserProfile(uid)
  await deleteAuthAccount()
}
