import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Todas as rotas sob /api: é o que separa a API do SPA no ingress.
  app.setGlobalPrefix('api');

  // Atrás do Traefik (e da Cloudflare): sem isso `req.ip` é sempre o do proxy
  // e o limite de requisições por IP vira um limite global.
  app.set('trust proxy', true);

  app.use(cookieParser());

  // Validação de entrada é feita por rota com Zod (ZodValidationPipe).

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
