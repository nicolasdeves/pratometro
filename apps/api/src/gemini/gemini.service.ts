import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, GoogleGenAI, type Part } from '@google/genai';
import { z, type ZodType } from 'zod';

/** Arquivo enviado junto do prompt (foto, áudio, PDF...). */
export interface InlineFile {
  data: Buffer;
  mimeType: string;
}

export interface JsonRequest<T> {
  /** Instruções fixas: quem o modelo é e como deve responder. */
  system: string;
  /** Conteúdo da vez, na ordem: arquivos e textos. */
  parts: (string | InlineFile)[];
  /** Formato da resposta. Vira JSON Schema para o Gemini e valida o retorno. */
  schema: ZodType<T>;
}

export interface JsonResult<T> {
  data: T;
  /** Modelo que de fato respondeu (pode ser um reserva). */
  model: string;
}

// Sobrecarga, cota ou prazo estourado: vale tentar de novo / outro modelo.
const RETRYABLE = new Set([429, 500, 503, 504]);
// Por tentativa. Somadas, as tentativas ainda cabem no que a pessoa espera.
const ATTEMPT_TIMEOUT_MS = 60_000;
// Pico de 503 costuma passar em segundos: o principal ganha uma 2ª chance.
const PRIMARY_RETRY_DELAY_MS = 2_000;

/**
 * Único ponto de contato com a API do Gemini. A chave fica só no servidor;
 * o navegador nunca fala direto com o Google.
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly ai: GoogleGenAI | null;
  /** Modelo principal seguido dos reservas, na ordem em que são tentados. */
  private readonly models: string[];

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('GEMINI_API_KEY');
    const primary = config.get<string>('GEMINI_MODEL') || 'gemini-3.5-flash';
    const fallbacks = (config.get<string>('GEMINI_FALLBACK_MODELS') ?? 'gemini-3.1-flash-lite')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    this.models = [...new Set([primary, ...fallbacks])];
    this.ai = apiKey
      ? new GoogleGenAI({ apiKey, httpOptions: { timeout: ATTEMPT_TIMEOUT_MS } })
      : null;
  }

  /**
   * Gera uma resposta em JSON (saída estruturada) e valida com o schema.
   * Se o modelo estiver sobrecarregado: tenta o principal mais uma vez e
   * depois passa para os reservas, em ordem.
   */
  async generateJson<T>({ system, parts, schema }: JsonRequest<T>): Promise<JsonResult<T>> {
    if (!this.ai) throw new ServiceUnavailableException('GEMINI_API_KEY não configurada');

    const contents = [{ role: 'user', parts: parts.map(toPart) }];
    const responseJsonSchema = z.toJSONSchema(schema);

    const [primary, ...fallbacks] = this.models;
    const attempts = [primary, primary, ...fallbacks];

    let quotaExceeded = false;
    for (const [i, model] of attempts.entries()) {
      // Cota estourada (429) não volta em 2 s: pula a 2ª chance do principal.
      if (i === 1 && quotaExceeded) continue;
      if (i === 1) await sleep(PRIMARY_RETRY_DELAY_MS);
      const started = Date.now();
      let text: string | undefined;
      try {
        const res = await this.ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: system,
            responseMimeType: 'application/json',
            responseJsonSchema,
          },
        });
        text = res.text;
        const usage = res.usageMetadata;
        this.logger.log(
          `${model} ${Date.now() - started}ms in=${usage?.promptTokenCount} out=${usage?.candidatesTokenCount} thoughts=${usage?.thoughtsTokenCount ?? 0}`,
        );
      } catch (err) {
        const last = i === attempts.length - 1;
        // Erro de rede/timeout do próprio cliente não vem como ApiError: também vale tentar de novo.
        const transient = !(err instanceof ApiError) || RETRYABLE.has(err.status);
        const retry = transient && !last;
        if (err instanceof ApiError && err.status === 429) quotaExceeded = true;
        this.logger.warn(
          `${model} falhou em ${Date.now() - started}ms${retry ? ', tentando de novo' : ''}: ${String(err)}`,
        );
        if (retry) continue;
        throw new BadGatewayException('A IA não respondeu. Tente de novo em instantes.');
      }

      const parsed = schema.safeParse(JSON.parse(text ?? 'null'));
      if (!parsed.success) {
        this.logger.error(`${model} respondeu fora do schema: ${text}`);
        throw new BadGatewayException('A IA respondeu num formato inesperado. Tente de novo.');
      }
      return { data: parsed.data, model };
    }
    throw new BadGatewayException('A IA não respondeu. Tente de novo em instantes.');
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPart(p: string | InlineFile): Part {
  if (typeof p === 'string') return { text: p };
  return { inlineData: { data: p.data.toString('base64'), mimeType: p.mimeType } };
}
