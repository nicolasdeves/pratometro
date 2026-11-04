import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Valida o valor recebido contra um schema Zod. Use por rota:
 *   @Body(new ZodValidationPipe(loginSchema)) dto: LoginInput
 *
 * Em caso de erro, devolve 400 com a lista de campos inválidos.
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Dados inválidos',
        errors: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
