import { Response } from 'express';

export interface SseEvent {
  type: string;
  data: any;
  timestamp: string;
}

class SseHub {
  private clients: Set<Response> = new Set();

  public addClient(res: Response): void {
    this.clients.add(res);

    // Initial keepalive handshake
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Connected to CertiFlow real-time SSE stream' })}\n\n`);

    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  public removeClient(res: Response): void {
    this.clients.delete(res);
  }

  public broadcast(type: string, data: any): void {
    const eventPayload: SseEvent = {
      type,
      data,
      timestamp: new Date().toISOString(),
    };

    const payloadString = `event: ${type}\ndata: ${JSON.stringify(eventPayload)}\n\n`;

    for (const client of this.clients) {
      try {
        client.write(payloadString);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  public getClientCount(): number {
    return this.clients.size;
  }
}

export const sseHub = new SseHub();
