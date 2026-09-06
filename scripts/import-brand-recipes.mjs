// Script UNA TANTUM: importa un piccolo set di ricette da Spoonacular
// e le scrive in Firestore come documenti "brand" (source: 'brand').
// A livello di dato restano "brand" (lo schema lo richiede), ma nell'app non
// si presentano come contenuto ufficiale: nickname casuale, nessuna etichetta
// visibile con la fonte esterna — sono solo post di esempio nel feed.
//
// NON viene mai chiamato dall'app in produzione: Spoonacular ha un piano
// gratuito da 50 punti/giorno (verificato), troppo poco per chiamate in
// tempo reale. Si lancia a mano quando serve popolare/aggiornare il feed.
//
// Usa firebase-admin (bypassa firestore.rules) perché le regole del
// client permettono solo la creazione di ricette con source: 'group'.
//
// SETUP RICHIESTO PRIMA DI LANCIARLO:
// 1. Firebase Console > Impostazioni progetto > Account di servizio >
//    "Genera nuova chiave privata" -> salva il file come
//    scripts/serviceAccountKey.json (è già in .gitignore, NON committarlo).
// 2. Prendi una chiave gratuita su https://spoonacular.com/food-api
//    e mettila in .env come SPOONACULAR_API_KEY=...
// 3. npm run import-brand-recipes

import 'dotenv/config'
import fs from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const SERVICE_ACCOUNT_PATH = new URL('./serviceAccountKey.json', import.meta.url)
const SPOONACULAR_API_KEY = process.env.SPOONACULAR_API_KEY
const NUMBER_OF_RECIPES = 20 // pacchetto curato 15-25 ricette, resta sotto i 50 punti/giorno gratuiti

// Nickname di fantasia: le ricette importate non devono leggersi come "post
// ufficiali del brand", ma mescolarsi nel feed come normali post di gruppo
// pubblicati da studenti immaginari (stesso registro degli altri membri di
// esempio del progetto).
const FAKE_NICKNAMES = [
  'Giulia_R', 'Elena.T', 'Sam_erasmus', 'Luca92', 'Fede.B',
  'Anna_K', 'Chiara99', 'Davide.M', 'Mia_erasmus', 'Tommy87'
]
function randomFakeNickname() {
  return FAKE_NICKNAMES[Math.floor(Math.random() * FAKE_NICKNAMES.length)]
}

if (!SPOONACULAR_API_KEY) {
  console.error('Manca SPOONACULAR_API_KEY nel file .env. Interrompo.')
  process.exit(1)
}
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(
    'Manca scripts/serviceAccountKey.json.\n' +
    'Scaricalo da Firebase Console > Impostazioni progetto > Account di servizio > Genera nuova chiave privata.'
  )
  process.exit(1)
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

async function fetchRandomRecipes() {
  const url = `https://api.spoonacular.com/recipes/random?apiKey=${SPOONACULAR_API_KEY}&number=${NUMBER_OF_RECIPES}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Spoonacular ha risposto ${res.status}: ${await res.text()}`)
  }
  const data = await res.json()
  return data.recipes || []
}

function mapToUniCiboRecipe(spoonRecipe) {
  // Descrizione e procedimento sono un unico campo (steps): il riassunto
  // Spoonacular ripulito dall'HTML diventa la prima riga, seguito dai
  // passaggi veri e propri.
  const intro = (spoonRecipe.summary || '').replace(/<[^>]*>/g, '').trim()
  const actualSteps = (spoonRecipe.analyzedInstructions?.[0]?.steps || []).map((s) => s.step)
  const steps = intro ? [intro, ...actualSteps] : actualSteps
  const ingredients = (spoonRecipe.extendedIngredients || []).map((ing) => ing.original)

  return {
    title: spoonRecipe.title,
    imageUrl: spoonRecipe.image || null,
    ingredients,
    steps,
    source: 'brand',
    brandName: spoonRecipe.sourceName || spoonRecipe.creditsText || 'Spoonacular',
    groupId: null,
    authorNickname: randomFakeNickname(),
    authorLocalId: null,
    reactionCounts: { cucinarlo: 0, mangiarlo: 0, nonMiPiace: 0 },
    createdAt: FieldValue.serverTimestamp()
  }
}

async function main() {
  console.log(`Scarico ${NUMBER_OF_RECIPES} ricette da Spoonacular...`)
  const spoonRecipes = await fetchRandomRecipes()

  console.log(`Scrivo ${spoonRecipes.length} ricette su Firestore (collezione "recipes")...`)
  const batch = db.batch()
  for (const r of spoonRecipes) {
    const docRef = db.collection('recipes').doc()
    batch.set(docRef, mapToUniCiboRecipe(r))
  }
  await batch.commit()

  console.log('Import completato.')
}

main().catch((err) => {
  console.error('Import fallito:', err)
  process.exit(1)
})
