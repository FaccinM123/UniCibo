// Identità "leggera": nickname + id anonimo + gruppi a cui si è aderito,
// salvati in localStorage. NON è autenticazione vera: è un limite consapevole
// del progetto, dichiarato esplicitamente nella documentazione (vedi
// firestore.rules). Chiunque acceda al localStorage del browser può
// impersonare l'utente: per un'app reale servirebbe Firebase Auth (anche solo
// anonima) + regole Firestore basate su request.auth.uid.

const NICKNAME_KEY = 'unicibo_nickname'
const USER_ID_KEY = 'unicibo_user_id'
const JOINED_GROUPS_KEY = 'unicibo_joined_group_ids'

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
