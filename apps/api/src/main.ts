import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  const port = Number(process.env.PORT ?? 4000);

  await app.listen(port);

  console.log(`OutbreakWatch API running on port ${port}`);
}

bootstrap();
