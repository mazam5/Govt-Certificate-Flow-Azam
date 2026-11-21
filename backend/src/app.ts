import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { apiRouter } from './routes/index.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { correlationLoggingMiddleware } from './middleware/logging.middleware.js';

export const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: '*',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Structured Pino Logging with Correlation IDs
app.use(correlationLoggingMiddleware);

// Global authentication/persona extractor (supports JWT Bearer & demo headers)
app.use(authMiddleware);

// API Routes
app.use('/api', apiRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: 'CertiFlow - Pragati Skills Mission',
    timestamp: new Date().toISOString(),
  });
});

// Centralized error handling
app.use(errorHandler);
