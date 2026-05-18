import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from './app.module';
import { runBaseOrganizationSeed } from './database/seeds/run-base-organization.seed';
import { runBaseFinancialSeed } from './database/seeds/run-base-financial.seed';
import { runBaseSubscriptionSeed } from './database/seeds/run-base-subscription.seed';
import { runBasePlansSeed } from './database/seeds/run-base-plans.seed';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  const dataSource = app.get(DataSource);

  await runBaseOrganizationSeed(dataSource);
  await runBaseFinancialSeed(dataSource);
  await runBasePlansSeed(dataSource);
  await runBaseSubscriptionSeed(dataSource);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
