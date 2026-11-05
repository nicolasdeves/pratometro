import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { AuthService } from '../auth.service';

/**
 * Rotas de e-mail e senha. Sem AUTH_PASSWORD_LOGIN=true elas respondem 404,
 * antes até de validar o corpo: em produção o único acesso é pelo Google.
 */
@Injectable()
export class PasswordLoginGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  canActivate(): boolean {
    if (!this.auth.passwordLoginEnabled()) throw new NotFoundException();
    return true;
  }
}
