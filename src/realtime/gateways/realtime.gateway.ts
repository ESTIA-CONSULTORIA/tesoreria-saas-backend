import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const tenantId = client.handshake.auth?.tenantId;
    const companyId = client.handshake.auth?.companyId;
    const branchId = client.handshake.auth?.branchId;

    if (!tenantId) {
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
    @MessageBody() payload: { dashboard: string },
  ) {
    client.join(`dashboard:${payload.dashboard}`);

    return {
      success: true,
      subscribed: payload.dashboard,
    };
  }

  emitTenantEvent(tenantId: string, event: string, payload: any) {
    this.server.to(`tenant:${tenantId}`).emit(event, payload);
  }
}
