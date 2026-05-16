import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationCenterService {
  async sendNotification(payload: {
    tenantId: string;
    userId?: string;
    title: string;
    message?: string;
    type: string;
    severity?: string;
  }) {
    // Future implementation:
    // - websocket push
    // - email
    // - mobile push
    // - alert center
    // - activity feed

    return {
      success: true,
      sent: true,
      type: payload.type,
    };
  }
}
