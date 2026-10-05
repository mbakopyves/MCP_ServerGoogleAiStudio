import { Router } from 'express';
import { traiterRequeteMcp } from '../controller/mcp.controller.js';

const mcpRouter = Router();

// Un seul point d'entrée : le protocole MCP passe tout en POST (et GET/DELETE pour les anciens clients).
mcpRouter.all('/', traiterRequeteMcp);

export default mcpRouter;
