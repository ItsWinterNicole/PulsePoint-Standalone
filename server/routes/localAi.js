import express from 'express';
import { getLocalTextSynthesisHealth } from '../services/localTextSynthesis.js';

export const localAiRouter = express.Router();

localAiRouter.get('/health', async (_req, res) => {
  res.json(await getLocalTextSynthesisHealth());
});
