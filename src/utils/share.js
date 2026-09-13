// Wrapper sopra la Web Share API (disponibile su Safari/Chrome mobile):
// se il browser non la supporta (tipicamente desktop), ripiega copiando il
// testo negli appunti. Ritorna 'shared' | 'copied' | 'cancelled' | 'error'.
export async function shareOrCopy({ title, text, url }) {
  const shareData = url ? { title, text, url } : { title, text }

  if (navigator.share) {
    try {
      await navigator.share(shareData)
      return 'shared'
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled'
      // Alcuni browser lanciano anche per combinazioni di campi non
      // supportate: ripieghiamo sugli appunti invece di fallire silenziosi.
    }
  }

  try {
    const payload = url ? `${text}\n${url}` : text
    await navigator.clipboard.writeText(payload)
    return 'copied'
  } catch (err) {
    console.error('Errore nel copiare il testo da condividere:', err)
    return 'error'
  }
}
