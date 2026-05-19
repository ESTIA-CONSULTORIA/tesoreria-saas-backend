import {
  Logger,
} from '@nestjs/common';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(
    RealtimeGateway.name,
  );

  @WebSocketServer()
  server: Server;

  handleConnection(@ConnectedSocket() client: Socket) {
    this.logger.log(
      `Realtime client connected: ${client.id}`,
    );
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.warn(
      `Realtime client disconnected: ${client.id}`,
    );
  }

  emitEvent(event: string, payload: unknown) {
    const normalizedEvent = String(event || '').trim();

    if (!normalizedEvent) {
      this.logger.warn(
        'Intento de emitir evento vacío',
      );

      return;
    }

    const connectedClients =
      this.server.sockets.sockets.size;

    this.logger.log(
      `Realtime event emitted: ${normalizedEvent} :: clients=${connectedClients}`,
    );

    this.server.emit(normalizedEvent, {
      generatedAt: new Date().toISOString(),
      payload,
    });
  }
}
