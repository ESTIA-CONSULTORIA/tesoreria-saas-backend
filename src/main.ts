import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { seedDatabase } from './seed/seed';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    credentials: true,
  });

  // Ejecutar seed después de iniciar la aplicación
  const dataSource = app.get(getDataSourceToken());
  await seedDatabase(dataSource);

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();