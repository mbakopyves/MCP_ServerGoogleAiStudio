import { VideoGenerationReferenceType } from '@google/genai';
import * as z from 'zod';
import { modeles } from '../../config.js';
import { ai, messageErreurGemini, pause } from '../../service/gemini.service.js';
import { cheminSortie, enregistrerBase64, lireMedia } from '../../service/fichier.service.js';
import { attendreTache, lancerTache, lireTache, listerTaches } from '../../service/tache.service.js';
import { reponseErreur, reponseTexte } from '../reponse.js';

// Veo annonce de 11 s à 6 min ; au-delà de 15 min on considère la génération perdue.
const DUREE_MAX_GENERATION_MS = 15 * 60_000;

const ANNOTATIONS_LANCEMENT = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

// ─── Veo 3.1 ────────────────────────────────────────────────────────────────

const schemaVeo = z
  .object({
    prompt: z
      .string()
      .min(1)
      .max(4000)
      .describe(
        'Description de la vidéo : sujet, action, cadrage, mouvement de caméra, ambiance, sons. ' +
          'Veo génère aussi l’audio : mets les dialogues entre guillemets.',
      ),
    modele: z
      .enum(modeles.veo)
      .default(modeles.veo[0])
      .describe(
        'veo-3.1-generate-preview (qualité max) · veo-3.1-fast-generate-preview (plus rapide, moins cher) · ' +
          'veo-3.1-lite-generate-preview (le moins cher, 1080p max, sans images_reference).',
      ),
    image_depart: z.string().optional().describe('Chemin ABSOLU d’une image qui sert de première image de la vidéo.'),
    image_fin: z
      .string()
      .optional()
      .describe('Chemin ABSOLU de la dernière image. Exige image_depart : Veo interpole entre les deux.'),
    images_reference: z
      .array(z.string())
      .max(3)
      .optional()
      .describe('Jusqu’à 3 chemins ABSOLUS d’images (personnage, objet, tenue) à faire apparaître. Impose 8 s.'),
    prolonger_tache: z
      .string()
      .optional()
      .describe('id d’une tâche Veo terminée il y a moins de 2 jours : la nouvelle vidéo la prolonge. 720p, 8 s.'),
    format: z.enum(['16:9', '9:16']).optional().describe('Défaut : 16:9.'),
    resolution: z.enum(['720p', '1080p', '4k']).optional().describe('Défaut : 720p. 1080p et 4k imposent 8 s.'),
    duree_secondes: z
      .union([z.literal(4), z.literal(6), z.literal(8)])
      .optional()
      .describe('Défaut : 8.'),
    prompt_negatif: z.string().max(1000).optional().describe('Ce qu’il ne faut PAS voir (ex. « texte à l’écran, flou »).'),
    seed: z.number().int().min(0).max(4294967295).optional().describe('Graine : rapproche deux essais, sans garantie.'),
  })
  .strict();

/** Vérifie les combinaisons que Veo refuse, pour donner un message clair avant de payer un appel. */
function verifierContraintesVeo(params) {
  const lite = params.modele.includes('lite');
  const exige8s = params.resolution === '1080p' || params.resolution === '4k' || params.images_reference || params.prolonger_tache;

  if (params.image_fin && !params.image_depart) return 'image_fin exige image_depart.';
  if (lite && params.images_reference) return 'images_reference n’est pas disponible avec la version lite.';
  if (lite && params.resolution === '4k') return 'La 4k n’est pas disponible avec la version lite.';
  if (exige8s && params.duree_secondes && params.duree_secondes !== 8) {
    return 'La 1080p, la 4k, les images de référence et la prolongation imposent duree_secondes = 8.';
  }
  if (params.prolonger_tache && params.resolution && params.resolution !== '720p') {
    return 'La prolongation ne fonctionne qu’en 720p.';
  }
  return null;
}

const versImageVeo = ({ data, mime_type }) => ({ imageBytes: data, mimeType: mime_type });

async function genererVideoVeo(requete, prompt) {
  let operation = await ai.models.generateVideos(requete);

  const limite = Date.now() + DUREE_MAX_GENERATION_MS;
  while (!operation.done) {
    if (Date.now() > limite) throw new Error('Veo n’a pas répondu en 15 minutes. Relance la génération.');
    await pause(10_000);
    operation = await ai.operations.getVideosOperation({ operation });
  }

  if (operation.error) throw new Error(operation.error.message ?? JSON.stringify(operation.error));
  const generee = operation.response?.generatedVideos?.[0];
  if (!generee?.video) {
    const raisons = operation.response?.raiMediaFilteredReasons?.join(' ; ');
    throw new Error(`Aucune vidéo produite${raisons ? ` (filtrée : ${raisons})` : ''}. Reformule le prompt.`);
  }

  const chemin = await cheminSortie('videos', prompt, 'video/mp4');
  await ai.files.download({ file: generee.video, downloadPath: chemin });
  // `video` référence le fichier chez Google (gardé 2 jours) : c'est ce qui permet de la prolonger.
  return { fichier: chemin, video: generee.video };
}

// ─── Gemini Omni ────────────────────────────────────────────────────────────

const schemaOmni = z
  .object({
    prompt: z
      .string()
      .min(1)
      .max(4000)
      .describe('Ce que la vidéo doit montrer, ou la modification à apporter quand on itère (« rends le violon invisible »).'),
    interaction_precedente: z
      .string()
      .optional()
      .describe('interaction_id d’une tâche Omni terminée : Omni modifie cette vidéo au lieu d’en créer une nouvelle.'),
    images_entree: z
      .array(z.string())
      .max(10)
      .optional()
      .describe('Chemins ABSOLUS d’images : point de départ ou références (personnage, objet, style).'),
    video_entree: z.string().optional().describe('Chemin ABSOLU d’une vidéo locale (10 s max) à modifier ou prolonger.'),
    mode: z
      .enum(['text_to_video', 'image_to_video', 'reference_to_video', 'edit', 'extend'])
      .optional()
      .describe('Force le mode de génération. Par défaut, Omni le déduit du prompt et des médias fournis.'),
    modele: z.enum(modeles.omni).default(modeles.omni[0]),
    format: z.enum(['16:9', '9:16']).optional().describe('Défaut : 16:9.'),
    resolution: z
      .enum(['360p', '720p', '1080p', '4k'])
      .optional()
      .describe('Défaut : 720p. 360p pour des essais rapides avant la version finale.'),
  })
  .strict();

async function genererVideoOmni(requete, prompt) {
  const interaction = await ai.interactions.create(requete, { timeout_ms: DUREE_MAX_GENERATION_MS });

  const video = interaction.output_video;
  if (!video?.data && !video?.uri) {
    const raison = interaction.errors?.map((e) => e.message).join(' ; ') || interaction.output_text || `statut « ${interaction.status} »`;
    throw new Error(`Aucune vidéo produite : ${raison}`);
  }

  const chemin = await cheminSortie('videos', prompt, 'video/mp4');
  if (video.data) {
    await enregistrerBase64(chemin, video.data);
  } else {
    // Vidéo trop lourde pour être renvoyée en base64 : Google la dépose dans ses fichiers.
    await attendreFichierActif(video.uri);
    await ai.files.download({ file: video, downloadPath: chemin });
  }
  return { fichier: chemin, interaction_id: interaction.id };
}

async function attendreFichierActif(uri) {
  const nom = uri.match(/files\/[\w-]+/)?.[0];
  if (!nom) return;
  const limite = Date.now() + DUREE_MAX_GENERATION_MS;
  while (Date.now() < limite) {
    const fichier = await ai.files.get({ name: nom });
    const etat = String(fichier.state?.name ?? fichier.state);
    if (etat === 'ACTIVE') return;
    if (etat === 'FAILED') throw new Error('Google n’a pas pu finaliser le fichier vidéo.');
    await pause(5_000);
  }
}

// ─── Suivi ──────────────────────────────────────────────────────────────────

const schemaSuivi = z
  .object({
    id_tache: z
      .string()
      .optional()
      .describe('id renvoyé par gemini_lancer_video_veo ou gemini_lancer_video_omni. Sans id : liste les tâches récentes.'),
    attente_max_secondes: z
      .number()
      .int()
      .min(0)
      .max(50)
      .default(30)
      .describe('Si la vidéo n’est pas prête, attend jusqu’à ce délai avant de répondre (évite de rappeler en boucle).'),
  })
  .strict();

/** Ce que le client a le droit de voir d'une tâche (sans les objets internes de Google). */
function vuePublique(tache) {
  return {
    id: tache.id,
    statut: tache.statut,
    moteur: tache.moteur,
    modele: tache.modele,
    prompt: tache.prompt,
    lancee_le: tache.lancee_le,
    terminee_le: tache.terminee_le ?? null,
    fichier: tache.resultat?.fichier ?? null,
    interaction_id: tache.resultat?.interaction_id ?? null,
    erreur: tache.erreur ?? null,
  };
}

function decrireTache(tache) {
  const ecoule = Math.round((Date.now() - Date.parse(tache.lancee_le)) / 1000);

  if (tache.statut === 'en_cours') {
    return `Tâche ${tache.id} toujours en cours (${tache.modele}, lancée il y a ${ecoule} s). Rappelle gemini_suivre_video.`;
  }
  if (tache.statut === 'echouee') {
    return `Échec de la tâche ${tache.id} : ${tache.erreur}`;
  }

  const lignes = [`Vidéo prête : ${tache.resultat.fichier}`, ''];
  if (tache.moteur === 'omni') {
    lignes.push(
      `interaction_id : ${tache.resultat.interaction_id}`,
      '→ pour la modifier : gemini_lancer_video_omni avec interaction_precedente = cet id.',
    );
  } else {
    lignes.push(`→ pour la prolonger : gemini_lancer_video_veo avec prolonger_tache = ${tache.id}.`);
  }
  lignes.push('→ pour vérifier le rendu : gemini_analyser_media avec le chemin du fichier.');
  return lignes.join('\n');
}

// ─── Enregistrement des outils ──────────────────────────────────────────────

export function enregistrerOutilsVideo(serveur) {
  serveur.registerTool(
    'gemini_lancer_video_veo',
    {
      title: 'Lancer une vidéo Veo 3.1',
      description: `Lance la génération d'une vidéo (avec audio) par Veo 3.1 et rend aussitôt un id de tâche.

Veo excelle en qualité cinéma, et sait : partir d'une image (image_depart), relier deux images
(image_depart + image_fin), intégrer jusqu'à 3 références (images_reference), prolonger une vidéo Veo
(prolonger_tache). Pour MODIFIER une vidéo par instructions successives, préfère gemini_lancer_video_omni.

La génération prend de 11 s à 6 min : récupère le résultat avec gemini_suivre_video.`,
      inputSchema: schemaVeo,
      annotations: ANNOTATIONS_LANCEMENT,
    },
    async (params) => {
      try {
        const contrainte = verifierContraintesVeo(params);
        if (contrainte) return reponseErreur(contrainte);

        let videoSource;
        if (params.prolonger_tache) {
          const source = lireTache(params.prolonger_tache);
          if (source?.moteur !== 'veo' || source.statut !== 'terminee') {
            return reponseErreur(
              `prolonger_tache : « ${params.prolonger_tache} » n'est pas une tâche Veo terminée sur ce serveur ` +
                '(les tâches sont perdues au redémarrage). Vérifie avec gemini_suivre_video sans id.',
            );
          }
          videoSource = source.resultat.video;
        }

        // Les fichiers sont lus maintenant : une erreur de chemin est signalée tout de suite.
        const [imageDepart, imageFin, references] = await Promise.all([
          params.image_depart && lireMedia(params.image_depart, 'image'),
          params.image_fin && lireMedia(params.image_fin, 'image'),
          Promise.all((params.images_reference ?? []).map((chemin) => lireMedia(chemin, 'image'))),
        ]);

        const requete = {
          model: params.modele,
          prompt: params.prompt,
          image: imageDepart ? versImageVeo(imageDepart) : undefined,
          video: videoSource,
          config: {
            numberOfVideos: 1,
            aspectRatio: params.format,
            resolution: params.resolution,
            durationSeconds: params.duree_secondes,
            negativePrompt: params.prompt_negatif,
            seed: params.seed,
            lastFrame: imageFin ? versImageVeo(imageFin) : undefined,
            referenceImages: references.length
              ? references.map((image) => ({ image: versImageVeo(image), referenceType: VideoGenerationReferenceType.ASSET }))
              : undefined,
          },
        };

        const tache = lancerTache({ moteur: 'veo', modele: params.modele, prompt: params.prompt }, () =>
          genererVideoVeo(requete, params.prompt),
        );
        return reponseTexte(
          `Tâche ${tache.id} lancée (${params.modele}). Récupère la vidéo avec gemini_suivre_video (id_tache = ${tache.id}).`,
          vuePublique(tache),
        );
      } catch (erreur) {
        return reponseErreur(messageErreurGemini(erreur));
      }
    },
  );

  serveur.registerTool(
    'gemini_lancer_video_omni',
    {
      title: 'Lancer une vidéo Gemini Omni',
      description: `Lance la génération ou la MODIFICATION d'une vidéo par Gemini Omni et rend aussitôt un id de tâche.

Omni est conversationnel : une fois une vidéo obtenue, rappelle cet outil avec interaction_precedente
(fourni par gemini_suivre_video) et un prompt qui décrit seulement le changement voulu
(« change la couleur de la voiture en rouge », « ajoute de la pluie »). Il accepte aussi des images
et une vidéo locale (10 s max) en entrée.

Récupère le résultat avec gemini_suivre_video.`,
      inputSchema: schemaOmni,
      annotations: ANNOTATIONS_LANCEMENT,
    },
    async (params) => {
      try {
        const [images, video] = await Promise.all([
          Promise.all((params.images_entree ?? []).map((chemin) => lireMedia(chemin, 'image'))),
          params.video_entree && lireMedia(params.video_entree, 'video'),
        ]);
        const medias = [...images, ...(video ? [video] : [])];

        const requete = {
          model: params.modele,
          input:
            medias.length === 0
              ? params.prompt
              : [
                  { type: 'text', text: params.prompt },
                  ...medias.map(({ categorie, data, mime_type }) => ({ type: categorie, data, mime_type })),
                ],
          previous_interaction_id: params.interaction_precedente,
          response_format:
            params.format || params.resolution
              ? { type: 'video', aspect_ratio: params.format, resolution: params.resolution }
              : undefined,
          generation_config: params.mode ? { video_config: { task: params.mode } } : undefined,
        };

        const tache = lancerTache({ moteur: 'omni', modele: params.modele, prompt: params.prompt }, () =>
          genererVideoOmni(requete, params.prompt),
        );
        return reponseTexte(
          `Tâche ${tache.id} lancée (${params.modele}). Récupère la vidéo avec gemini_suivre_video (id_tache = ${tache.id}).`,
          vuePublique(tache),
        );
      } catch (erreur) {
        return reponseErreur(messageErreurGemini(erreur));
      }
    },
  );

  serveur.registerTool(
    'gemini_suivre_video',
    {
      title: 'Suivre une génération vidéo',
      description: `Donne l'état d'une tâche vidéo (en_cours, terminee, echouee) et, une fois terminée,
le chemin du fichier MP4 et de quoi itérer dessus. Attend jusqu'à attente_max_secondes si elle n'est pas finie.
Sans id_tache : liste les tâches récentes de ce serveur.`,
      inputSchema: schemaSuivi,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id_tache, attente_max_secondes }) => {
      if (!id_tache) {
        const taches = listerTaches().slice(0, 20);
        if (taches.length === 0) return reponseTexte('Aucune tâche vidéo sur ce serveur depuis son démarrage.');
        const lignes = taches.map(
          (t) => `- ${t.id} · ${t.statut} · ${t.modele} · « ${t.prompt.slice(0, 60)} »${t.resultat ? ` → ${t.resultat.fichier}` : ''}`,
        );
        return reponseTexte(lignes.join('\n'), { taches: taches.map(vuePublique) });
      }

      const tache = await attendreTache(id_tache, attente_max_secondes * 1000);
      if (!tache) {
        return reponseErreur(
          `Tâche « ${id_tache} » inconnue. Les tâches sont perdues au redémarrage du serveur ; appelle gemini_suivre_video sans id pour voir la liste.`,
        );
      }
      return reponseTexte(decrireTache(tache), vuePublique(tache));
    },
  );
}
