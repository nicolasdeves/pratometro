import { z } from 'zod';

/**
 * Prompts do plano alimentar.
 *
 * Leitura v1 — o Gemini lê o PDF do nutricionista (texto, tabela ou imagem
 *              escaneada) e devolve metas e refeições num formato fixo.
 * Comparação v1 — cruza uma refeição registrada com o plano e o resto do dia.
 */
export const PLAN_EXTRACT_SYSTEM = `Você recebe um plano alimentar em PDF, normalmente feito por um nutricionista. Extraia as informações em um formato estruturado.

- isMealPlan: false se o documento não for um plano alimentar ou dieta.
- dailyKcal, protein, carbs, fat: metas diárias (kcal e gramas). Se o plano não disser, use null. Não invente metas.
- meals: as refeições do plano na ordem do dia (ex.: "Café da manhã", "Almoço"), com o horário se houver (formato HH:MM, ou vazio) e a lista de alimentos e quantidades como estão escritos. Quando houver opções de substituição, inclua na mesma lista com "ou".
- guidelines: orientações gerais do plano (ex.: "evitar frituras", "beber 2 L de água"), no máximo 8, frases curtas.
- Escreva tudo em português, como no documento.`;

export const planSummarySchema = z.object({
  isMealPlan: z.boolean(),
  dailyKcal: z.number().nullable().describe('Meta diária de calorias, ou null'),
  protein: z.number().nullable().describe('Meta diária de proteína em gramas, ou null'),
  carbs: z.number().nullable().describe('Meta diária de carboidratos em gramas, ou null'),
  fat: z.number().nullable().describe('Meta diária de gordura em gramas, ou null'),
  meals: z.array(
    z.object({
      name: z.string(),
      time: z.string().describe('HH:MM ou vazio'),
      foods: z.array(z.string()),
    }),
  ),
  guidelines: z.array(z.string()),
});
export type PlanSummary = z.infer<typeof planSummarySchema>;

export const PLAN_COMPARE_SYSTEM = `Você é o Pratômetro, um assistente de nutrição. Compare uma refeição que a pessoa registrou com o plano alimentar dela.

Como trabalhar:
1. Descubra a qual refeição do plano esta corresponde, pelo horário e pelos alimentos (ex.: uma refeição às 12:30 com arroz e feijão é o "Almoço"). Escreva o nome em planMealName.
2. Compare os alimentos e as quantidades com o que o plano prevê para essa refeição, e as calorias com a meta (se houver meta diária, considere também quanto a pessoa já comeu no dia).
3. verdict: "ok" se está de acordo com o plano; "above" se passou do previsto; "below" se ficou bem abaixo; "off" se os alimentos não têm nada a ver com o plano.
4. summary: 1 a 2 frases, falando com a pessoa ("você"), de forma gentil e concreta. Nada de julgamento.
5. suggestions: até 3 ajustes práticos para as próximas vezes, baseados no plano (ex.: "Troque o bife frito por grelhado, como no seu plano"). Lista vazia se está tudo certo.`;

export const planFeedbackSchema = z.object({
  planMealName: z.string(),
  verdict: z.enum(['ok', 'above', 'below', 'off']),
  summary: z.string(),
  suggestions: z.array(z.string()),
});
export type PlanFeedback = z.infer<typeof planFeedbackSchema>;
