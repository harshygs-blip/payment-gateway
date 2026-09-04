import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import apiRouter from './routes/index.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

export function createApp(io = null) {
  const app = express();

  // Allowed Origins Configuration
  const allowedOrigins = config.allowedOrigins || [
    'https://dealsbyshiv.web.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'
  ];

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, server-to-server, Postman, mobile apps)
      if (!origin) return callback(null, true);

      const normalized = origin.trim().replace(/\/+$/, '').toLowerCase();

      // Read current allowed origins dynamically from config
      const dynamicAllowed = (config.allowedOrigins || [
        'https://dealsbyshiv.web.app',
        'https://dealsbyshiv.firebaseapp.com',
        'https://payment-gateway-ydl1.onrender.com',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000'
      ]).map(s => s.trim().replace(/\/+$/, '').toLowerCase());

      const isAllowed = dynamicAllowed.some(allowed => {
        return allowed === '*' || normalized === allowed;
      }) ||
      normalized.includes('dealsbyshiv') ||
      normalized.includes('onrender.com') ||
      normalized.includes('localhost') ||
      normalized.includes('127.0.0.1');

      if (isAllowed) {
        callback(null, true);
      } else {
        // Allow the request through for public API integration (protected by API Key)
        // rather than breaking with a fatal browser network error
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-Requested-With', 'Accept', 'x-admin-key']
  };

  // Core Middlewares
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
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

  app.get('/docs', (req, res) => {
    res.sendFile(path.join(publicDir, 'docs.html'));
  });

  app.get('/how-to-implement', (req, res) => {
    res.sendFile(path.join(publicDir, 'docs.html'));
  });

  app.get('/', (req, res) => {
    res.redirect('/admin');
  });

  // Global Error Handling (404 catch-all then centralized error handler)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
