import { McpServer } from '@modelcontextprotocol/server';
import { enregistrerOutilAnalyse } from './tool/analyse.tool.js';
import { enregistrerOutilImage } from './tool/image.tool.js';
import { enregistrerOutilModeles } from './tool/modele.tool.js';
import { enregistrerOutilsVideo } from './tool/video.tool.js';

// Envoyé au client à la connexion : c'est le « mode d'emploi » que lit l'IA.
const INSTRUCTIONS = `Passerelle vers Google AI Studio pour créer des images et des vidéos.

Images : gemini_generer_image. Regarde le résultat, puis itère en repassant interaction_id
dans interaction_precedente avec un prompt qui ne décrit que la correction.

Vidéos : gemini_lancer_video_veo (qualité, image de départ/fin, références, prolongation) ou
gemini_lancer_video_omni (modification conversationnelle). Les deux rendent un id de tâche ;
récupère la vidéo avec gemini_suivre_video, contrôle-la avec gemini_analyser_media, puis corrige.

Les fichiers d'entrée se donnent en chemins absolus. Chaque génération est facturée sur la clé
de l'utilisateur : fais des essais en basse résolution avant la version finale.`;

/**
 * Fabrique un serveur MCP avec tous les outils.
 * Elle est appelée à CHAQUE requête HTTP (mode sans état) : rien n'est gardé entre deux appels,
 * sauf ce qui vit dans les services (le client Gemini, la liste des tâches vidéo).
 */
export function creerServeurMcp() {
  const serveur = new McpServer(
    { name: 'gemini-studio-mcp-server', version: '1.0.0' },
    { instructions: INSTRUCTIONS },
  );

  enregistrerOutilImage(serveur);
  enregistrerOutilsVideo(serveur);
  enregistrerOutilAnalyse(serveur);
  enregistrerOutilModeles(serveur);

  return serveur;
}
