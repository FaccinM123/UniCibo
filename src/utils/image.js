// Conversione di un file immagine (scelto dalla galleria) in una data URL
// compressa, salvata direttamente come stringa nei campi Firestore esistenti
// (recipes.imageUrl) invece di caricare il file su Firebase Storage: niente
// nuovo servizio Firebase, ma le immagini restano necessariamente piccole per
// stare sotto il limite di 1MB per documento di Firestore.

const MAX_DIMENSION = 640
const MAX_BYTES = 500_000 // margine ampio sotto il limite di 1MB/documento

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

function canvasToDataUrl(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality)
}

export async function fileToCompressedDataUrl(file) {
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  URL.revokeObjectURL(img.src)

  // Riduco progressivamente la qualità JPEG finché la data URL non sta sotto
  // la soglia di sicurezza.
  let quality = 0.8
  let dataUrl = canvasToDataUrl(canvas, quality)
  while (dataUrl.length > MAX_BYTES && quality > 0.3) {
    quality -= 0.1
    dataUrl = canvasToDataUrl(canvas, quality)
  }

  if (dataUrl.length > MAX_BYTES) {
    throw new Error('Immagine troppo grande anche dopo la compressione: scegline una più semplice.')
  }

  return dataUrl
}
