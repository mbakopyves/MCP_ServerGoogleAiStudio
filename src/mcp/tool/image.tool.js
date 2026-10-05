import * as z from 'zod';
import { modeles } from '../../config.js';
import { ai, messageErreurGemini, optionsAppelDirect } from '../../service/gemini.service.js';
import { cheminSortie, enregistrerBase64, lireMedia } from '../../service/fichier.service.js';
import { reponseErreur } from '../reponse.js';

// Au-delà, l'image n'est pas jointe à la réponse (elle encombrerait le contexte du client) :
// seul son chemin est renvoyé.
const TAILLE_MAX_APERCU = 3.5 * 1024 * 1024;

const schemaEntree = z
  .object({
    prompt: z
      .string()
      .min(1)
      .max(8000)
      .describe(
        "Description de l'image à créer, ou instruction de retouche quand on itère " +
          '(ex. « garde le cadrage mais passe la scène de nuit »).',
      ),
    images_entree: z
      .array(z.string())
      .max(14)
      .optional()
      .describe(
        "Chemins ABSOLUS d'images locales à retoucher ou à utiliser comme références " +
          '(personnage, objet, style). Formats : png, jpg, webp, heic.',
      ),
    interaction_precedente: z
      .string()
      .optional()
      .describe(
        'interaction_id renvoyé par un appel précédent. Gemini reprend la conversation et la ' +
          "dernière image générée : c'est ainsi qu'on itère sans renvoyer l'image.",
      ),
    modele: z
      .enum(modeles.image)
      .default(modeles.image[0])
      .describe(
        'gemini-3.1-flash-image (défaut, polyvalent) · gemini-3-pro-image (qualité max, texte ' +
          'dans l’image, scènes complexes) · gemini-3.1-flash-lite-image (rapide, 1K seulement).',
      ),
    format: z
      .enum(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'])
      .optional()
      .describe("Rapport largeur:hauteur. Par défaut le modèle choisit (ou suit l'image d'entrée)."),
    taille: z.enum(['512', '1K', '2K', '4K']).optional().describe('Résolution de sortie. Défaut : 1K.'),
  })
  .strict();

export function enregistrerOutilImage(serveur) {
  serveur.registerTool(
    'gemini_generer_image',
    {
      title: 'Générer ou retoucher une image (Gemini)',
      description: `Génère une image avec les modèles image de Gemini (« Nano Banana »), ou retouche des images existantes.

L'image est enregistrée sur le disque et jointe à la réponse pour que tu puisses la regarder.

Pour itérer : relis l'image, puis rappelle cet outil avec interaction_precedente = l'interaction_id reçu
et un prompt qui décrit UNIQUEMENT la correction voulue. Gemini garde le contexte (image + échanges).

Renvoie : chemins des fichiers, interaction_id, éventuel commentaire du modèle.`,
      inputSchema: schemaEntree,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params) => {
      try {
        const imagesEntree = await Promise.all((params.images_entree ?? []).map((chemin) => lireMedia(chemin, 'image')));

        const input =
          imagesEntree.length === 0
            ? params.prompt
            : [
                { type: 'text', text: params.prompt },
                ...imagesEntree.map(({ data, mime_type }) => ({ type: 'image', data, mime_type })),
              ];

        const interaction = await ai.interactions.create(
          {
            model: params.modele,
            input,
            previous_interaction_id: params.interaction_precedente,
            response_format:
              params.format || params.taille
                ? { type: 'image', aspect_ratio: params.format, image_size: params.taille }
                : undefined,
          },
          optionsAppelDirect(5 * 60_000),
        );

        const images = extraireImagesDuDernierTour(interaction);
        if (images.length === 0) {
          const raison =
            interaction.errors?.map((e) => e.message).join(' ; ') ||
            interaction.output_text ||
            `statut « ${interaction.status} »`;
          return reponseErreur(
            `Aucune image produite : ${raison}. Reformule le prompt (un refus vient souvent des filtres de sécurité).`,
          );
        }

        const fichiers = [];
        for (const image of images) {
          const chemin = await cheminSortie('images', params.prompt, image.mime_type ?? 'image/png');
          fichiers.push(await enregistrerBase64(chemin, image.data));
        }

        const apercus = images.filter((image) => (image.data.length * 3) / 4 <= TAILLE_MAX_APERCU);
        const lignes = [
          `${fichiers.length} image(s) générée(s) avec ${params.modele} :`,
          ...fichiers.map((f) => `- ${f}`),
          '',
          `interaction_id : ${interaction.id}`,
          '→ passe-le dans interaction_precedente pour retoucher cette image.',
        ];
        if (apercus.length < images.length) {
          lignes.push('', 'Image trop lourde pour être jointe : ouvre le fichier pour la voir.');
        }
        if (interaction.output_text) lignes.push('', `Commentaire du modèle : ${interaction.output_text}`);

        return {
          content: [
            { type: 'text', text: lignes.join('\n') },
            ...apercus.map((image) => ({ type: 'image', data: image.data, mimeType: image.mime_type ?? 'image/png' })),
          ],
          structuredContent: {
            interaction_id: interaction.id,
            modele: params.modele,
            fichiers,
            commentaire: interaction.output_text ?? null,
          },
        };
      } catch (erreur) {
        return reponseErreur(messageErreurGemini(erreur));
      }
    },
  );
}

/**
 * Récupère les images produites par le modèle lors de CE tour.
 * Quand on itère, la réponse peut contenir les étapes des tours précédents :
 * on ne garde que ce qui suit la dernière entrée utilisateur.
 */
function extraireImagesDuDernierTour(interaction) {
  const etapes = interaction.steps ?? [];
  const debutDernierTour = etapes.findLastIndex((etape) => etape.type === 'user_input') + 1;

  const images = etapes
    .slice(debutDernierTour)
    .filter((etape) => etape.type === 'model_output')
    .flatMap((etape) => etape.content ?? [])
    .filter((bloc) => bloc.type === 'image' && bloc.data);

  if (images.length === 0 && interaction.output_image?.data) images.push(interaction.output_image);
  return images;
}
