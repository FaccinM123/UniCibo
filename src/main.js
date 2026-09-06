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
const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'uniCiboTheme',
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
      }
    }
  }
})

createApp(App).use(router).use(vuetify).mount('#app')
