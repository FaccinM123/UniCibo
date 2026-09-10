# UniCibo — Autenticazione reale e sicurezza (sotto-progetto 1 di 4)

Data: 2026-09-10
Stato: approvato in chat, in attesa di implementazione

## Contesto

UniCibo nasce come progetto d'esame (Vue 3 + Vuetify 3 + Firestore, identità
"leggera" via `localStorage`, nessun login, schema e viste vincolati dal corso).
L'esame è stato consegnato. L'obiettivo ora è trasformare l'app in un prodotto
reale, pubblicabile su **App Store** e **Play Store**, senza più i vincoli del
corso.

Il lavoro complessivo è stato scomposto in 4 sotto-progetti indipendenti:

1. **Autenticazione reale e sicurezza** — questo documento
2. Tecniche Firestore restaurate (`onSnapshot`, `runTransaction`, indici
   compositi, `orderBy` server-side) — spec separata
3. Funzionalità del mockup mai implementate (post multi-gruppo, tag, ecc.) —
   spec separata
4. Pacchettizzazione e pubblicazione sugli store (Capacitor, icone, privacy
   policy, account developer) — spec separata

Questo documento copre **solo** il sotto-progetto 1. Si evolve direttamente
il progetto `sfamati` esistente (non serve preservarlo per l'esame: già dato).

## Decisioni prese (in chat)

- **Metodi di login**: email/password + Google Sign-In + Sign in with Apple,
  tutti via Firebase Auth.
- **Dati esistenti**: reset pulito delle collezioni di test (gruppi/ricette
  `source: 'group'`) prima del lancio; le ricette `source: 'brand'` restano
  come sono (pubbliche, nessun proprietario reale necessario).
- **Verifica email**: facoltativa/posticipabile — l'utente entra subito dopo
  la registrazione email/password, senza blocco. Non si applica a chi entra
  con Google/Apple (account già verificati dal provider).
- **Privacy gruppi**: i gruppi sono realmente privati — solo i membri
  (verificati via `request.auth.uid` in `memberIds`) possono leggere le
  ricette/commenti di un gruppo.
- **Pubblicazione ricette**: alla creazione di un post, la destinazione può
  essere un gruppo di cui si è membri **oppure "Pubblico"** — i post pubblici
  finiscono nel feed generale insieme alle ricette brand, visibili a
  chiunque sia autenticato.
- **Stack/pacchettizzazione**: resta Vue 3/JavaScript; per pubblicare su
  entrambi gli store si userà Capacitor (dettagli nella spec 4), non serve
  riscrivere l'app in linguaggio nativo.
- **Firestore resta la scelta giusta** per il backend (discusso e confermato
  in chat: è production-grade, usato da app reali, adatto alla scala di
  questo progetto).

## Architettura dell'identità

Oggi (`src/identity.js`): id anonimo `crypto.randomUUID()` + nickname + bio +
avatar + `joinedGroupIds` + `savedRecipeIds`, tutto in `localStorage`, nessuna
vera autenticazione.

Nuovo modello:

- **Firebase Auth** gestisce identità/sessione (`onAuthStateChanged`), con
  provider email/password, Google, Apple.
- Nuovo documento **`users/{uid}`** su Firestore (uid = quello assegnato da
  Firebase Auth):
  ```
  users/{uid}
    nickname: string
    bio: string
    avatarPhoto: string | null   // data URL compressa, come oggi
    joinedGroupIds: string[]
    savedRecipeIds: string[]
    createdAt: Timestamp
  ```
  Sostituisce **tutto** ciò che oggi vive solo in `localStorage`: i dati
  seguono l'utente su più dispositivi/reinstallazioni.
- `src/identity.js` viene riscritto: niente più helper `localStorage`,
  espone invece lo stato reattivo dell'utente autenticato (uid, profilo da
  `users/{uid}`) e funzioni `signUp`, `signIn`, `signInWithGoogle`,
  `signInWithApple`, `signOut`, `resetPassword`, `deleteAccount`.

### Flusso di onboarding

1. Utente non autenticato → schermata login/registrazione: campi
   email+password, più due pulsanti "Continua con Google" / "Continua con
   Apple".
2. Se è il primo accesso (nessun documento `users/{uid}`), un solo step
   aggiuntivo per scegliere il nickname, poi si crea `users/{uid}`.
3. Se l'account esiste già, si entra direttamente nell'app con il profilo
   caricato da Firestore.
4. "Password dimenticata" → flow standard `sendPasswordResetEmail` di
   Firebase Auth.

### Eliminazione account

Obbligatoria per policy sia Apple che Google quando un'app permette la
registrazione in-app. Nuova azione "Elimina account" nel profilo:
cancella `users/{uid}` e l'utenza Firebase Auth (`deleteUser`). I post
dell'utente restano nel database (come oggi con "elimina singolo post"),
ma con `authorId` che non risolve più a un profilo — la UI mostra un
nickname generico tipo "Utente eliminato" in quel caso.

## Modello dati e regole di sicurezza

### Schema `recipes` (diff)

Campo | Prima | Dopo
---|---|---
`authorLocalId` | id anonimo `localStorage` | rinominato `authorId`, uid Firebase reale
`groupId` | sempre valorizzato per `source:'group'` | resta uguale per post di gruppo
`visibility` | *(non esisteva)* | nuovo campo: `'public' \| 'group'`

Quando `visibility == 'public'`: `groupId: null`, leggibile da chiunque sia
autenticato (stesso trattamento delle ricette `source:'brand'`).
Quando `visibility == 'group'`: `groupId` valorizzato, leggibile solo dai
membri di quel gruppo.

### Regole Firestore (comportamento, non ancora testo finale delle rules)

- `users/{uid}`: leggibile da chiunque sia autenticato (serve per mostrare
  nickname/avatar sui post altrui); scrivibile **solo** dal proprietario
  (`request.auth.uid == uid`).
- `groups/{groupId}`: leggibile da chiunque sia autenticato (serve a
  validare un codice invito prima di entrare); creazione richiede
  `createdBy == request.auth.uid` e che l'utente si inserisca come unico
  membro iniziale; update per adesione/uscita **solo per se stessi**
  (`request.auth.uid` aggiunto/rimosso da `memberIds`, non un id
  arbitrario passato dal client come oggi); update di nome/descrizione/foto
  solo se `createdBy == request.auth.uid`.
- `recipes/{recipeId}`:
  - lettura: se `visibility == 'public'` o `source == 'brand'` → chiunque
    autenticato; se `visibility == 'group'` → solo se
    `request.auth.uid` è nel `memberIds` del gruppo referenziato (lookup
    `get()` sul documento `groups/{groupId}`).
  - creazione: richiede `authorId == request.auth.uid`; se
    `visibility == 'group'`, l'utente deve già essere membro del gruppo
    scelto.
  - update/delete: solo se `request.auth.uid == resource.data.authorId`
    (verifica reale, non più aggirabile).
  - le ricette `source: 'brand'` restano scrivibili solo dallo script di
    import (Admin SDK, bypassa le regole) — invariato.
- `recipes/{id}/reactions/{authorId}` e `recipes/{id}/comments/{commentId}`:
  stessa logica attuale ma con verifica reale `authorId == request.auth.uid`
  invece del semplice controllo di forma di oggi.

## Migrazione

1. Aggiungere provider Google/Apple nella console Firebase Auth (oltre a
   email/password).
2. Reset delle collezioni di test: cancellare documenti `groups` e
   `recipes` con `source:'group'` creati durante lo sviluppo/verifica.
   Le ricette `source:'brand'` restano.
3. Deploy delle nuove `firestore.rules`.
4. Riscrivere `src/identity.js` e tutti i punti che oggi leggono
   `getUserId()`/`getNickname()`/`getJoinedGroupIds()` da `localStorage`
   (`App.vue`, `AppShell.vue`, `ProfileDialog.vue`, `FeedView.vue`,
   `NewRecipeView.vue`, `GroupsView.vue`, `GroupDetailsView.vue`,
   `PostManagementView.vue`, `MemberView.vue`, `ReactionBar.vue`,
   `CommentList.vue`) per usare lo stato Auth + `users/{uid}`.
5. Nuova schermata di login/registrazione (nuova vista, sostituisce il
   dialog "Benvenuto" nickname-only).
6. Form "Nuova ricetta": il selettore "Destinazione" include ora anche
   l'opzione "Pubblico" oltre ai gruppi di cui si è membri.

## Non in scope di questo sotto-progetto

- Ripristino di `onSnapshot`/`runTransaction`/indici compositi (spec 2).
- Funzionalità mockup mai costruite: post multi-gruppo, tag, color-picker
  avatar, emoji gruppo (spec 3).
- Capacitor, icone, privacy policy, account developer, submission agli
  store (spec 4).

## Rischi / domande aperte

- Sign in with Apple richiede una configurazione lato Apple Developer
  (Service ID, chiave privata) che va fatta con un account Apple Developer
  attivo — bloccante solo per il login Apple, non per email/password/Google.
- Login con Google su iOS/Capacitor richiede il plugin nativo
  `@capacitor-firebase/authentication` (o equivalente) invece del solo SDK
  web — verrà dettagliato nella spec 4 (pacchettizzazione), qui si assume
  comportamento web-based (redirect/popup) per lo sviluppo in browser.
