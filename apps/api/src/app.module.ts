import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'node:path';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { GeminiModule } from './gemini/gemini.module';
import { HealthController } from './health/health.controller';
import { MealsModule } from './meals/meals.module';
import { PlanModule } from './plan/plan.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // Em dev o .env da raiz do monorepo serve de reserva: a chave fica num lugar só.
    // Caminhos a partir de dist/, não do cwd (que muda conforme quem sobe o processo).
    // Em produção as variáveis vêm do ConfigMap/Secret e nenhum arquivo existe.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '..', '.env'), join(__dirname, '..', '..', '..', '.env')],
    }),
    PrismaModule,
    GeminiModule,
    AuthModule,
    MealsModule,
    PlanModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
