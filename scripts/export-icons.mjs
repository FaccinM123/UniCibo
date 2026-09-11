import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'

mkdirSync('public/icons', { recursive: true })

const full = readFileSync('src/assets/icon-source.svg')
const simple = readFileSync('src/assets/icon-source-simple.svg')

async function exportPng(svgBuffer, size, outPath, padding = 0) {
  const inner = Math.round(size * (1 - padding * 2))
  await sharp(svgBuffer)
    .resize(inner, inner)
    .extend({
      top: Math.round((size - inner) / 2),
      bottom: Math.round((size - inner) / 2),
      left: Math.round((size - inner) / 2),
      right: Math.round((size - inner) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(outPath)
  console.log('OK', outPath)
}

await exportPng(full, 192, 'public/icons/icon-192.png')
await exportPng(full, 512, 'public/icons/icon-512.png')
// Maskable: 10% di margine di sicurezza sui lati, il sistema puo' ritagliare
// a forma variabile (cerchio, squircle, ecc.) senza tagliare il disegno.
await exportPng(full, 512, 'public/icons/icon-512-maskable.png', 0.1)
await exportPng(full, 180, 'public/icons/apple-touch-icon.png')

await exportPng(simple, 48, 'public/icons/favicon-48.png')
await exportPng(simple, 32, 'public/icons/favicon-32.png')
await exportPng(simple, 16, 'public/icons/favicon-16.png')

console.log('Fatto. Nota: public/favicon.ico va generato a parte (vedi Step 5).')
