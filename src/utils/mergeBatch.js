// Un post pubblicato in più gruppi contemporaneamente resta comunque più
// documenti Firestore indipendenti (uno per gruppo, ciascuno con le sue
// reazioni/commenti — scelta deliberata, vedi NewRecipeView.vue). Questa
// funzione unisce SOLO la visualizzazione: le copie che condividono lo
// stesso batchId diventano una singola entry (la prima incontrata, "di
// riferimento", usata per link/modifica/elimina), con reactionCounts
// sommati tra tutte le copie. Le ricette senza batchId (pubblicate in un
// solo gruppo, o precedenti a questa funzionalità) passano invariate.
export function mergeByBatch(recipes) {
  const primaryByBatch = new Map()
  const result = []

  for (const recipe of recipes) {
    if (!recipe.batchId) {
      result.push(recipe)
      continue
    }

    const existing = primaryByBatch.get(recipe.batchId)
    if (!existing) {
      const merged = {
        ...recipe,
        reactionCounts: { ...(recipe.reactionCounts || {}) },
        batchCount: 1,
        extraCopies: []
      }
      primaryByBatch.set(recipe.batchId, merged)
      result.push(merged)
    } else {
      existing.batchCount += 1
      existing.extraCopies.push({ recipeId: recipe.id, groupId: recipe.groupId })
      const rc = recipe.reactionCounts || {}
      for (const type of Object.keys(rc)) {
        existing.reactionCounts[type] = (existing.reactionCounts[type] || 0) + (rc[type] || 0)
      }
    }
  }

  return result
}
