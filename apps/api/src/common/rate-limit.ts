import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Limite simples em memória por chave (IP ou usuário), janela deslizante.
 * Uma réplica só: não precisa de Redis. Protege as rotas públicas de força
 * bruta e, mais adiante, a cota da API do Gemini.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  hit(key: string) {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      throw new HttpException('Muitas tentativas. Aguarde um pouco.', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.hits.set(key, recent);
  }
}
