import app from './src/app.js';
import { config } from './src/config.js';

app.listen(config.port, config.host, () => {
  console.log(`Serveur MCP Gemini prêt sur http://${config.host}:${config.port}/mcp`);
  console.log(`Fichiers générés dans ${config.dossierSortie}`);
});
