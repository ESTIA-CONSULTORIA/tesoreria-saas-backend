import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from './app.module';
import { runBaseFinancialSeed } from './database/seeds/run-base-financial.seed';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  const dataSource = app.get(DataSource);

  await runBaseFinancialSeed(dataSource);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
