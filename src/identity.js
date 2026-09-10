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

// Backward compatibility: deprecated functions from the old localStorage-based API.
// These are now async and delegate to updateProfile. Consumers should migrate
// to using updateProfile/completeNickname instead. These exist only to allow a
// gradual transition where later tasks can update consumers incrementally.

export function hasIdentity() {
  return !!getNickname()
}

export async function setNickname(nickname) {
  // Calling consumers don't await this, but we need it async for Firestore.
  return updateProfile({
    nickname,
    bio: profile.value?.bio || '',
    avatarPhoto: profile.value?.avatarPhoto || ''
  })
}

export async function setBio(bio) {
  return updateProfile({
    nickname: profile.value?.nickname || '',
    bio,
    avatarPhoto: profile.value?.avatarPhoto || ''
  })
}

export async function setAvatarPhoto(avatarPhoto) {
  return updateProfile({
    nickname: profile.value?.nickname || '',
    bio: profile.value?.bio || '',
    avatarPhoto
  })
}
