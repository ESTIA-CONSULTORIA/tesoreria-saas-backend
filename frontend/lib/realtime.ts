import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000';

export function createRealtimeClient(context: {
  tenantId: string;
  companyId?: string;
  branchId?: string;
}) {
  return io(SOCKET_URL, {
    auth: context,
    transports: ['websocket'],
  });
}
