// Colore avatar deterministico derivato da una stringa (nickname o id locale),
// SENZA salvare nessun campo "colore" su Firestore: lo schema dati non lo
// prevede, quindi lo ricalcoliamo lato client ogni volta a partire da un
// hash semplice. Stessa persona -> sempre la stessa tonalità.

const HUES = [58, 145, 20, 260, 200]

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function avatarHue(seed) {
  if (!seed) return HUES[0]
  return HUES[hashString(seed) % HUES.length]
}

export function avatarColor(seed) {
  return `oklch(60% 0.13 ${avatarHue(seed)})`
}

export function avatarInitial(nickname) {
  return (nickname || '?').trim().charAt(0).toUpperCase() || '?'
}
