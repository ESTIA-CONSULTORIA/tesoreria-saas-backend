'use client';

import { useEffect } from 'react';

import { createRealtimeClient } from '../lib/realtime';

export function useDashboardRealtime() {
  useEffect(() => {
    const socket = createRealtimeClient({
      tenantId: 'demo-tenant',
      companyId: 'demo-company',
      branchId: 'demo-branch',
    });

    socket.emit('dashboard.subscribe', {
      dashboard: 'executive',
    });

    socket.on('kpi.updated', (payload) => {
      console.log('Realtime KPI update', payload);
    });

    socket.on('activity.created', (payload) => {
      console.log('Realtime activity', payload);
    });

    return () => {
      socket.disconnect();
    };
  }, []);
}
