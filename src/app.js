import { createMcpExpressApp } from '@modelcontextprotocol/express';
import morgan from 'morgan';
import { config } from './config.js';
import apiRouter from './route/apigemini.router.js';
import mcpRouter from './route/mcp.router.js';

// createMcpExpressApp = express() + express.json() + deux protections pour un serveur local :
// - en-tête Host vérifié : bloque les attaques « DNS rebinding »
// - en-tête Origin vérifié : un site web ouvert dans ton navigateur ne peut pas appeler tes outils
// (c'est pour ça que cors() a disparu : il autorisait justement n'importe quel site.)
const app = createMcpExpressApp({ host: config.host });
app.use(morgan('dev'));

app.use('/api', apiRouter);
app.use('/mcp', mcpRouter);

export default app;
