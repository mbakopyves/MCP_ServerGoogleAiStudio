import * as z from 'zod';
import { modeles } from '../../config.js';
import { ai, messageErreurGemini } from '../../service/gemini.service.js';
import { lireMedia } from '../../service/fichier.service.js';
import { reponseErreur, reponseTexte } from '../reponse.js';

// Claude ne peut pas regarder une vidéo. Pour itérer sur une vidéo générée, il demande à Gemini
// de la regarder à sa place et de lister ce qui ne colle pas au prompt.

const schemaEntree = z
  .object({
    chemin: z.string().describe('Chemin ABSOLU de l’image ou de la vidéo à analyser (20 Mo max).'),
    question: z
      .string()
      .min(1)
      .max(4000)
      .default('Décris précisément ce média : contenu, cadrage, mouvements, sons, texte visible, défauts éventuels.')
      .describe(
        'Ce que tu veux savoir. Pour itérer, donne le prompt d’origine et demande les écarts : ' +
          '« Ce rendu respecte-t-il ce prompt : … ? Liste les défauts visibles, avec leur moment. »',
      ),
  })
  .strict();

export function enregistrerOutilAnalyse(serveur) {
  serveur.registerTool(
    'gemini_analyser_media',
    {
      title: 'Analyser une image ou une vidéo (Gemini)',
      description: `Fait regarder une image ou une vidéo locale par Gemini et renvoie sa réponse en texte.

Sert surtout à contrôler une vidéo générée (que tu ne peux pas regarder toi-même) avant de décider
d'une correction : compare le rendu au prompt, repère les artefacts, vérifie l'audio et les dialogues.`,
      inputSchema: schemaEntree,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ chemin, question }) => {
      try {
        const media = await lireMedia(chemin, 'media');
        const interaction = await ai.interactions.create(
          {
            model: modeles.analyse,
            input: [
              { type: 'text', text: question },
              { type: media.categorie, data: media.data, mime_type: media.mime_type },
            ],
          },
          { timeout_ms: 5 * 60_000 },
        );
        if (!interaction.output_text) {
          return reponseErreur(`Gemini n’a rien répondu (statut « ${interaction.status} »).`);
        }
        return reponseTexte(interaction.output_text);
      } catch (erreur) {
        return reponseErreur(messageErreurGemini(erreur));
      }
    },
  );
}
