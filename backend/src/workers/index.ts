import { issuanceWorker } from './issuance.worker.js';
import { whatsappWorker } from './whatsapp.worker.js';
import { slaWorker } from './sla.worker.js';

export function startWorkers() {
  console.log('👷 Background workers initialized:');
  console.log('   - Issuance Worker (BullMQ + PDFKit + QR Code)');
  console.log('   - WhatsApp Worker (Mock Gateway + 20% Failures + Exponential Backoff)');
  console.log('   - SLA Escalation Worker (Delayed Jobs + State Alerts)');

  const shutdown = async () => {
    console.log('🛑 Shutting down workers gracefully...');
    await Promise.all([
      issuanceWorker.close(),
      whatsappWorker.close(),
      slaWorker.close(),
    ]);
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// If executed directly
if (process.argv[1]?.endsWith('workers/index.ts') || process.argv[1]?.endsWith('workers/index.js')) {
  startWorkers();
}
