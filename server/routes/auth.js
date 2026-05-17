import express from 'express';
import { getEntity, upsertEntity } from '../db.js';

export const authRouter = express.Router();

authRouter.get('/me', (_req, res) => {
  res.json(getEntity('User', 'local-user'));
});

authRouter.patch('/me', (req, res) => {
  res.json(upsertEntity('User', 'local-user', req.body || {}));
});
