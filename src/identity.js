// Identità "leggera": nickname + id anonimo + gruppi a cui si è aderito,
// salvati in localStorage. NON è autenticazione vera: è un limite consapevole
// del progetto, dichiarato esplicitamente nella documentazione (vedi
// firestore.rules). Chiunque acceda al localStorage del browser può
// impersonare l'utente: per un'app reale servirebbe Firebase Auth (anche solo
// anonima) + regole Firestore basate su request.auth.uid.

const NICKNAME_KEY = 'unicibo_nickname'
const USER_ID_KEY = 'unicibo_user_id'
const JOINED_GROUPS_KEY = 'unicibo_joined_group_ids'
const BIO_KEY = 'unicibo_bio'
const AVATAR_PHOTO_KEY = 'unicibo_avatar_photo'
const SAVED_RECIPES_KEY = 'unicibo_saved_recipe_ids'

export function getUserId() {
  let id = localStorage.getItem(USER_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(USER_ID_KEY, id)
  }
  return id
}

export function getNickname() {
  return localStorage.getItem(NICKNAME_KEY) || ''
}

export function setNickname(nickname) {
  localStorage.setItem(NICKNAME_KEY, nickname.trim())
}

export function hasIdentity() {
  return !!getNickname()
}

export function getJoinedGroupIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(JOINED_GROUPS_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

export function addJoinedGroupId(groupId) {
  const current = getJoinedGroupIds()
  if (!current.includes(groupId)) {
    localStorage.setItem(JOINED_GROUPS_KEY, JSON.stringify([...current, groupId]))
  }
}

export function removeJoinedGroupId(groupId) {
  const current = getJoinedGroupIds()
  localStorage.setItem(JOINED_GROUPS_KEY, JSON.stringify(current.filter((id) => id !== groupId)))
}

// Bio e foto profilo: NON fanno parte dello schema Firestore (niente
// collezione "users" prevista) e restano solo su questo dispositivo. Non
// vengono quindi viste da altri utenti/dispositivi sui post pubblicati: è un
// limite dichiarato, coerente con l'identità leggera del progetto.

export function getBio() {
  return localStorage.getItem(BIO_KEY) || ''
}

export function setBio(bio) {
  localStorage.setItem(BIO_KEY, bio.trim())
}

export function getAvatarPhoto() {
  return localStorage.getItem(AVATAR_PHOTO_KEY) || ''
}

export function setAvatarPhoto(dataUrl) {
  if (dataUrl) {
    localStorage.setItem(AVATAR_PHOTO_KEY, dataUrl)
  } else {
    localStorage.removeItem(AVATAR_PHOTO_KEY)
  }
}

// Post salvati: come bio/foto, restano solo su questo dispositivo. È una
// lista puramente personale (nessuno vede cosa hai salvato), quindi non ha
// bisogno di stare su Firestore.

export function getSavedRecipeIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_RECIPES_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

export function isRecipeSaved(recipeId) {
  return getSavedRecipeIds().includes(recipeId)
}

export function toggleSavedRecipeId(recipeId) {
  const current = getSavedRecipeIds()
  const next = current.includes(recipeId)
    ? current.filter((id) => id !== recipeId)
    : [...current, recipeId]
  localStorage.setItem(SAVED_RECIPES_KEY, JSON.stringify(next))
  return next.includes(recipeId)
}
