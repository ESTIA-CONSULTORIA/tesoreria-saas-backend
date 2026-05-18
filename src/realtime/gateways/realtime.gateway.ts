import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const tenantId = String(
      client.handshake.auth?.tenantId || '',
    ).trim();

    const companyId = String(
      client.handshake.auth?.companyId || '',
    ).trim();

    const branchId = String(
      client.handshake.auth?.branchId || '',
    ).trim();

    if (!tenantId) {
      this.logger.warn(
        `Socket rechazado sin tenantId: ${client.id}`,
      );

      client.disconnect();
      return;
    }

    client.join(`tenant:${tenantId}`);

    if (companyId) {
      client.join(`company:${companyId}`);
    }

    if (branchId) {
      client.join(`branch:${branchId}`);
    }
  }

  @SubscribeMessage('dashboard.subscribe')
  subscribeDashboard(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { dashboard?: string },
  ) {
    const dashboard = String(payload?.dashboard || '').trim();

    if (!dashboard) {
      return {
        success: false,
        error: 'Dashboard inválido',
      };
    }

    client.join(`dashboard:${dashboard}`);

    return {
      success: true,
      subscribed: dashboard,
    };
  }

  emitTenantEvent(
    tenantId: string,
    event: string,
    payload: unknown,
  ) {
    if (!tenantId || !event) {
      return;
    }

    this.server
      .to(`tenant:${tenantId}`)
      .emit(event, payload);
  }
}
