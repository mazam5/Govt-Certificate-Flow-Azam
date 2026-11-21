import { app } from './app.js';
import { config } from './config/env.js';
import { startWorkers } from './workers/index.js';

async function bootstrap() {
  try {
    // Start background workers in same process for convenience in local dev
    if (process.env.START_WORKERS !== 'false') {
      startWorkers();
    }

    app.listen(config.port, () => {
      console.log(`✨ CertiFlow API Server running at http://localhost:${config.port}`);
      console.log(`🌐 Environment: ${config.nodeEnv}`);
      console.log(`📡 Real-time SSE Stream: http://localhost:${config.port}/api/events/stream`);
      console.log(`🔍 Public Verification: http://localhost:${config.port}/api/verify/:certNumber`);
    });
  } catch (error) {
    console.error('Fatal startup error:', error);
    process.exit(1);
  }
}

bootstrap();
