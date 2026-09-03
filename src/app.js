import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import apiRouter from './routes/index.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

export function createApp(io = null) {
  const app = express();

  // Core Middlewares
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  // Inject Socket.IO instance into every request for controllers to use
  app.use((req, res, next) => {
    req.io = io || req.app.get('io') || null;
    next();
  });

  // Serve Frontend Static UI
  app.use(express.static(publicDir));

  // Mount Health Check at root /health for cloud PaaS & monitoring
  app.get('/health', (req, res, next) => {
    req.url = '/health';
    apiRouter(req, res, next);
  });

  // Mount API Routers (Both /api and /api/v1 for standard API versioning)
  app.use('/api/v1', apiRouter);
  app.use('/api', apiRouter);

  // Serve Frontend Pages
  app.get('/checkout/:code', (req, res) => {
    res.sendFile(path.join(publicDir, 'checkout.html'));
  });

  app.get('/admin', (req, res) => {
    res.sendFile(path.join(publicDir, 'admin.html'));
  });

  app.get('/', (req, res) => {
    res.redirect('/admin');
  });

  // Global Error Handling
  app.use(errorHandler);
  app.use(notFoundHandler);

  return app;
}

export default createApp;
