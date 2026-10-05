// Petits utilitaires pour fabriquer les réponses d'outils MCP.
//
// Une réponse d'outil contient :
// - `content` : ce que l'IA cliente lit (texte, images…)
// - `structuredContent` (facultatif) : les mêmes infos en JSON, pour les clients qui savent l'exploiter
// - `isError: true` quand l'outil a échoué : l'IA voit l'erreur et peut corriger son appel.

export function reponseTexte(texte, donnees) {
  return {
    content: [{ type: 'text', text: texte }],
    ...(donnees && { structuredContent: donnees }),
  };
}

export function reponseErreur(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}
