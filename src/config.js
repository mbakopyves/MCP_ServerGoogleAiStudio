// Charge le .env AVANT toute lecture de process.env.
// En ESM, les imports sont évalués dans l'ordre : comme tous les modules qui lisent
// la config importent ce fichier, dotenv est forcément chargé en premier.
import 'dotenv/config';
import path from 'node:path';

if (!process.env.GEMINI_API_KEY) {
  console.error(
    'GEMINI_API_KEY manquante. Crée une clé sur https://aistudio.google.com/apikey ' +
      'puis ajoute-la dans le fichier .env (voir .env.example).',
  );
  process.exit(1);
}

export const config = {
  cleApiGemini: process.env.GEMINI_API_KEY,
  port: Number(process.env.PORT ?? 3000),
  // 127.0.0.1 = joignable uniquement depuis ta machine. Ne mets 0.0.0.0 que derrière une authentification.
  host: process.env.HOST ?? '127.0.0.1',
  // Dossier où sont écrites les images et vidéos générées (chemin absolu).
  dossierSortie: path.resolve(process.env.DOSSIER_SORTIE ?? 'generations'),
};

// Modèles connus au 5 octobre 2026. Le premier de chaque liste est la valeur par défaut.
// Si Google en publie de nouveaux, l'outil gemini_lister_modeles les affichera : ajoute-les ici.
export const modeles = {
  image: ['gemini-3.1-flash-image', 'gemini-3-pro-image', 'gemini-3.1-flash-lite-image'],
  veo: ['veo-3.1-generate-preview', 'veo-3.1-fast-generate-preview', 'veo-3.1-lite-generate-preview'],
  omni: ['gemini-omni-1.1-flash', 'gemini-omni-flash-preview'],
  // Alias qui suivent toujours les derniers Gemini Flash : servent à analyser images et vidéos.
  // La version lite répond en quelques secondes ; la version complète est plus fine mais plus lente.
  analyse: ['gemini-flash-lite-latest', 'gemini-flash-latest'],
};
