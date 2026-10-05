import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

// Un seul client pour tout le serveur : il porte la clé API et se réutilise entre les requêtes.
export const ai = new GoogleGenAI({ apiKey: config.cleApiGemini });

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Traduit une erreur de l'API Gemini en message exploitable par l'IA cliente :
 * on dit ce qui s'est passé ET quoi faire ensuite.
 */
export function messageErreurGemini(erreur) {
  const statut = erreur?.status ?? erreur?.statusCode ?? erreur?.status_code;
  const { detail, raison } = lireDetailGoogle(erreur);

  // Google répond 400 (et non 401) quand la clé est fausse : on le repère à sa raison.
  if (raison === 'API_KEY_INVALID') {
    return 'Clé GEMINI_API_KEY invalide. Vérifie-la sur https://aistudio.google.com/apikey puis redémarre le serveur.';
  }

  switch (statut) {
    case 400:
      return `Requête refusée par Gemini (paramètre invalide) : ${detail}`;
    case 401:
    case 403:
      return (
        'Accès refusé par Gemini : la clé GEMINI_API_KEY est invalide, ou ce modèle exige ' +
        `la facturation activée sur AI Studio. Détail : ${detail}`
      );
    case 404:
      return `Modèle ou ressource introuvable. Utilise gemini_lister_modeles pour voir les modèles disponibles. Détail : ${detail}`;
    case 429:
      return `Quota Gemini dépassé. Attends une minute avant de réessayer. Détail : ${detail}`;
    default:
      if (statut >= 500) return `Gemini est indisponible (${statut}). Réessaie dans quelques instants. Détail : ${detail}`;
      return `Erreur : ${detail}`;
  }
}

/**
 * Google renvoie ses erreurs en JSON : { error: { message, details: [{ reason }] } }.
 * Selon l'API appelée, le SDK le range dans `body` (Interactions) ou dans `message` (models, operations).
 */
function lireDetailGoogle(erreur) {
  for (const brut of [erreur?.body, erreur?.message]) {
    if (typeof brut !== 'string') continue;
    const debutJson = brut.search(/[[{]/);
    if (debutJson === -1) continue;
    try {
      const json = JSON.parse(brut.slice(debutJson));
      const { error } = Array.isArray(json) ? json[0] : json;
      if (error?.message) {
        return { detail: error.message, raison: error.details?.find((d) => d.reason)?.reason };
      }
    } catch {
      // Pas du JSON : on passe à la source suivante.
    }
  }
  return { detail: erreur?.message ?? String(erreur) };
}
