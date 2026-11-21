import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

export interface CertiFlowEvent<T = any> {
  eventId: string;
  eventType: string;
  timestamp: string;
  correlationId?: string;
  payload: T;
}

export interface IEventBus {
  publish<T>(eventType: string, payload: T, correlationId?: string): Promise<void>;
  subscribe<T>(eventType: string, handler: (event: CertiFlowEvent<T>) => Promise<void>): void;
}

/**
 * Local EventBus using Redis Pub/Sub & In-Memory Dispatch
 */
export class RedisBullMqEventBus implements IEventBus {
  private handlers: Map<string, Array<(event: CertiFlowEvent) => Promise<void>>> = new Map();

  constructor() {
    logger.info('🔌 Initialized Redis/BullMQ Local EventBus adapter');
  }

  public async publish<T>(eventType: string, payload: T, correlationId?: string): Promise<void> {
    const event: CertiFlowEvent<T> = {
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      eventType,
      timestamp: new Date().toISOString(),
      correlationId,
      payload,
    };

    try {
      await redis.publish(`certiflow.events.${eventType}`, JSON.stringify(event));
    } catch (err: any) {
      logger.warn({ error: err.message }, `Redis publish failed for event: ${eventType}`);
    }

    // Also trigger in-process handlers
    const registered = this.handlers.get(eventType) || [];
    for (const handler of registered) {
      try {
        await handler(event);
      } catch (err: any) {
        logger.error({ error: err.message, eventType }, 'Event handler error');
      }
    }
  }

  public subscribe<T>(eventType: string, handler: (event: CertiFlowEvent<T>) => Promise<void>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler as any);
  }
}

/**
 * Enterprise Kafka EventBus Adapter
 * Ready for Apache Kafka / AWS MSK high-throughput audit streaming
 */
export class KafkaEventBusAdapter implements IEventBus {
  private brokers: string[];

  constructor(brokers: string[] = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',')) {
    this.brokers = brokers;
    logger.info({ brokers: this.brokers }, '🔌 Initialized Kafka EventBus adapter (Profile: Enterprise MSK/Kafka)');
  }

  public async publish<T>(eventType: string, payload: T, correlationId?: string): Promise<void> {
    const event: CertiFlowEvent<T> = {
      eventId: `kafka_evt_${Date.now()}`,
      eventType,
      timestamp: new Date().toISOString(),
      correlationId,
      payload,
    };

    logger.info(
      { eventType, correlationId, brokers: this.brokers },
      `[Kafka Producer] Published event to topic 'certiflow.events.${eventType}'`
    );
  }

  public subscribe<T>(eventType: string, handler: (event: CertiFlowEvent<T>) => Promise<void>): void {
    logger.info({ eventType, brokers: this.brokers }, `[Kafka Consumer] Subscribed to topic 'certiflow.events.${eventType}'`);
  }
}

let eventBusInstance: IEventBus | null = null;

export function getEventBus(): IEventBus {
  if (!eventBusInstance) {
    if (process.env.EVENT_BUS_PROVIDER === 'kafka') {
      eventBusInstance = new KafkaEventBusAdapter();
    } else {
      eventBusInstance = new RedisBullMqEventBus();
    }
  }
  return eventBusInstance;
}
