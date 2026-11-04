import { z } from 'zod';

const description = z
  .string()
  .trim()
  .max(1000, 'A descrição pode ter até 1000 caracteres')
  .optional()
  .transform((v) => v || undefined);

const clarification = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().max(500),
});

/** Campos de texto da etapa de perguntas (multipart, junto da foto e do áudio). */
export const mealQuestionsInputSchema = z.object({ description });
export type MealQuestionsInput = z.infer<typeof mealQuestionsInputSchema>;

/** Campos de texto que chegam junto da foto (multipart). */
export const createMealSchema = z.object({
  description,
  eatenAt: z.iso.datetime({ offset: true, message: 'Data inválida' }).optional(),
  // Multipart só carrega texto: as perguntas e respostas vêm como JSON.
  clarifications: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      try {
        return JSON.parse(v) as unknown;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Respostas inválidas' });
        return z.NEVER;
      }
    })
    .pipe(z.array(clarification).max(3).optional()),
});
export type CreateMealInput = z.infer<typeof createMealSchema>;

/** Intervalo do diário. O navegador manda o início e o fim do período no fuso dele. */
export const listMealsSchema = z.object({
  from: z.iso.datetime({ offset: true, message: 'Data inválida' }),
  to: z.iso.datetime({ offset: true, message: 'Data inválida' }),
});
export type ListMealsInput = z.infer<typeof listMealsSchema>;

/** Ajuste de porção de um alimento (ou remoção, com grams = 0). */
export const updateItemSchema = z.object({
  grams: z.number().min(0, 'Porção inválida').max(5000, 'Porção grande demais'),
});
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
