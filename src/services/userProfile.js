// users/{uid}: profilo Firestore che sostituisce localStorage (nickname,
// bio, foto profilo, gruppi a cui si è aderito). Letture/scritture singole
// (niente onSnapshot, stesso pattern già in uso nel resto dell'app): dopo
// ogni scrittura aggiorniamo `profile` a mano.
//
// savedRecipeIds vive invece in users/{uid}/private/data, una sotto-
// collezione leggibile SOLO dal proprietario (vedi firestore.rules) — a
// differenza del documento profilo sopra, leggibile da chiunque sia loggato
// (serve per mostrare nickname/avatar ovunque nell'app). Firestore non ha
// sicurezza a livello di singolo campo dentro un documento, quindi era
// l'unico modo per tenere i post salvati privati senza nascondere anche
// nickname/avatar a tutti gli altri.
import { ref } from 'vue'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { db } from '@/firebase.js'

export const profile = ref(null)
export const savedRecipeIds = ref([])

function profileRef(uid) {
  return doc(db, 'users', uid)
}

function privateRef(uid) {
  return doc(db, 'users', uid, 'private', 'data')
}

export async function loadUserProfile(uid) {
  const [snap, privateSnap] = await Promise.all([getDoc(profileRef(uid)), getDoc(privateRef(uid))])
  profile.value = snap.exists() ? { id: snap.id, ...snap.data() } : null
  savedRecipeIds.value = privateSnap.exists() ? (privateSnap.data().savedRecipeIds || []) : []
  return profile.value
}

export async function createUserProfile(uid, nickname) {
  const data = {
    nickname: nickname.trim(),
    bio: '',
    avatarPhoto: '',
    joinedGroupIds: [],
    createdAt: new Date()
  }
  await Promise.all([
    setDoc(profileRef(uid), data),
    setDoc(privateRef(uid), { savedRecipeIds: [] })
  ])
  profile.value = { id: uid, ...data }
  savedRecipeIds.value = []
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
  const current = savedRecipeIds.value || []
  const isSaved = current.includes(recipeId)
  // setDoc+merge, non updateDoc: il documento privato potrebbe non esistere
  // ancora per un profilo creato prima di questa sotto-collezione.
  if (isSaved) {
    await setDoc(privateRef(uid), { savedRecipeIds: arrayRemove(recipeId) }, { merge: true })
    savedRecipeIds.value = current.filter((id) => id !== recipeId)
  } else {
    await setDoc(privateRef(uid), { savedRecipeIds: arrayUnion(recipeId) }, { merge: true })
    savedRecipeIds.value = [...current, recipeId]
  }
  return !isSaved
}

export async function deleteUserProfile(uid) {
  await Promise.all([
    deleteDoc(profileRef(uid)),
    deleteDoc(privateRef(uid))
  ])
  profile.value = null
  savedRecipeIds.value = []
}
