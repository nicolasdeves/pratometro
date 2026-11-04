import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../types/jwt-payload';

/** Injeta o usuário autenticado (req.user) num parâmetro do controller. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
