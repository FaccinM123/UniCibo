import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// Vuetify
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import '@mdi/font/css/materialdesignicons.css'
import './styles/tokens.css'

// Equivalenti hex della palette OKLCH del design (vedi src/styles/tokens.css):
// servono alla color-math interna di Vuetify (varianti, ripple). Gli elementi
// disegnati "a mano" (card, chip, pillole) usano invece le variabili oklch()
// esatte definite in tokens.css.
// La dark mode segue il tema del sistema operativo/browser (nessun
// interruttore manuale in app): scegliamo il tema Vuetify iniziale da
// prefers-color-scheme, e lo aggiorniamo se l'utente cambia tema del
// sistema mentre l'app è aperta.
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: prefersDark.matches ? 'uniCiboThemeDark' : 'uniCiboTheme',
    themes: {
      uniCiboTheme: {
        dark: false,
        colors: {
          primary: '#D97D46',
          secondary: '#4C8F63',
          background: '#F7F4F0',
          surface: '#FDFCFB',
          error: '#C1432E'
        }
      },
      uniCiboThemeDark: {
        dark: true,
        colors: {
          primary: '#FF6600',
          secondary: '#4C8F63',
          background: '#232A26',
          surface: '#313733',
          error: '#DF3728'
        }
      }
    }
  }
})

prefersDark.addEventListener('change', (e) => {
  vuetify.theme.global.name.value = e.matches ? 'uniCiboThemeDark' : 'uniCiboTheme'
})

createApp(App).use(router).use(vuetify).mount('#app')
