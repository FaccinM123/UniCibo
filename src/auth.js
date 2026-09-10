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
