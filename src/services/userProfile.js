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
