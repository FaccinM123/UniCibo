// Wrapper attorno a Firebase Auth: stato reattivo della sessione + azioni.
// Nessun dato di profilo qui (nickname/bio/...): quello vive in
// src/services/userProfile.js, questo modulo si occupa solo di "chi sei".
import { ref } from 'vue'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential,
  signOut, sendPasswordResetEmail, deleteUser,
  setPersistence, browserLocalPersistence, browserSessionPersistence
} from 'firebase/auth'
import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
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

// iOS "Aggiungi a Home" (PWA standalone): niente vero window.open, quindi
// signInWithPopup resta bloccato a metà (la promise non si risolve mai —
// il pulsante sembra "impallato"). signInWithRedirect NON risolve il
// problema su iOS: la navigazione verso Google esce dal contenitore
// standalone in una scheda Safari separata che poi non torna in modo
// affidabile dentro l'app (verificato dal vivo — la pagina "si chiude" senza
// mai completare l'accesso). Qui distinguiamo quindi due casi:
// - iOS standalone: niente redirect in-app, i pulsanti Google/Apple vengono
//   sostituiti in AuthView.vue con l'indicazione di aprire il sito in Safari
//   (dove popup/redirect funzionano normalmente); la sessione risultante è
//   comunque condivisa con l'app installata, essendo lo stesso dominio.
// - Altri contesti standalone (Android/desktop, dove il redirect funziona
//   regolarmente): usiamo signInWithRedirect come prima.
export function isIosStandalone() {
  return window.navigator.standalone === true
}

function shouldUseRedirect() {
  return !isIosStandalone() && window.matchMedia('(display-mode: standalone)').matches
}

export const redirectSignInError = ref('')

getRedirectResult(auth).catch((err) => {
  console.error('Errore nel completare il redirect di accesso:', err)
  redirectSignInError.value = err.message || 'Errore di accesso, riprova.'
})

// "Resta connesso": true salva la sessione in locale (sopravvive alla
// chiusura del browser), false la tiene solo per la scheda corrente
// (sparisce chiudendo il browser) — utile su un computer condiviso.
async function applyPersistence(rememberMe) {
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence)
}

export async function signUpWithEmail(email, password, rememberMe = true) {
  await applyPersistence(rememberMe)
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  return cred.user
}

export async function signInWithEmail(email, password, rememberMe = true) {
  await applyPersistence(rememberMe)
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user
}

// Dentro l'app nativa (Capacitor/Android) non esiste una vera finestra
// popup: signInWithPopup/signInWithRedirect perdono lo stato della sessione
// nel WebView e falliscono con "missing initial state". Usiamo invece
// @capacitor-firebase/authentication, che apre la UI di accesso nativa
// (Google/Apple) e restituisce un id token — lo passiamo poi a
// signInWithCredential per far entrare quella sessione nell'SDK web di
// Firebase Auth usato dal resto dell'app, così authUser/onAuthStateChanged
// continuano a funzionare invariati sia su web che nell'app nativa.
export async function signInWithGoogle(rememberMe = true) {
  if (Capacitor.isNativePlatform()) {
    await applyPersistence(rememberMe)
    const result = await FirebaseAuthentication.signInWithGoogle()
    const credential = GoogleAuthProvider.credential(result.credential?.idToken)
    const cred = await signInWithCredential(auth, credential)
    return cred.user
  }
  if (shouldUseRedirect()) {
    await applyPersistence(rememberMe)
    await signInWithRedirect(auth, new GoogleAuthProvider())
    return null // la pagina sta per ricaricarsi verso Google
  }
  // Popup: NIENTE await prima di questa chiamata. Safari collega la finestra
  // popup al gesto dell'utente solo se window.open (dentro signInWithPopup)
  // parte in modo sincrono dal click — un solo await prima (es. su
  // applyPersistence) rompe quel collegamento e il popup viene bloccato
  // (auth/popup-blocked, verificato dal vivo). browserLocalPersistence è già
  // il default di Firebase Auth, quindi non serve attenderlo quando
  // rememberMe è true; lo si applica comunque, solo senza bloccare il popup.
  applyPersistence(rememberMe)
  const cred = await signInWithPopup(auth, new GoogleAuthProvider())
  return cred.user
}

export async function signInWithApple(rememberMe = true) {
  if (Capacitor.isNativePlatform()) {
    await applyPersistence(rememberMe)
    const result = await FirebaseAuthentication.signInWithApple()
    const provider = new OAuthProvider('apple.com')
    const credential = provider.credential({
      idToken: result.credential?.idToken,
      rawNonce: result.credential?.nonce
    })
    const cred = await signInWithCredential(auth, credential)
    return cred.user
  }
  if (shouldUseRedirect()) {
    await applyPersistence(rememberMe)
    await signInWithRedirect(auth, new OAuthProvider('apple.com'))
    return null // la pagina sta per ricaricarsi verso Apple
  }
  applyPersistence(rememberMe) // vedi commento sopra in signInWithGoogle
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
