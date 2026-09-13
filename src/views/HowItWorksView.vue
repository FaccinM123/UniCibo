<template>
  <div class="uc-static-page">
    <h1 class="uc-page-title">Come funziona UniCibo</h1>

    <p class="uc-body">
      UniCibo è un social network a gruppi invitati per condividere le ricette
      che si cucinano davvero, pensato per studenti universitari: amici di
      corso, compagni Erasmus, coinquilini.
    </p>

    <h2 class="uc-label">Il feed</h2>
    <p class="uc-body">
      Nel feed trovi due tipi di ricette: quelle <strong>consigliate</strong>
      (importate una volta sola da un archivio esterno di ricette) e quelle
      <strong>pubblicate nei tuoi gruppi</strong>. Ogni ricetta si può
      reagire con "Lo cucino", "Lo mangio" o "Non mi piace" — una sola
      reazione alla volta — e commentare.
    </p>

    <h2 class="uc-label">Accesso con account vero</h2>
    <p class="uc-body">
      L'accesso è reale, tramite Firebase Auth: email e password, Google o
      Apple. Il tuo nickname e i tuoi post restano legati al tuo account, non
      al dispositivo — puoi accedere da un telefono nuovo e ritrovare tutto.
      Resta un <strong>limite consapevole</strong>: la registrazione via
      email non verifica che l'indirizzo sia davvero tuo, quindi un account
      può essere creato con un'email non controllata da chi si registra.
    </p>

    <h2 class="uc-label">Gruppi e codice invito</h2>
    <p class="uc-body">
      I gruppi si creano o si raggiungono con un codice invito a 6 caratteri.
      Anche questo è un <strong>limite dichiarato</strong>: il codice non è un
      vero meccanismo di sicurezza, chiunque lo conosca può unirsi al gruppo.
    </p>
  </div>
</template>

<script setup>
</script>

<style scoped>
.uc-static-page {
  padding: 18px 16px 32px;
}

.uc-page-title {
  font-size: 20px;
  font-weight: 700;
  margin: 4px 0 18px;
  color: var(--uc-text);
}

.uc-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--uc-text-muted);
  letter-spacing: 0.03em;
  margin: 22px 0 8px;
  text-transform: uppercase;
}

.uc-body {
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--uc-text);
  margin: 0;
}
</style>
