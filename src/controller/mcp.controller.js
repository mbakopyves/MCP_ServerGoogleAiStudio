import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { creerServeurMcp } from '../mcp/serveur.js';

// createMcpHandler gère tout le protocole MCP (version 2026-07-28 et repli sur l'ancienne version
// pour les clients qui ne la parlent pas encore). toNodeHandler l'adapte au (req, res) d'Express.
const gestionnaireMcp = toNodeHandler(
  createMcpHandler(creerServeurMcp, { onerror: (erreur) => console.error('[mcp]', erreur) }),
  { onerror: (erreur) => console.error('[mcp]', erreur) },
);

export const traiterRequeteMcp = (req, res) => {
  // express.json() a déjà lu le corps de la requête : on le transmet,
  // sinon le gestionnaire essaierait de relire un flux déjà consommé.
  return gestionnaireMcp(req, res, req.body);
};
