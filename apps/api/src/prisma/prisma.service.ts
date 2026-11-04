import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { prisma, PrismaClient } from '@pratometro/database';

/**
 * Expõe a instância singleton do pacote `database` como um provider
 * injetável do Nest.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient = prisma;

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
