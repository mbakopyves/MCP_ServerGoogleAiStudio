import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

// Au-delà, Gemini refuse les médias envoyés directement dans la requête.
const TAILLE_MAX_ENTREE = 20 * 1024 * 1024;

const TYPES_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.mp4': 'video/mp4',
  '.mov': 'video/mov',
  '.webm': 'video/webm',
  '.mpeg': 'video/mpeg',
};

const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4' };

/**
 * Lit un fichier local et le renvoie en base64, prêt à être envoyé à Gemini.
 * @param {string} chemin chemin absolu du fichier
 * @param {'image' | 'video' | 'media'} categorie ce qu'on accepte ('media' = image ou vidéo)
 * @returns {Promise<{ data: string, mime_type: string, categorie: 'image' | 'video' }>}
 */
export async function lireMedia(chemin, categorie = 'media') {
  // Le client MCP (Claude Code, Cursor…) ne tourne pas dans le même dossier que ce serveur :
  // un chemin relatif serait ambigu, on exige donc un chemin absolu.
  if (!path.isAbsolute(chemin)) {
    throw new Error(`Le chemin « ${chemin} » doit être absolu (ex. /home/moi/images/photo.png).`);
  }

  const mime = TYPES_MIME[path.extname(chemin).toLowerCase()];
  const categorieFichier = mime?.split('/')[0];
  if (!mime || (categorie !== 'media' && categorie !== categorieFichier)) {
    const attendus = Object.keys(TYPES_MIME)
      .filter((ext) => categorie === 'media' || TYPES_MIME[ext].startsWith(categorie))
      .join(', ');
    throw new Error(`Format non pris en charge pour « ${chemin} ». Formats acceptés : ${attendus}.`);
  }

  let infos;
  try {
    infos = await fs.stat(chemin);
  } catch {
    throw new Error(`Fichier introuvable : ${chemin}`);
  }
  if (infos.size > TAILLE_MAX_ENTREE) {
    throw new Error(`« ${chemin} » dépasse 20 Mo (${(infos.size / 1024 / 1024).toFixed(1)} Mo).`);
  }

  const contenu = await fs.readFile(chemin);
  return { data: contenu.toString('base64'), mime_type: mime, categorie: categorieFichier };
}

/**
 * Construit un chemin de sortie lisible et unique, ex. :
 * generations/images/2026-10-05_14-32-07-un-chat-roux-sur-un-toit.png
 */
export async function cheminSortie(sousDossier, prompt, mime) {
  const dossier = path.join(config.dossierSortie, sousDossier);
  await fs.mkdir(dossier, { recursive: true });

  const horodatage = new Date().toISOString().slice(0, 19).replace('T', '_').replaceAll(':', '-');
  const slug = prompt
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const suffixe = Math.random().toString(36).slice(2, 6); // évite les collisions dans la même seconde

  return path.join(dossier, `${horodatage}-${slug || 'sans-titre'}-${suffixe}.${EXTENSIONS[mime] ?? 'bin'}`);
}

/** Écrit un contenu base64 sur le disque. */
export async function enregistrerBase64(chemin, base64) {
  await fs.writeFile(chemin, Buffer.from(base64, 'base64'));
  return chemin;
}
