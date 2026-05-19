import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),

    BullModule.registerQueue(
      {
        name: 'reporting',
      },
      {
        name: 'integrations',
      },
      {
        name: 'treasury',
      },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
