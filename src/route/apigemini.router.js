import { Router } from 'express';
import { lireEtat } from '../controller/apigemini.controller.js';

const apiRouter = Router();

apiRouter.get('/', lireEtat);

export default apiRouter;
