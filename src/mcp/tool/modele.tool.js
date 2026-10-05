import * as z from 'zod';
import { ai, messageErreurGemini } from '../../service/gemini.service.js';
import { reponseErreur, reponseTexte } from '../reponse.js';

const FILTRES = {
  image: /image|imagen|nano-banana/,
  video: /veo|omni/,
  media: /image|imagen|nano-banana|veo|omni/,
  tous: /./,
};

const schemaEntree = z
  .object({
    categorie: z
      .enum(['media', 'image', 'video', 'tous'])
      .default('media')
      .describe('media = modèles image + vidéo (défaut) · tous = tous les modèles de la clé.'),
  })
  .strict();

export function enregistrerOutilModeles(serveur) {
  serveur.registerTool(
    'gemini_lister_modeles',
    {
      title: 'Lister les modèles Gemini disponibles',
      description:
        'Liste les modèles accessibles avec la clé AI Studio configurée. Utile si un modèle est refusé (404) ' +
        'ou pour découvrir un modèle plus récent que ceux proposés par les autres outils.',
      inputSchema: schemaEntree,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ categorie }) => {
      try {
        const trouves = [];
        for await (const modele of await ai.models.list({ config: { pageSize: 100 } })) {
          const id = modele.name?.replace(/^models\//, '');
          if (id && FILTRES[categorie].test(id)) trouves.push({ id, nom: modele.displayName ?? id });
        }

        if (trouves.length === 0) return reponseTexte(`Aucun modèle trouvé pour la catégorie « ${categorie} ».`);
        const lignes = trouves.map((m) => `- ${m.id} — ${m.nom}`);
        return reponseTexte(`${trouves.length} modèle(s) :\n${lignes.join('\n')}`, { modeles: trouves });
      } catch (erreur) {
        return reponseErreur(messageErreurGemini(erreur));
      }
    },
  );
}
