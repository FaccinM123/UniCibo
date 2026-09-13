// Controllo aggiornamenti per l'app nativa Android: l'APK installato tramite
// sideload (fuori dal Play Store, vedi public/scarica.html) non si aggiorna
// da solo. All'avvio confrontiamo il versionCode nativo con quello
// pubblicato in public/version.json — se è più recente, mostriamo un banner
// con il link per riscaricare. Su web/PWA non ha senso (si aggiorna da sola
// tramite service worker), quindi qui usciamo subito.
import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

export const updateAvailable = ref(false)
export const updateDownloadUrl = ref('https://unicibo.web.app/scarica.html')

export async function checkForUpdate() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const [info, res] = await Promise.all([
      App.getInfo(),
      fetch('https://unicibo.web.app/version.json', { cache: 'no-store' })
    ])
    if (!res.ok) return
    const latest = await res.json()
    const currentCode = Number(info.build)
    const latestCode = Number(latest.android?.versionCode)
    if (latestCode && currentCode && latestCode > currentCode) {
      updateAvailable.value = true
      if (latest.android?.url) updateDownloadUrl.value = latest.android.url
    }
  } catch (err) {
    console.error('Errore nel controllare aggiornamenti:', err)
  }
}
