import {
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from './app.module';
import { validateEnvironment } from './config/env.validation';
import { runBaseFinancialSeed } from './database/seeds/run-base-financial.seed';
import { runBaseOrganizationSeed } from './database/seeds/run-base-organization.seed';
import { runBasePlansSeed } from './database/seeds/run-base-plans.seed';
import { runBaseSubscriptionSeed } from './database/seeds/run-base-subscription.seed';

async function bootstrap() {
  validateEnvironment();

  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const dataSource = app.get(DataSource);

  try {
    await runBaseOrganizationSeed(dataSource);
    await runBaseFinancialSeed(dataSource);
    await runBasePlansSeed(dataSource);
    await runBaseSubscriptionSeed(dataSource);

    logger.log('Seeds ejecutados correctamente');
  } catch (error) {
    logger.error(
      'Error ejecutando seeds',
      error instanceof Error ? error.stack : undefined,
    );
  }

  const port = Number(process.env.PORT || 3000);

  await app.listen(port);

  logger.log(`Backend ejecutándose en puerto ${port}`);
}

bootstrap();
