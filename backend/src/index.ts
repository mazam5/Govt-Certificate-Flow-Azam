import { app } from './app.js';
import { config } from './config/env.js';
import { prisma } from './config/prisma.js';
import { DEFAULT_PERSONAS } from './middleware/auth.js';
import { Role } from '@prisma/client';
import { startWorkers } from './workers/index.js';

async function ensureSeedData() {
  try {
    const centre = await prisma.trainingCentre.upsert({
      where: { code: 'TC-DISTA-001' },
      update: {},
      create: {
        id: 'tc-dista-001',
        name: 'Pragati Training Centre - District A',
        code: 'TC-DISTA-001',
        district: 'District A',
      },
    });

    for (const p of Object.values(DEFAULT_PERSONAS)) {
      await prisma.user.upsert({
        where: { email: p.email },
        update: {
          name: p.name,
          role: p.role,
          district: p.district,
          centreId: p.role === Role.TRAINING_CENTRE ? centre.id : null,
        },
        create: {
          id: p.id,
          name: p.name,
          email: p.email,
          role: p.role,
          district: p.district,
          centreId: p.role === Role.TRAINING_CENTRE ? centre.id : null,
        },
      });
    }
    console.log('🌱 Seed personas verified and synchronized in PostgreSQL.');
  } catch (err: any) {
    console.warn('Notice: Seed sync notice:', err.message);
  }
}

async function bootstrap() {
  try {
    // Ensure seeded review personas and training centres exist in PostgreSQL
    await ensureSeedData();

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
