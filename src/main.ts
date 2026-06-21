import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { seedDatabase } from './seed/seed';
import { JwtMiddleware } from './auth/jwt.middleware';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    cors: {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'tenant-id', 'x-company-id', 'x-branch-id'],
    },
  });

  // CORS manual — antes de bodyParser y de enableCors
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-tenant-id,tenant-id,x-company-id,x-branch-id');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // Timeout de conexión
  app.use((req, res, next) => {
    res.setTimeout(30000, () => {
      res.status(408).json({ message: 'Request timeout' });
    });
    next();
  });

  // JWT Middleware para decodificar el token y asignar usuario a request.user
  const jwtMiddleware = app.get(JwtMiddleware);
  app.use((req, res, next) => jwtMiddleware.use(req, res, next));

  // Ejecutar seed — errores no deben bloquear el arranque del servidor
  const dataSource = app.get(getDataSourceToken());
  try {
    await seedDatabase(dataSource);
  } catch (seedErr: any) {
    console.error('⚠️ Seed falló pero el servidor continuará:', seedErr?.message ?? seedErr);
  }

  const port = process.env.PORT ?? 3000;
  const host = '0.0.0.0';

  await app.listen(port, host);

  console.log(`Backend corriendo en http://${host}:${port}`);
  console.log(`CORS habilitado para todos los orígenes`);
  console.log(`Timeout de conexión: 30000ms`);
}

bootstrap();