import {
  Logger,
} from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
})
export class RealtimeGateway {
  private readonly logger = new Logger(
    RealtimeGateway.name,
  );

  @WebSocketServer()
  server: Server;

  emitEvent(event: string, payload: unknown) {
    const normalizedEvent = String(event || '').trim();

    if (!normalizedEvent) {
      this.logger.warn(
        'Intento de emitir evento vacío',
      );

      return;
    }

    this.logger.log(
      `Realtime event emitted: ${normalizedEvent}`,
    );

    this.server.emit(normalizedEvent, {
      generatedAt: new Date().toISOString(),
      payload,
    });
  }
}
