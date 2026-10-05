import { config } from '../config.js';
import { listerTaches } from '../service/tache.service.js';

// GET /api : vérifier d'un coup d'œil que le serveur tourne.
export const lireEtat = (req, res) => {
  const taches = listerTaches();
  res.json({
    statut: 'ok',
    mcp: `http://${config.host}:${config.port}/mcp`,
    dossier_sortie: config.dossierSortie,
    taches_video: {
      en_cours: taches.filter((t) => t.statut === 'en_cours').length,
      total: taches.length,
    },
  });
};
