import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { User } from '@pratometro/database';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginInput, RegisterInput } from './dto/auth.schema';
import type { JwtPayload } from './types/jwt-payload';

const BCRYPT_ROUNDS = 12;
const REFRESH_TTL_DAYS = 30;

export interface AuthContext {
  userAgent?: string;
  ip?: string;
}

/** O que o front recebe sobre a pessoa logada. */
export interface PublicUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
  dailyKcalGoal: number | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterInput, ctx: AuthContext = {}) {
    const existing = await this.prisma.client.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Este e-mail já tem cadastro. Entre com ele.');
    }

    const user = await this.prisma.client.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        lastLoginAt: new Date(),
      },
    });
    return this.issueTokens(user, ctx);
  }

  async login(dto: LoginInput, ctx: AuthContext = {}) {
    const user = await this.prisma.client.user.findUnique({ where: { email: dto.email } });

    // Compara sempre (mesmo sem user ou sem senha) para não vazar quais contas existem.
    const ok = await bcrypt.compare(
      dto.password,
      user?.password ?? '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinv',
    );
    if (!user || !user.password || !ok) {
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }

    const updated = await this.prisma.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.issueTokens(updated, ctx);
  }

  /**
   * Login e cadastro pelo Google são a mesma porta: se não houver conta com
   * esse Google nem com esse e-mail, ela é criada na hora. Se houver conta por
   * e-mail/senha, o Google é vinculado a ela (o e-mail veio verificado).
   */
  async loginWithGoogle(credential: string, ctx: AuthContext = {}) {
    const google = await this.verifyGoogle(credential);
    const existing = await this.prisma.client.user.findFirst({
      where: { OR: [{ googleId: google.sub }, { email: google.email }] },
    });

    const user = existing
      ? await this.prisma.client.user.update({
          where: { id: existing.id },
          data: {
            googleId: existing.googleId ?? google.sub,
            name: existing.name ?? google.name,
            avatarUrl: google.picture ?? existing.avatarUrl,
            lastLoginAt: new Date(),
          },
        })
      : await this.prisma.client.user.create({
          data: {
            email: google.email,
            name: google.name,
            googleId: google.sub,
            avatarUrl: google.picture,
            lastLoginAt: new Date(),
          },
        });
    return this.issueTokens(user, ctx);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.client.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return this.toPublic(user);
  }

  publicConfig(): { googleClientId: string | null; passwordLogin: boolean } {
    return {
      googleClientId: this.config.get<string>('GOOGLE_CLIENT_ID') || null,
      passwordLogin: this.passwordLoginEnabled(),
    };
  }

  /**
   * Login/cadastro com e-mail e senha. Em produção o único acesso é pelo Google;
   * a senha só existe para testes locais e precisa ser ligada explicitamente
   * com AUTH_PASSWORD_LOGIN=true.
   */
  passwordLoginEnabled(): boolean {
    return this.config.get<string>('AUTH_PASSWORD_LOGIN') === 'true';
  }

  /** Rotação: valida o refresh, revoga o antigo e emite um novo par. */
  async refresh(rawToken: string, ctx: AuthContext = {}) {
    const record = await this.prisma.client.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
      include: { user: true },
    });
    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Sessão expirada');
    }

    await this.prisma.client.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(record.user, ctx);
  }

  async logout(rawToken: string) {
    await this.prisma.client.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async verifyGoogle(
    credential: string,
  ): Promise<{ sub: string; email: string; name: string | null; picture: string | null }> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new ServiceUnavailableException('Login com Google não configurado.');
    }
    try {
      const ticket = await new OAuth2Client(clientId).verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.email || !payload.email_verified) {
        throw new Error('e-mail não verificado');
      }
      return {
        sub: payload.sub,
        email: payload.email.toLowerCase(),
        name: payload.name ?? null,
        picture: payload.picture ?? null,
      };
    } catch {
      throw new UnauthorizedException('Não foi possível validar o login do Google.');
    }
  }

  /** Emite access (JWT curto) + refresh (opaco, hash no banco). */
  private async issueTokens(user: User, ctx: AuthContext) {
    const payload: JwtPayload = { sub: user.id, email: user.email };

    const accessToken = await this.jwt.signAsync({ ...payload }, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
    } as JwtSignOptions);

    const rawRefresh = randomBytes(48).toString('hex');
    await this.prisma.client.refreshToken.create({
      data: {
        tokenHash: this.hashToken(rawRefresh),
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      },
    });

    return { accessToken, refreshToken: rawRefresh, user: this.toPublic(user) };
  }

  private toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      hasPassword: !!user.password,
      dailyKcalGoal: user.dailyKcalGoal,
    };
  }

  /** SHA-256 do refresh — nunca guardamos o valor cru no banco. */
  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
