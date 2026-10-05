import { randomUUID } from 'node:crypto';
import { messageErreurGemini, pause } from './gemini.service.js';

// Une vidéo prend de 11 secondes à plusieurs minutes. Un appel d'outil MCP qui bloquerait
// aussi longtemps risquerait un timeout côté client : on lance donc le travail en
// arrière-plan, on rend tout de suite un identifiant, et le client vient demander le résultat.
//
// Les tâches vivent en mémoire : un redémarrage du serveur les efface
// (les fichiers déjà téléchargés restent sur le disque).

const NOMBRE_MAX_TACHES = 100;

/** @type {Map<string, object>} identifiant → tâche */
const taches = new Map();
/** @type {Map<string, Promise<void>>} identifiant → promesse résolue quand la tâche se termine */
const fins = new Map();

/**
 * Démarre un travail long en arrière-plan.
 * @param {{ moteur: string, modele: string, prompt: string }} infos décrivent la tâche
 * @param {() => Promise<object>} travail fonction async qui produit le résultat
 * @returns {object} la tâche, avec statut 'en_cours'
 */
export function lancerTache(infos, travail) {
  const tache = {
    id: `video_${randomUUID().slice(0, 8)}`,
    statut: 'en_cours',
    ...infos,
    lancee_le: new Date().toISOString(),
  };
  taches.set(tache.id, tache);
  console.log(`[tâche ${tache.id}] lancée (${tache.modele})`);

  const fin = travail().then(
    (resultat) => {
      Object.assign(tache, { statut: 'terminee', terminee_le: new Date().toISOString(), resultat });
      console.log(`[tâche ${tache.id}] terminée → ${resultat.fichier}`);
    },
    (erreur) => {
      Object.assign(tache, { statut: 'echouee', terminee_le: new Date().toISOString(), erreur: messageErreurGemini(erreur) });
      console.error(`[tâche ${tache.id}] échouée : ${tache.erreur}`);
    },
  );
  fins.set(tache.id, fin);

  oublierAnciennesTaches();
  return tache;
}

export function lireTache(id) {
  return taches.get(id);
}

/** Attend la fin de la tâche, au plus `attenteMs` millisecondes, puis renvoie son état. */
export async function attendreTache(id, attenteMs) {
  const fin = fins.get(id);
  if (fin && attenteMs > 0) await Promise.race([fin, pause(attenteMs)]);
  return taches.get(id);
}

/** Les tâches les plus récentes d'abord. */
export function listerTaches() {
  return [...taches.values()].reverse();
}

function oublierAnciennesTaches() {
  for (const [id, tache] of taches) {
    if (taches.size <= NOMBRE_MAX_TACHES) break;
    if (tache.statut === 'en_cours') continue;
    taches.delete(id);
    fins.delete(id);
  }
}
