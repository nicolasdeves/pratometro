import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { RateLimiter } from '../common/rate-limit';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { PasswordLoginGuard } from './guards/password-login.guard';
import {
  googleLoginSchema,
  loginSchema,
  registerSchema,
  type GoogleLoginInput,
  type LoginInput,
  type RegisterInput,
} from './dto/auth.schema';
import type { AuthUser } from './types/jwt-payload';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  // 12 tentativas por minuto por IP nas rotas que aceitam credencial.
  private readonly limiter = new RateLimiter(12, 60_000);

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('config')
  publicConfig() {
    return this.auth.publicConfig();
  }

  @Public()
  @UseGuards(PasswordLoginGuard)
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.limiter.hit(req.ip ?? 'unknown');
    return this.respond(res, await this.auth.register(dto, this.ctx(req)));
  }

  @Public()
  @UseGuards(PasswordLoginGuard)
  @HttpCode(200)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.limiter.hit(req.ip ?? 'unknown');
    return this.respond(res, await this.auth.login(dto, this.ctx(req)));
  }

  @Public()
  @HttpCode(200)
  @Post('google')
  async google(
    @Body(new ZodValidationPipe(googleLoginSchema)) dto: GoogleLoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.limiter.hit(req.ip ?? 'unknown');
    return this.respond(res, await this.auth.loginWithGoogle(dto.credential, this.ctx(req)));
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.refreshCookie(req);
    if (!token) throw new UnauthorizedException('Sem sessão');
    return this.respond(res, await this.auth.refresh(token, this.ctx(req)));
  }

  /**
   * Login com Google no modo redirecionamento (usado no celular): a página vai
   * até o Google e volta com um POST de formulário trazendo o ID token. No
   * iPhone o modo pop-up deixava a aba do Google em branco.
   *
   * CSRF: o Google grava o cookie `g_csrf_token` no nosso domínio e manda o
   * mesmo valor no corpo; os dois precisam bater (double-submit).
   */
  @Public()
  @Post('google/callback')
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const body = req.body as Record<string, unknown> | undefined;
    const credential = typeof body?.credential === 'string' ? body.credential : '';
    const bodyToken = typeof body?.g_csrf_token === 'string' ? body.g_csrf_token : '';
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const cookieToken = cookies?.g_csrf_token;

    if (!credential || !bodyToken || bodyToken !== cookieToken) {
      return res.redirect(303, '/entrar?erro=google');
    }
    try {
      this.limiter.hit(req.ip ?? 'unknown');
      const result = await this.auth.loginWithGoogle(credential, this.ctx(req));
      res.cookie(REFRESH_COOKIE, result.refreshToken, this.cookieOptions());
      // O SPA recupera a sessão sozinho no carregamento (POST /auth/refresh).
      return res.redirect(303, '/');
    } catch {
      return res.redirect(303, '/entrar?erro=google');
    }
  }

  // Público: a "credencial" do logout é o próprio cookie de refresh.
  // Assim quem está com o access token vencido ainda consegue sair.
  @Public()
  @HttpCode(200)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.refreshCookie(req);
    if (token) await this.auth.logout(token);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { ok: true };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  // ── helpers ────────────────────────────────────────────────

  private respond(res: Response, result: Awaited<ReturnType<AuthService['login']>>) {
    res.cookie(REFRESH_COOKIE, result.refreshToken, this.cookieOptions());
    return { accessToken: result.accessToken, user: result.user };
  }

  private refreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax' as const,
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dias
    };
  }

  private ctx(req: Request) {
    return { userAgent: req.headers['user-agent'], ip: req.ip };
  }
}
