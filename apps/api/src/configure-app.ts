import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1');

  app.use(helmet());

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
