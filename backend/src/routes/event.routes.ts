import { Router, Request, Response } from 'express';
import { sseHub } from '../events/sse.js';

export const eventRouter = Router();

eventRouter.get('/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  sseHub.addClient(res);
});

eventRouter.get('/stats', (req: Request, res: Response) => {
  res.json({
    success: true,
    connectedClients: sseHub.getClientCount(),
  });
});
