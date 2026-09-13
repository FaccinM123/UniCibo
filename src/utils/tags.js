// Elenco fisso dei 3 tag rapidi disponibili per una ricetta — unica fonte
// di verità per id/etichetta/colore, usata dal form di pubblicazione, dalla
// visualizzazione su card/dettaglio, e dal filtro del feed. Il colore è solo
// visivo (contorno + testo del chip): non è un campo salvato su Firestore.
export const TAG_OPTIONS = [
  { id: 'vegetariano', label: 'Vegetariano', color: '#16C222' },
  { id: 'vegano', label: 'Vegano', color: '#0E7815' },
  { id: 'senzaGlutine', label: 'Senza glutine', color: '#D8D149' }
]
