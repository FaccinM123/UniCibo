// Script una tantum (Admin SDK, bypassa le security rules): svuota i dati
// di test creati durante lo sviluppo prima del lancio reale. Cancella
// TUTTI i documenti di `groups` e le ricette con source:'group' (con le
// loro sottocollezioni reactions/comments). Le ricette source:'brand'
// NON vengono toccate.
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'

const serviceAccount = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

async function deleteSubcollection(docRef, subcollectionName) {
  const snap = await docRef.collection(subcollectionName).get()
  await Promise.all(snap.docs.map((d) => d.ref.delete()))
}

async function resetGroupRecipes() {
  const snap = await db.collection('recipes').where('source', '==', 'group').get()
  for (const doc of snap.docs) {
    await deleteSubcollection(doc.ref, 'reactions')
    await deleteSubcollection(doc.ref, 'comments')
    await doc.ref.delete()
  }
  console.log(`Cancellate ${snap.size} ricette di gruppo (+ reazioni/commenti).`)
}

async function resetGroups() {
  const snap = await db.collection('groups').get()
  await Promise.all(snap.docs.map((d) => d.ref.delete()))
  console.log(`Cancellati ${snap.size} gruppi.`)
}

async function main() {
  await resetGroupRecipes()
  await resetGroups()
  console.log('Reset completato. Le ricette source:"brand" non sono state toccate.')
}

main().catch((err) => {
  console.error('Errore nel reset:', err)
  process.exit(1)
})
